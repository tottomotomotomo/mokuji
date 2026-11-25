import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { flattenToc, matchHeadingMarker, parseLines, parseText } from '../../src/core/parser';
import { LANGUAGE_PATTERNS, PATTERNS, SUPPORTED_LANGUAGE_IDS } from '../../src/core/patterns';
import { TocNode, WorkspaceConfig } from '../../src/core/types';

// samples ディレクトリへの絶対パス解決（out-test/test/unit から3階層上）
const SAMPLES_DIR = path.resolve(__dirname, '..', '..', '..', 'samples');

function readSample(fileName: string): string {
    return fs.readFileSync(path.join(SAMPLES_DIR, fileName), 'utf8');
}

function summarizeTree(nodes: readonly TocNode[]): unknown[] {
    return nodes.map((n) => ({
        label: n.label,
        level: n.level,
        line: n.line,
        ...(n.children.length > 0 ? { children: summarizeTree(n.children) } : {}),
    }));
}

describe('patterns module', () => {
    it('exports all 14 supported language IDs and 7 pattern definitions', () => {
        assert.equal(Object.keys(PATTERNS).length, 7);
        assert.equal(SUPPORTED_LANGUAGE_IDS.length, 14);
        assert.deepEqual(
            [...SUPPORTED_LANGUAGE_IDS].sort(),
            [
                'css',
                'go',
                'html',
                'java',
                'javascript',
                'javascriptreact',
                'less',
                'markdown',
                'python',
                'scss',
                'svelte',
                'typescript',
                'typescriptreact',
                'vue',
            ]
        );
        for (const langId of SUPPORTED_LANGUAGE_IDS) {
            assert.ok(LANGUAGE_PATTERNS[langId].length > 0);
        }
    });
});

