import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { flattenToc, parseText } from '../../src/core/parser';
import {
    applySuggestionsToContent,
    buildOutlineFallbackSuggestions,
    buildSuggestSectionsPrompt,
    extractRegexOutlineSymbols,
    parseSuggestSectionsResponse,
} from '../../src/core/promptCodec';
import { OutlineSymbolInput, TocNode } from '../../src/core/types';

describe('promptCodec: buildSuggestSectionsPrompt', () => {
    it('numbers lines 1-indexed, formats target comment examples, and lists existing headings', () => {
        const content = ['// # Existing Header', 'const a = 1;', 'export function run() {}'].join(
            '\n'
        );
        const existingHeadings: TocNode[] = [
            {
                label: 'Existing Header',
                level: 1,
                line: 0,
                children: [
                    {
                        label: 'Nested Sub',
                        level: 2,
                        line: 1,
                        children: [],
                    },
                ],
            },
        ];

        const prompt = buildSuggestSectionsPrompt({
            content,
            languageId: 'typescript',
            existingHeadings,
            maxSuggestions: 8,
        });

        assert.match(prompt, /1: \/\/ # Existing Header/);
        assert.match(prompt, /2: const a = 1;/);
        assert.match(prompt, /3: export function run\(\) \{\}/);
        assert.match(prompt, /Level 1: \/\/ # Main Section/);
        assert.match(prompt, /Level 2: \/\/ ## Sub Section/);
        assert.match(prompt, /Level 3: \/\/ ### Detail/);
        assert.match(prompt, /- Line 1 \(Level 1\): Existing Header/);
        assert.match(prompt, /- Line 2 \(Level 2\): Nested Sub/);
        assert.match(prompt, /at most 8 new section headings/);
    });

    it('uses custom headingMarkers in prompt examples and truncates huge files safely', () => {
        const hugeLines = Array.from({ length: 20 }, (_, i) => `x_${i} = ${i}`);
        const prompt = buildSuggestSectionsPrompt({
            content: hugeLines.join('\n'),
            languageId: 'python',
            headingMarkers: { python: ['@', '$', '&'] },
            maxLines: 10,
        });

        assert.match(prompt, /Level 1: # @ Main Section/);
        assert.match(prompt, /Level 2: # \$ Sub Section/);
        assert.match(prompt, /Level 3: # & Detail/);
        assert.match(prompt, /10: x_9 = 9/);
        assert.doesNotMatch(prompt, /11: x_10 = 10/);
        assert.match(prompt, /truncated 10 remaining lines out of 20/);
    });
});

describe('promptCodec: parseSuggestSectionsResponse', () => {
    it('parses plain JSON, converts 1-indexed lines to 0-indexed, clamps levels, deduplicates, and sorts', () => {
        const raw = JSON.stringify([
            { line: 10, level: 9, label: '  Exports  ' },
            { line: 1, level: 0, label: 'Imports' },
            { line: 10, level: 2, label: 'Duplicate Line Ignored' },
            { line: 5, level: 2, label: 'Core\nLogic' },
        ]);

        const parsed = parseSuggestSectionsResponse(raw, 15);
        assert.deepEqual(parsed, [
            { line: 0, level: 1, label: 'Imports' },
            { line: 4, level: 2, label: 'Core Logic' },
            { line: 9, level: 6, label: 'Exports' },
        ]);
    });

    it('extracts JSON array from markdown fenced blocks', () => {
        const raw = [
            'Here are my suggested Mokuji sections:',
            '```json',
            '[',
            '  { "line": 2, "level": 1, "label": "Setup" },',
            '  { "line": 8, "level": 2, "label": "Helpers" }',
            ']',
            '```',
            'Let me know if you want adjustments!',
        ].join('\n');

        const parsed = parseSuggestSectionsResponse(raw, 10);
        assert.deepEqual(parsed, [
            { line: 1, level: 1, label: 'Setup' },
            { line: 7, level: 2, label: 'Helpers' },
        ]);
    });

    it('extracts JSON array embedded in prose even when prose also contains bracketed text', () => {
        const raw =
            'Analyzed lines [1..20] of your file: [{"line": 3, "level": 1, "label": "State [Store]"}] Done!';
        const parsed = parseSuggestSectionsResponse(raw, 20);
        assert.deepEqual(parsed, [{ line: 2, level: 1, label: 'State [Store]' }]);
    });

    it('returns empty array safely on malformed or non-array payloads', () => {
        assert.deepEqual(parseSuggestSectionsResponse('', 10), []);
        assert.deepEqual(parseSuggestSectionsResponse('not json at all', 10), []);
        assert.deepEqual(parseSuggestSectionsResponse('{"line": 1, "level": 1, "label": "Obj"}', 10), []);
        assert.deepEqual(parseSuggestSectionsResponse('[{"line": 1, "level": 1', 10), []);
        assert.deepEqual(parseSuggestSectionsResponse('[{"line": 1, "level": 1, "label": "Ok"}]', 0), []);
    });

    it('filters out-of-bounds lines, empty labels, and collisions with existingHeadingLines', () => {
        // Suppose 0-indexed line 3 already has a Mokuji heading comment (`// # Existing`).
        // Then 0-indexed line 3 (1-indexed 4) AND 0-indexed line 4 (1-indexed 5, right below heading) must be skipped!
        const existing = new Set<number>([3]);
        const raw = JSON.stringify([
            { line: 0, level: 1, label: 'Zero Line Invalid' },
            { line: -2, level: 1, label: 'Negative Invalid' },
            { line: 11, level: 1, label: 'Past EOF Invalid' },
            { line: 2, level: 1, label: '   ' },
            { line: 4, level: 1, label: 'Collides With Existing Line 3' },
            { line: 5, level: 1, label: 'Immediately Below Existing Line 3' },
            { line: 6, level: 2, label: 'Safe Next Block' },
        ]);

        const parsed = parseSuggestSectionsResponse(raw, 10, existing);
        assert.deepEqual(parsed, [{ line: 5, level: 2, label: 'Safe Next Block' }]);
    });
});

describe('promptCodec: buildOutlineFallbackSuggestions & extractRegexOutlineSymbols', () => {
    it('maps top-level symbols to level 1 and direct significant children to level 2 while ignoring variables/properties', () => {
        const symbols: OutlineSymbolInput[] = [
            { name: 'MAX_RETRIES', kindName: 'Constant', line: 0 },
            {
                name: 'UserService',
                kindName: 'Class',
                line: 3,
                children: [
                    { name: 'cache', kindName: 'Property', line: 4 },
                    { name: 'constructor', kindName: 'Constructor', line: 6 },
                    { name: 'findById', kindName: 'Method', line: 10 },
                ],
            },
            { name: 'formatUser', kindName: 'Function', line: 20 },
        ];

        const existing = new Set<number>([19]); // Heading already sits right above formatUser (line 20)
        const suggestions = buildOutlineFallbackSuggestions(symbols, existing);

        assert.deepEqual(suggestions, [
            { line: 3, level: 1, label: 'UserService' },
            { line: 6, level: 2, label: 'constructor' },
            { line: 10, level: 2, label: 'findById' },
        ]);
    });

    it('extracts TypeScript, Python, and Go symbols via lightweight regex fallback', () => {
        const tsCode = [
            'import * as fs from "node:fs";',
            '',
            'export interface Config {',
            '    port: number;',
            '}',
            '',
            'export class Server {',
            '    constructor() {',
            '    }',
            '',
            '    async start(): Promise<void> {',
            '        if (true) {',
            '        }',
            '    }',
            '}',
            '',
            'export const createServer = () => {',
            '    return new Server();',
            '};',
        ].join('\n');

        const tsSymbols = extractRegexOutlineSymbols(tsCode, 'typescript');
        const tsSuggestions = buildOutlineFallbackSuggestions(tsSymbols);
        assert.deepEqual(tsSuggestions, [
            { line: 2, level: 1, label: 'Config' },
            { line: 6, level: 1, label: 'Server' },
            { line: 7, level: 2, label: 'constructor' },
            { line: 10, level: 2, label: 'start' },
            { line: 16, level: 1, label: 'createServer' },
        ]);

        const pyCode = [
            'class Pipeline:',
            '    def __init__(self):',
            '        pass',
            '',
            '    async def execute(self):',
            '        return True',
            '',
            'def run_all():',
            '    pass',
        ].join('\n');

        const pySuggestions = buildOutlineFallbackSuggestions(
            extractRegexOutlineSymbols(pyCode, 'python')
        );
        assert.deepEqual(pySuggestions, [
            { line: 0, level: 1, label: 'Pipeline' },
            { line: 1, level: 2, label: '__init__' },
            { line: 4, level: 2, label: 'execute' },
            { line: 7, level: 1, label: 'run_all' },
        ]);

        const goCode = [
            'package main',
            '',
            'type Store struct {',
            '}',
            '',
            'func (s *Store) Save() error {',
            '    return nil',
            '}',
        ].join('\n');

        const goSuggestions = buildOutlineFallbackSuggestions(
            extractRegexOutlineSymbols(goCode, 'go')
        );
        assert.deepEqual(goSuggestions, [
            { line: 2, level: 1, label: 'Store' },
            { line: 5, level: 1, label: 'Save' },
        ]);

        assert.deepEqual(
            extractRegexOutlineSymbols('```ts\nfunction ignored() {}\n```', 'markdown'),
            []
        );
    });
});

describe('promptCodec: applySuggestionsToContent & parseText round-trip', () => {
    it('inserts headings with matching indentation, preserves CRLF, avoids index drift, and round-trips via parseText', () => {
        const crlfSource = [
            'export class Widget {',
            '    render() {',
            '        return 1;',
            '    }',
            '}',
            'export function helper() {}',
        ].join('\r\n');

        const suggestions = [
            { line: 0, level: 1, label: 'Widget Component' },
            { line: 1, level: 2, label: 'Rendering' },
            { line: 5, level: 1, label: 'Utilities' },
        ];

        const updated = applySuggestionsToContent(crlfSource, suggestions, 'typescript');
        assert.ok(updated.includes('\r\n'), 'Should preserve CRLF line endings');
        assert.equal(/(?<!\r)\n/.test(updated), false, 'Should not contain bare LF line endings');

        const updatedLines = updated.split('\r\n');
        assert.equal(updatedLines[0], '// # Widget Component');
        assert.equal(updatedLines[1], 'export class Widget {');
        assert.equal(updatedLines[2], '    // ## Rendering');
        assert.equal(updatedLines[3], '    render() {');
        assert.equal(updatedLines[7], '// # Utilities');
        assert.equal(updatedLines[8], 'export function helper() {}');

        const toc = parseText(updated, { languageId: 'typescript' });
        const flat = flattenToc(toc);
        assert.deepEqual(
            flat.map((n) => ({ label: n.label, level: n.level, line: n.line })),
            [
                { label: 'Widget Component', level: 1, line: 0 },
                { label: 'Rendering', level: 2, line: 2 },
                { label: 'Utilities', level: 1, line: 7 },
            ]
        );
    });

    it('round-trips Python custom headingMarkers cleanly through parseText', () => {
        const pySource = ['def load():', '    pass', '', 'def save():', '    pass'].join('\n');
        const markers = { python: ['@', '$'] };
        const updated = applySuggestionsToContent(
            pySource,
            [
                { line: 0, level: 1, label: 'Loader' },
                { line: 3, level: 2, label: 'Saver' },
            ],
            'python',
            markers
        );

        const toc = parseText(updated, { languageId: 'python', headingMarkers: markers });
        assert.equal(toc.length, 1);
        assert.equal(toc[0].label, 'Loader');
        assert.equal(toc[0].children.length, 1);
        assert.equal(toc[0].children[0].label, 'Saver');
    });
});
