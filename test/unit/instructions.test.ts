import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    generateAiInstructionsMarkdown,
    getTargetRelativePath,
    inferLanguageIdFromFilePath,
    mergeAiInstructionsContent,
    MOKUJI_INSTRUCTIONS_HEADING,
} from '../../src/core/instructions';
import { WorkspaceConfig } from '../../src/core/types';

describe('instructions: getTargetRelativePath & inferLanguageIdFromFilePath', () => {
    it('maps all AiInstructionTarget values to their workspace-relative paths', () => {
        assert.equal(getTargetRelativePath('agents-md'), 'AGENTS.md');
        assert.equal(
            getTargetRelativePath('copilot-instructions'),
            '.github/copilot-instructions.md'
        );
        assert.equal(getTargetRelativePath('claude-md'), 'CLAUDE.md');
    });

    it('infers supported language IDs from file paths', () => {
        assert.equal(inferLanguageIdFromFilePath('src/app.ts'), 'typescript');
        assert.equal(inferLanguageIdFromFilePath('src/View.tsx'), 'typescriptreact');
        assert.equal(inferLanguageIdFromFilePath('scripts/build.py'), 'python');
        assert.equal(inferLanguageIdFromFilePath('styles/main.css'), 'css');
        assert.equal(inferLanguageIdFromFilePath('README.unknown'), null);
        assert.equal(inferLanguageIdFromFilePath('Makefile'), null);
    });
});

describe('instructions: generateAiInstructionsMarkdown', () => {
    it('generates target-tailored Markdown with level 1-3 syntax examples and core rules', () => {
        const mdAgents = generateAiInstructionsMarkdown({
            languageIds: ['typescript', 'python', 'css', 'markdown'],
            target: 'agents-md',
        });

        assert.ok(mdAgents.startsWith(`${MOKUJI_INSTRUCTIONS_HEADING}\n`));
        assert.match(mdAgents, /AGENTS\.md/);
        assert.match(mdAgents, /Single space around `#`/);
        assert.match(mdAgents, /Do not skip heading levels/);
        assert.match(mdAgents, /Group logical sections/);
        assert.match(mdAgents, /Markdown fenced code blocks/);

        // Concrete L1-L3 syntax examples
        assert.match(mdAgents, /\/\/ # Main Section/);
        assert.match(mdAgents, /\/\/ ## Sub Section/);
        assert.match(mdAgents, /\/\/ ### Detail/);
        assert.match(mdAgents, /# # Main Section/);
        assert.match(mdAgents, /\/\* # Main Section \*\//);
        assert.match(mdAgents, /# Main Section/);

        const mdCopilot = generateAiInstructionsMarkdown({
            languageIds: [],
            target: 'copilot-instructions',
        });
        assert.match(mdCopilot, /GitHub Copilot/);
        // Default supported languages included when languageIds is empty
        assert.match(mdCopilot, /TypeScript/);
        assert.match(mdCopilot, /Python/);

        const mdClaude = generateAiInstructionsMarkdown({
            languageIds: ['go'],
            target: 'claude-md',
        });
        assert.match(mdClaude, /CLAUDE\.md/);
        assert.match(mdClaude, /\*\*Go\*\* \(`go`\)/);
    });

    it('reflects custom headingMarkers and .vscode/mokuji.json workspaceConfig patterns', () => {
        const workspaceConfig: WorkspaceConfig = {
            parsers: {
                java: {
                    patterns: [
                        {
                            regex: '^\\s*\\/\\/\\s*(=+)\\s+(.+)$',
                            levelGroup: 1,
                            labelGroup: 2,
                        },
                    ],
                },
            },
        };

        const md = generateAiInstructionsMarkdown({
            languageIds: ['python', 'java'],
            headingMarkers: {
                python: ['@', '$', '&'],
            },
            workspaceConfig,
            target: 'agents-md',
        });

        assert.match(md, /custom `mokuji\.headingMarkers`/);
        assert.match(md, /# @ Main Section/);
        assert.match(md, /# \$ Sub Section/);
        assert.match(md, /# & Detail/);
        assert.match(md, /custom `\.vscode\/mokuji\.json` regex rules/);
        assert.match(md, /level capture group: `1`, label capture group: `2`/);
    });
});

describe('instructions: mergeAiInstructionsContent', () => {
    it('creates clean content when existing file is empty and appends when section is absent', () => {
        const section = generateAiInstructionsMarkdown({
            languageIds: ['typescript'],
            target: 'agents-md',
        });

        const fromEmpty = mergeAiInstructionsContent('', section);
        assert.equal(fromEmpty, section);

        const existing = '# Project Agent Guide\n\nAlways run unit tests.\n';
        const appended = mergeAiInstructionsContent(existing, section);
        assert.match(appended, /^# Project Agent Guide\n\nAlways run unit tests\.\n\n## Mokuji Section Heading Conventions\n/);
    });

    it('idempotently replaces existing Mokuji section without breaking on fenced Markdown headings or surrounding sections', () => {
        // Include 'markdown' so generated section itself contains `# Main Section` and `## Sub Section` inside ``` fences!
        const initialSection = generateAiInstructionsMarkdown({
            languageIds: ['markdown'],
            target: 'agents-md',
        });
        const docWithSurrounding = [
            '# Repository Rules',
            '',
            'Keep commits atomic.',
            '',
            initialSection.trimEnd(),
            '',
            '## Testing Guidelines',
            '',
            'Run `npm test` before pushing.',
            '',
        ].join('\n');

        const updatedSection = generateAiInstructionsMarkdown({
            languageIds: ['python', 'markdown'],
            target: 'agents-md',
        });

        const mergedOnce = mergeAiInstructionsContent(docWithSurrounding, updatedSection);
        const mergedTwice = mergeAiInstructionsContent(mergedOnce, updatedSection);

        assert.equal(mergedOnce, mergedTwice, 'Merging twice must be completely idempotent');
        assert.equal(
            mergedOnce.split(MOKUJI_INSTRUCTIONS_HEADING).length - 1,
            1,
            'Must contain exactly one Mokuji heading section'
        );
        assert.match(mergedOnce, /# Repository Rules/);
        assert.match(mergedOnce, /\*\*Python\*\* \(`python`\)/);
        assert.match(mergedOnce, /## Testing Guidelines\n\nRun `npm test` before pushing\./);
    });

    it('preserves CRLF line endings when merging into CRLF files', () => {
        const existingCrlf = '# Guide\r\n\r\nIntro.\r\n';
        const section = generateAiInstructionsMarkdown({
            languageIds: ['css'],
            target: 'claude-md',
        });
        const merged = mergeAiInstructionsContent(existingCrlf, section);
        assert.ok(merged.includes('\r\n'));
        assert.equal(/(?<!\r)\n/.test(merged), false, 'Should not contain bare LF characters');
    });
});