describe('samples/ integration tests (all 12 sample files)', () => {
    it('parses sample.css correctly', () => {
        const toc = parseText(readSample('sample.css'), { languageId: 'css' });
        assert.equal(flattenToc(toc).length, 5);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Main Styles - CSS Format',
                level: 1,
                line: 0,
                children: [
                    {
                        label: 'Layout',
                        level: 2,
                        line: 7,
                        children: [{ label: 'Navigation', level: 3, line: 14 }],
                    },
                    {
                        label: 'Footer',
                        level: 2,
                        line: 24,
                        children: [{ label: 'Social Links', level: 3, line: 31 }],
                    },
                ],
            },
        ]);
    });

    it('parses sample.go correctly', () => {
        const toc = parseText(readSample('sample.go'), { languageId: 'go' });
        assert.equal(flattenToc(toc).length, 7);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Data Models',
                level: 1,
                line: 2,
                children: [{ label: 'User Struct', level: 2, line: 4 }],
            },
            {
                label: 'Services',
                level: 1,
                line: 10,
                children: [
                    {
                        label: 'User Service',
                        level: 2,
                        line: 12,
                        children: [
                            { label: 'Public Methods', level: 3, line: 15 },
                            { label: 'Private Helpers', level: 3, line: 20 },
                        ],
                    },
                ],
            },
            {
                label: 'Utilities',
                level: 1,
                line: 25,
            },
        ]);
    });

    it('parses sample.html correctly', () => {
        const toc = parseText(readSample('sample.html'), { languageId: 'html' });
        assert.equal(flattenToc(toc).length, 11);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Header Section',
                level: 1,
                line: 7,
                children: [
                    { label: 'Logo', level: 2, line: 9 },
                    { label: 'Navigation', level: 2, line: 11 },
                ],
            },
            {
                label: 'Main Content',
                level: 1,
                line: 15,
                children: [
                    { label: 'Hero Area', level: 2, line: 17 },
                    {
                        label: 'Features',
                        level: 2,
                        line: 20,
                        children: [
                            { label: 'Feature 1', level: 3, line: 22 },
                            { label: 'Feature 2', level: 3, line: 24 },
                        ],
                    },
                ],
            },
            {
                label: 'Footer Section',
                level: 1,
                line: 29,
                children: [
                    { label: 'Contact', level: 2, line: 31 },
                    { label: 'Copyright', level: 2, line: 33 },
                ],
            },
        ]);
    });

    it('parses sample.java correctly', () => {
        const toc = parseText(readSample('sample.java'), { languageId: 'java' });
        assert.equal(flattenToc(toc).length, 7);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Data Models',
                level: 1,
                line: 0,
                children: [{ label: 'User Interface', level: 2, line: 2 }],
            },
            {
                label: 'Services',
                level: 1,
                line: 8,
                children: [
                    {
                        label: 'User Service',
                        level: 2,
                        line: 10,
                        children: [
                            { label: 'Public Methods', level: 3, line: 13 },
                            { label: 'Private Helpers', level: 3, line: 18 },
                        ],
                    },
                ],
            },
            {
                label: 'Utilities',
                level: 1,
                line: 24,
            },
        ]);
    });

    it('parses sample.js correctly (ignoring JSX comments and //# sourceMappingURL)', () => {
        const content = readSample('sample.js');
        assert.ok(content.includes('//# sourceMappingURL=test.js.map'));
        const toc = parseText(content, { languageId: 'javascript' });
        const flat = flattenToc(toc);
        assert.equal(flat.length, 4);
        assert.ok(flat.every((n) => !n.label.includes('sourceMappingURL')));
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Components',
                level: 1,
                line: 1,
            },
            {
                label: 'Services',
                level: 1,
                line: 23,
                children: [{ label: 'Data Fetching', level: 2, line: 24 }],
            },
            {
                label: 'Utilities',
                level: 1,
                line: 30,
            },
        ]);
    });

    it('parses sample.jsx correctly (including JSX {/* # ... */} comments)', () => {
        const toc = parseText(readSample('sample.jsx'), { languageId: 'javascriptreact' });
        assert.equal(flattenToc(toc).length, 8);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Components',
                level: 1,
                line: 0,
                children: [{ label: 'User Card', level: 2, line: 2 }],
            },
            {
                label: 'Render',
                level: 1,
                line: 6,
                children: [
                    { label: 'Header', level: 2, line: 8 },
                    { label: 'Body', level: 2, line: 11 },
                ],
            },
            {
                label: 'Services',
                level: 1,
                line: 17,
                children: [{ label: 'Data Fetching', level: 2, line: 19 }],
            },
            {
                label: 'Utilities',
                level: 1,
                line: 24,
            },
        ]);
    });

    it('parses sample.md correctly and strips closing hashes', () => {
        const toc = parseText(readSample('sample.md'), { languageId: 'markdown' });
        assert.equal(flattenToc(toc).length, 10);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Mokuji Test - Markdown',
                level: 1,
                line: 0,
                children: [
                    {
                        label: 'Features',
                        level: 2,
                        line: 4,
                        children: [
                            { label: 'Feature 1', level: 3, line: 6 },
                            { label: 'Feature 2', level: 3, line: 9 },
                        ],
                    },
                    {
                        label: 'Installation',
                        level: 2,
                        line: 12,
                        children: [
                            { label: 'Prerequisites', level: 3, line: 16 },
                            { label: 'Steps', level: 3, line: 19 },
                        ],
                    },
                    {
                        label: 'Usage',
                        level: 2,
                        line: 23,
                    },
                    {
                        label: 'Title with closing hashes',
                        level: 2,
                        line: 27,
                        children: [{ label: 'Another Section', level: 3, line: 31 }],
                    },
                ],
            },
        ]);
    });

    it('parses sample.py correctly', () => {
        const toc = parseText(readSample('sample.py'), { languageId: 'python' });
        assert.equal(flattenToc(toc).length, 7);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Data Models',
                level: 1,
                line: 0,
                children: [{ label: 'User Class', level: 2, line: 5 }],
            },
            {
                label: 'Services',
                level: 1,
                line: 11,
                children: [
                    {
                        label: 'User Service',
                        level: 2,
                        line: 13,
                        children: [
                            { label: 'Public Methods', level: 3, line: 15 },
                            { label: 'Private Helpers', level: 3, line: 19 },
                        ],
                    },
                ],
            },
            {
                label: 'Utilities',
                level: 1,
                line: 23,
            },
        ]);
    });

    it('parses sample.svelte correctly', () => {
        const toc = parseText(readSample('sample.svelte'), { languageId: 'svelte' });
        assert.equal(flattenToc(toc).length, 10);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Script',
                level: 1,
                line: 1,
                children: [{ label: 'State', level: 2, line: 3 }],
            },
            {
                label: 'Functions',
                level: 1,
                line: 6,
                children: [
                    { label: 'Handlers', level: 2, line: 8 },
                    { label: 'Helpers', level: 2, line: 13 },
                ],
            },
            {
                label: 'Template',
                level: 1,
                line: 19,
                children: [
                    { label: 'Header', level: 2, line: 21 },
                    { label: 'Main Content', level: 2, line: 26 },
                ],
            },
            {
                label: 'Styles',
                level: 1,
                line: 33,
                children: [{ label: 'Layout', level: 2, line: 35 }],
            },
        ]);
    });

    it('parses sample.ts correctly', () => {
        const toc = parseText(readSample('sample.ts'), { languageId: 'typescript' });
        assert.equal(flattenToc(toc).length, 6);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Types',
                level: 1,
                line: 0,
                children: [{ label: 'Interfaces', level: 2, line: 6 }],
            },
            {
                label: 'Services',
                level: 1,
                line: 11,
                children: [
                    {
                        label: 'Public Methods',
                        level: 2,
                        line: 13,
                        children: [{ label: 'Helper', level: 3, line: 18 }],
                    },
                ],
            },
            {
                label: 'Utilities',
                level: 1,
                line: 24,
            },
        ]);
    });

    it('parses sample.tsx correctly', () => {
        const toc = parseText(readSample('sample.tsx'), { languageId: 'typescriptreact' });
        assert.equal(flattenToc(toc).length, 8);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Components',
                level: 1,
                line: 0,
                children: [{ label: 'User Card', level: 2, line: 2 }],
            },
            {
                label: 'Render',
                level: 1,
                line: 11,
                children: [
                    { label: 'Header', level: 2, line: 13 },
                    { label: 'Body', level: 2, line: 16 },
                ],
            },
            {
                label: 'Services',
                level: 1,
                line: 22,
                children: [{ label: 'Data Fetching', level: 2, line: 24 }],
            },
            {
                label: 'Utilities',
                level: 1,
                line: 29,
            },
        ]);
    });

    it('parses sample.vue correctly', () => {
        const toc = parseText(readSample('sample.vue'), { languageId: 'vue' });
        assert.equal(flattenToc(toc).length, 10);
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Template',
                level: 1,
                line: 1,
                children: [
                    { label: 'Header', level: 2, line: 3 },
                    { label: 'Main Content', level: 2, line: 8 },
                ],
            },
            {
                label: 'Script',
                level: 1,
                line: 15,
                children: [{ label: 'Props', level: 2, line: 17 }],
            },
            {
                label: 'Components',
                level: 1,
                line: 22,
                children: [{ label: 'UserCard', level: 2, line: 24 }],
            },
            {
                label: 'Styles',
                level: 1,
                line: 31,
                children: [
                    { label: 'Layout', level: 2, line: 33 },
                    { label: 'Typography', level: 2, line: 38 },
                ],
            },
        ]);
    });
});

