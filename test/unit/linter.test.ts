import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { lintLines, lintText } from '../../src/core/linter';
import { WorkspaceConfig } from '../../src/core/types';

const SAMPLES_DIR = path.resolve(__dirname, '..', '..', '..', 'samples');

describe('linter module - active language gating', () => {
    it('returns empty array for unsupported languages without custom markers or workspace config', () => {
        const content = [
            '// # Looks like heading',
            '//# Missing space',
            '# # Python style',
        ].join('\n');

        assert.deepEqual(lintText(content, { languageId: 'plaintext' }), []);
        assert.deepEqual(lintText(content, { languageId: 'rust' }), []);
    });

    it('lints unsupported built-in languages when headingMarkers are configured', () => {
        const content = [
            '# @ Main Section',
            '# & Skipped Level 3',
        ].join('\n');

        const issues = lintText(content, {
            languageId: 'ruby',
            headingMarkers: { ruby: ['@', '$', '&'] },
        });

        assert.equal(issues.length, 1);
        assert.equal(issues[0].code, 'skipped-level');
        assert.equal(issues[0].severity, 'information');
        assert.equal(issues[0].line, 1);
        assert.equal(issues[0].replacement, '# $ Skipped Level 3');
    });

    it('lints structural rules when workspaceConfig.parsers is configured and skips built-in missing-space', () => {
        const workspaceConfig: WorkspaceConfig = {
            parsers: {
                typescript: {
                    patterns: [
                        { regex: '^\\s*//\\s*(=+)\\s*(.+)$', levelGroup: 1, labelGroup: 2 },
                    ],
                },
            },
        };

        const content = [
            '//# Should not trigger built-in missing-space under custom workspace parser',
            '// = Top',
            '// === Jumped',
        ].join('\n');

        const issues = lintText(content, { languageId: 'typescript', workspaceConfig });
        assert.equal(issues.length, 1);
        assert.equal(issues[0].code, 'skipped-level');
        assert.equal(issues[0].line, 2);
        assert.equal(issues[0].replacement, undefined);
    });
});

describe('linter module - Rule A: missing-space', () => {
    it('detects missing spaces in JS/TS slash comments and computes indented replacements', () => {
        const content = [
            '// # Valid Root',
            '//# Missing space after slashes',
            '  // ##Missing space after hashes',
            '    //### Both level 3 missing slash space',
        ].join('\n');

        const issues = lintText(content, { languageId: 'typescript' });
        assert.equal(issues.length, 3);

        assert.equal(issues[0].code, 'missing-space');
        assert.equal(issues[0].severity, 'warning');
        assert.equal(issues[0].line, 1);
        assert.equal(issues[0].startColumn, 0);
        assert.equal(issues[0].replacement, '// # Missing space after slashes');

        assert.equal(issues[1].code, 'missing-space');
        assert.equal(issues[1].line, 2);
        assert.equal(issues[1].startColumn, 2);
        assert.equal(issues[1].replacement, '  // ## Missing space after hashes');

        assert.equal(issues[2].code, 'missing-space');
        assert.equal(issues[2].line, 3);
        assert.equal(issues[2].startColumn, 4);
        assert.equal(issues[2].replacement, '    // ### Both level 3 missing slash space');
    });

    it('does NOT produce false positives on JS/TS pragmas, regions, hex colors, or normal comments', () => {
        const content = [
            '//# sourceMappingURL=test.js.map',
            '//# sourceURL=bundle.js',
            '//#region Helpers',
            '//#endregion',
            '// #region Utilities',
            '// #endregion',
            '// #fff',
            '// #ff00aa',
            '// #ff00aa80 translucent',
            '// Normal comment without hashes',
            '// Another comment with #hashtag in the middle',
            '/** # Valid JSDoc Heading */',
        ].join('\n');

        const issues = lintText(content, { languageId: 'javascript' });
        assert.deepEqual(issues, []);
    });

    it('detects missing spaces in CSS/block comments while ignoring hex color comments', () => {
        const content = [
            '/* # Valid Main */',
            '/*# Missing open space */',
            '  /* ##Missing hash space */',
            '/* #fff */',
            '/* #1a2b3c */',
            '/* #ff00aa80 */',
            '/* normal css comment */',
        ].join('\n');

        const issues = lintText(content, { languageId: 'css' });
        assert.equal(issues.length, 2);

        assert.equal(issues[0].code, 'missing-space');
        assert.equal(issues[0].line, 1);
        assert.equal(issues[0].replacement, '/* # Missing open space */');

        assert.equal(issues[1].code, 'missing-space');
        assert.equal(issues[1].line, 2);
        assert.equal(issues[1].startColumn, 2);
        assert.equal(issues[1].replacement, '  /* ## Missing hash space */');
    });

    it('detects missing spaces in Python hashComment while ignoring shebangs and normal comments', () => {
        const content = [
            '#!/usr/bin/env python3',
            '# -*- coding: utf-8 -*-',
            '# Normal Python comment',
            '# # Valid Section',
            '# #MissingSpaceSection',
            '    # ##IndentedSubsection',
        ].join('\n');

        const issues = lintText(content, { languageId: 'python' });
        assert.equal(issues.length, 2);

        assert.equal(issues[0].code, 'missing-space');
        assert.equal(issues[0].line, 4);
        assert.equal(issues[0].replacement, '# # MissingSpaceSection');

        assert.equal(issues[1].code, 'missing-space');
        assert.equal(issues[1].line, 5);
        assert.equal(issues[1].startColumn, 4);
        assert.equal(issues[1].replacement, '    # ## IndentedSubsection');
    });

    it('detects missing spaces in Markdown while ignoring fenced code blocks and numeric issue hashtags', () => {
        const content = [
            '# Valid Title',
            '##MissingSpaceHeading',
            '#123',
            '```python',
            '#NotAMarkdownHeadingInsideBackticks',
            '##AlsoIgnored',
            '```',
            '~~~sh',
            '#IgnoredInsideTildes',
            '~~~',
            '###AfterFenceMissingSpace',
        ].join('\n');

        const issues = lintText(content, { languageId: 'markdown' });
        assert.equal(issues.length, 2);

        assert.equal(issues[0].code, 'missing-space');
        assert.equal(issues[0].line, 1);
        assert.equal(issues[0].replacement, '## MissingSpaceHeading');

        assert.equal(issues[1].code, 'missing-space');
        assert.equal(issues[1].line, 10);
        assert.equal(issues[1].replacement, '### AfterFenceMissingSpace');
    });
});