describe('SCSS and LESS patterns', () => {
    it('parses both slash and block comments in scss', () => {
        const scss = [
            '// # Variables',
            '$primary: #333;',
            '/* ## Colors */',
            '// ### Brand',
        ].join('\n');
        const toc = parseText(scss, { languageId: 'scss' });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Variables',
                level: 1,
                line: 0,
                children: [
                    {
                        label: 'Colors',
                        level: 2,
                        line: 2,
                        children: [{ label: 'Brand', level: 3, line: 3 }],
                    },
                ],
            },
        ]);
    });

    it('parses both slash and block comments in less', () => {
        const less = [
            '/* # Mixins */',
            '// ## Responsive',
            '.mobile() {}',
        ].join('\n');
        const toc = parseText(less, { languageId: 'less' });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Mixins',
                level: 1,
                line: 0,
                children: [{ label: 'Responsive', level: 2, line: 1 }],
            },
        ]);
    });
});

describe('Markdown fenced code blocks', () => {
    it('ignores # lines inside backtick fenced code blocks', () => {
        const md = [
            '# Introduction',
            '```bash',
            '# bash comment should be ignored',
            '## another comment',
            '```',
            '## Usage',
        ].join('\n');

        const toc = parseText(md, { languageId: 'markdown' });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Introduction',
                level: 1,
                line: 0,
                children: [{ label: 'Usage', level: 2, line: 5 }],
            },
        ]);
    });

    it('ignores # lines inside tilde fenced code blocks', () => {
        const md = [
            '# Python Guide',
            '~~~python',
            '# # comment',
            '# regular python comment',
            '~~~~',
            '## Next Steps',
        ].join('\n');

        const toc = parseText(md, { languageId: 'markdown' });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Python Guide',
                level: 1,
                line: 0,
                children: [{ label: 'Next Steps', level: 2, line: 5 }],
            },
        ]);
    });

    it('handles nested longer fences (4 backticks wrapping 3 backticks)', () => {
        const md = [
            '# Outer Doc',
            '````md',
            '# Example Heading Inside Fence',
            '```bash',
            '# Inner Bash Comment',
            '```',
            '## Still Inside 4-Backtick Fence',
            '````   ',
            '## Real Section After Fence',
        ].join('\n');

        const toc = parseText(md, { languageId: 'markdown' });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Outer Doc',
                level: 1,
                line: 0,
                children: [{ label: 'Real Section After Fence', level: 2, line: 8 }],
            },
        ]);
    });

    it('does not allow mismatched fence characters to close an open fence', () => {
        const md = [
            '# Start',
            '```yaml',
            '# inside backtick fence',
            '~~~',
            '# still inside backtick fence',
            '```',
            '# End',
        ].join('\n');

        const toc = parseText(md, { languageId: 'markdown' });
        assert.deepEqual(summarizeTree(toc), [
            { label: 'Start', level: 1, line: 0 },
            { label: 'End', level: 1, line: 6 },
        ]);
    });
});

describe('Priority 1: headingMarkers override', () => {
    it('supports custom Python markers ["@", "$", "&"] and overrides default patterns', () => {
        const py = [
            '# @ Models',
            '# $ User',
            '# & Validation',
            '# # Default Pattern Should Be Ignored When Markers Configured',
        ].join('\n');

        const toc = parseText(py, {
            languageId: 'python',
            headingMarkers: { python: ['@', '$', '&'] },
        });

        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Models',
                level: 1,
                line: 0,
                children: [
                    {
                        label: 'User',
                        level: 2,
                        line: 1,
                        children: [{ label: 'Validation', level: 3, line: 2 }],
                    },
                ],
            },
        ]);
    });

    it('supports JSX {/* @ Title */} and all comment styles in matchHeadingMarker', () => {
        const markers = ['@', '@@'];
        assert.deepEqual(matchHeadingMarker('  {/* @ JSX Title */}  ', markers), {
            level: 1,
            label: 'JSX Title',
        });
        assert.deepEqual(matchHeadingMarker('  {/* @@ JSX Sub */}', markers), {
            level: 2,
            label: 'JSX Sub',
        });
        assert.deepEqual(matchHeadingMarker('// @ Slash Title', markers), {
            level: 1,
            label: 'Slash Title',
        });
        assert.deepEqual(matchHeadingMarker('/* @ Block Title */', markers), {
            level: 1,
            label: 'Block Title',
        });
        assert.deepEqual(matchHeadingMarker('/** @@ JSDoc Title */', markers), {
            level: 2,
            label: 'JSDoc Title',
        });
        assert.deepEqual(matchHeadingMarker('<!-- @ HTML Title -->', markers), {
            level: 1,
            label: 'HTML Title',
        });
        assert.equal(matchHeadingMarker('// # Not Matching', markers), null);

        const jsx = [
            '// @ Component Root',
            'function App() {',
            '  return (',
            '    <div>',
            '      {/* @@ Header Slot */}',
            '    </div>',
            '  );',
            '}',
        ].join('\n');

        const toc = parseText(jsx, {
            languageId: 'javascriptreact',
            headingMarkers: { javascriptreact: markers },
        });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Component Root',
                level: 1,
                line: 0,
                children: [{ label: 'Header Slot', level: 2, line: 4 }],
            },
        ]);
    });

    it('takes precedence over workspaceConfig when headingMarkers is non-empty', () => {
        const workspaceConfig: WorkspaceConfig = {
            parsers: {
                typescript: {
                    patterns: [{ regex: '^\\s*// (=+) (.+)$', levelGroup: 1, labelGroup: 2 }],
                },
            },
        };
        const ts = ['// @ From Marker', '// = From Workspace', '// # From Default'].join('\n');
        const toc = parseText(ts, {
            languageId: 'typescript',
            headingMarkers: { typescript: ['@'] },
            workspaceConfig,
        });
        assert.deepEqual(summarizeTree(toc), [{ label: 'From Marker', level: 1, line: 0 }]);
    });
});