describe('linter module - Rule B: skipped-level', () => {
    it('detects skipped heading levels and generates style-preserving replacements', () => {
        const content = [
            '// # Level 1',
            '  // ### Jumped to Level 3',
            '  /* ##### Jumped in Block Style */',
        ].join('\n');

        const issues = lintText(content, { languageId: 'typescript' });
        assert.equal(issues.length, 2);

        assert.equal(issues[0].code, 'skipped-level');
        assert.equal(issues[0].severity, 'information');
        assert.equal(issues[0].line, 1);
        assert.match(issues[0].message, /jumped from 1 to 3 \(expected level 2\)/i);
        assert.equal(issues[0].replacement, '  // ## Jumped to Level 3');

        assert.equal(issues[1].code, 'skipped-level');
        assert.equal(issues[1].line, 2);
        assert.match(issues[1].message, /jumped from 3 to 5 \(expected level 4\)/i);
        assert.equal(issues[1].replacement, '  /* #### Jumped in Block Style */');
    });

    it('allows stepping down any number of levels without warning', () => {
        const content = [
            '# H1',
            '## H2',
            '### H3',
            '# Back to H1',
            '## H2 Again',
        ].join('\n');

        const issues = lintText(content, { languageId: 'markdown' });
        assert.deepEqual(issues, []);
    });
});

describe('linter module - Rule C: duplicate-heading', () => {
    it('flags duplicate headings within the same sibling scope but allows identical names under different parents', () => {
        const lines = [
            '// # API',
            '// ## Setup',
            '// ## Handlers',
            '// ## Setup',
            '// # CLI',
            '// ## Setup',
            '// # API',
        ];

        const issues = lintLines(lines, { languageId: 'typescript' });
        assert.equal(issues.length, 2);

        assert.equal(issues[0].code, 'duplicate-heading');
        assert.equal(issues[0].severity, 'information');
        assert.equal(issues[0].line, 3);
        assert.equal(issues[0].replacement, undefined);

        assert.equal(issues[1].code, 'duplicate-heading');
        assert.equal(issues[1].severity, 'information');
        assert.equal(issues[1].line, 6);
        assert.equal(issues[1].replacement, undefined);
    });

    it('handles CRLF line endings cleanly via lintText', () => {
        const crlfContent = '// # Main\r\n//# BadSpacing\r\n// ### Jumped\r\n';
        const issues = lintText(crlfContent, { languageId: 'javascript' });

        assert.equal(issues.length, 2);
        assert.equal(issues[0].code, 'missing-space');
        assert.equal(issues[0].line, 1);
        assert.equal(issues[0].replacement, '// # BadSpacing');

        assert.equal(issues[1].code, 'skipped-level');
        assert.equal(issues[1].line, 2);
        assert.equal(issues[1].replacement, '// ## Jumped');
    });

    it('produces zero false positives across all 12 valid sample files', () => {
        const sampleCases: Array<[string, string]> = [
            ['sample.css', 'css'],
            ['sample.go', 'go'],
            ['sample.html', 'html'],
            ['sample.java', 'java'],
            ['sample.js', 'javascript'],
            ['sample.jsx', 'javascriptreact'],
            ['sample.md', 'markdown'],
            ['sample.py', 'python'],
            ['sample.svelte', 'svelte'],
            ['sample.ts', 'typescript'],
            ['sample.tsx', 'typescriptreact'],
            ['sample.vue', 'vue'],
        ];

        for (const [fileName, languageId] of sampleCases) {
            const content = fs.readFileSync(path.join(SAMPLES_DIR, fileName), 'utf8');
            const issues = lintText(content, { languageId });
            assert.deepEqual(issues, [], `Expected zero lint issues in ${fileName}`);
        }
    });
});