describe('Priority 2: workspaceConfig override and invalid regex handling', () => {
    it('uses workspaceConfig patterns when headingMarkers is empty and overrides default patterns', () => {
        const workspaceConfig: WorkspaceConfig = {
            parsers: {
                ruby: {
                    patterns: [{ regex: '^\\s*# (=+) (.+)$', levelGroup: 1, labelGroup: 2 }],
                },
                typescript: {
                    patterns: [{ regex: '^\\s*// (=+) (.+)$', levelGroup: 1, labelGroup: 2 }],
                },
            },
        };

        const rubyToc = parseText('# = Ruby Main\n# == Ruby Sub', {
            languageId: 'ruby',
            workspaceConfig,
        });
        assert.deepEqual(summarizeTree(rubyToc), [
            {
                label: 'Ruby Main',
                level: 1,
                line: 0,
                children: [{ label: 'Ruby Sub', level: 2, line: 1 }],
            },
        ]);

        // Default `// # Ignored` should not match when workspaceConfig defines `typescript`
        const tsToc = parseText('// # Ignored\n// = Custom TS', {
            languageId: 'typescript',
            headingMarkers: { typescript: [] },
            workspaceConfig,
        });
        assert.deepEqual(summarizeTree(tsToc), [{ label: 'Custom TS', level: 1, line: 1 }]);
    });

    it('gracefully skips invalid regex patterns without throwing', () => {
        const workspaceConfig: WorkspaceConfig = {
            parsers: {
                typescript: {
                    patterns: [
                        { regex: '[unclosed-bracket(', levelGroup: 1, labelGroup: 2 },
                        { regex: '^\\s*// (!+) (.+)$', levelGroup: 1, labelGroup: 2 },
                    ],
                },
            },
        };

        const toc = parseText('// ! Recovered Heading\n// !! Child Heading', {
            languageId: 'typescript',
            workspaceConfig,
        });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Recovered Heading',
                level: 1,
                line: 0,
                children: [{ label: 'Child Heading', level: 2, line: 1 }],
            },
        ]);
    });
});

describe('Edge cases: unregistered languages, CRLF line endings, and hierarchy unwinding', () => {
    it('returns empty array for unregistered languages without config', () => {
        const toc = parseText('// # Not Registered\n# # Also Not Registered', {
            languageId: 'rust',
        });
        assert.deepEqual(toc, []);
    });

    it('handles CRLF line endings cleanly in parseText', () => {
        const crlfContent = '// # First\r\nconst x = 1;\r\n// ## Second\r\n/* ### Third */\r\n';
        const toc = parseText(crlfContent, { languageId: 'typescript' });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'First',
                level: 1,
                line: 0,
                children: [
                    {
                        label: 'Second',
                        level: 2,
                        line: 2,
                        children: [{ label: 'Third', level: 3, line: 3 }],
                    },
                ],
            },
        ]);
    });

    it('unwinds hierarchy stack accurately for # -> ### -> ## -> #', () => {
        const lines = [
            '# Level 1A',
            '### Skipped to Level 3',
            '## Unwound to Level 2',
            '# Sibling Level 1B',
        ];
        const toc = parseLines(lines, { languageId: 'markdown' });
        assert.deepEqual(summarizeTree(toc), [
            {
                label: 'Level 1A',
                level: 1,
                line: 0,
                children: [
                    { label: 'Skipped to Level 3', level: 3, line: 1 },
                    { label: 'Unwound to Level 2', level: 2, line: 2 },
                ],
            },
            {
                label: 'Sibling Level 1B',
                level: 1,
                line: 3,
            },
        ]);
    });
});
