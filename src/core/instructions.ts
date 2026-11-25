// VS Code API に依存しない AI コーディングエージェント向け見出し規約ドキュメント生成モジュール

import { formatHeadingComment, SUPPORTED_LANGUAGE_IDS } from './patterns';
import { AiInstructionTarget, WorkspaceConfig } from './types';

export const MOKUJI_INSTRUCTIONS_HEADING = '## Mokuji Section Heading Conventions';

export const DEFAULT_INSTRUCTION_LANGUAGES: readonly string[] = [
    'typescript',
    'javascript',
    'python',
    'css',
    'html',
    'go',
];

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.html': 'html',
    '.htm': 'html',
    '.md': 'markdown',
    '.java': 'java',
    '.go': 'go',
    '.vue': 'vue',
    '.svelte': 'svelte',
};

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
    css: 'CSS',
    scss: 'SCSS',
    less: 'LESS',
    html: 'HTML',
    markdown: 'Markdown',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    javascriptreact: 'JSX (React)',
    typescriptreact: 'TSX (React)',
    python: 'Python',
    java: 'Java',
    go: 'Go',
    vue: 'Vue',
    svelte: 'Svelte',
};

export interface GenerateAiInstructionsParams {
    languageIds: readonly string[];
    headingMarkers?: Record<string, string[]>;
    workspaceConfig?: WorkspaceConfig | null;
    target: AiInstructionTarget;
}

/**
 * 出力ターゲット種別からワークスペースルート相対パスを返す。
 */
export function getTargetRelativePath(target: AiInstructionTarget): string {
    switch (target) {
        case 'agents-md':
            return 'AGENTS.md';
        case 'copilot-instructions':
            return '.github/copilot-instructions.md';
        case 'claude-md':
            return 'CLAUDE.md';
    }
}

/**
 * ファイルパス（または拡張子）から対応する言語IDを推定する。未対応の場合は null を返す。
 */
export function inferLanguageIdFromFilePath(filePath: string): string | null {
    const lower = filePath.toLowerCase();
    const dotIndex = lower.lastIndexOf('.');
    if (dotIndex === -1) {
        return null;
    }
    const ext = lower.slice(dotIndex);
    return EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

function getTargetIntroLine(target: AiInstructionTarget): string {
    switch (target) {
        case 'agents-md':
            return 'When creating or refactoring source files in this repository, organize logical sections using **Mokuji** heading comments so developers and AI agents (`AGENTS.md`) can navigate large files quickly.';
        case 'copilot-instructions':
            return 'When GitHub Copilot edits or generates files in this repository, preserve and add **Mokuji** section heading comments so the Table of Contents stays structured and navigable.';
        case 'claude-md':
            return 'When Claude reads or edits files in this repository, follow **Mokuji** section heading comment conventions (`CLAUDE.md`) to maintain a clean Table of Contents.';
    }
}

function resolveEffectiveLanguages(
    requestedLanguageIds: readonly string[],
    headingMarkers: Record<string, string[]>,
    workspaceConfig: WorkspaceConfig | null
): string[] {
    const supportedSet = new Set<string>(SUPPORTED_LANGUAGE_IDS);
    const configuredLanguages = [
        ...Object.keys(headingMarkers).filter((k) => (headingMarkers[k]?.length ?? 0) > 0),
        ...Object.keys(workspaceConfig?.parsers ?? {}),
    ];

    const candidates =
        requestedLanguageIds.length > 0
            ? [...requestedLanguageIds, ...configuredLanguages]
            : [...configuredLanguages];

    const filtered: string[] = [];
    const seen = new Set<string>();

    for (const rawLang of candidates) {
        const lang = rawLang.trim();
        if (!lang || seen.has(lang)) {
            continue;
        }
        const hasSupport =
            supportedSet.has(lang) ||
            (headingMarkers[lang]?.length ?? 0) > 0 ||
            Boolean(workspaceConfig?.parsers?.[lang]?.patterns?.length);
        if (hasSupport) {
            seen.add(lang);
            filtered.push(lang);
        }
    }

    if (filtered.length === 0) {
        for (const fallbackLang of DEFAULT_INSTRUCTION_LANGUAGES) {
            if (!seen.has(fallbackLang)) {
                seen.add(fallbackLang);
                filtered.push(fallbackLang);
            }
        }
    }

    return filtered;
}

/**
 * AI エージェント向けの Mokuji 見出し規約 Markdown セクションを生成する。
 */
export function generateAiInstructionsMarkdown(params: GenerateAiInstructionsParams): string {
    const headingMarkers = params.headingMarkers ?? {};
    const workspaceConfig = params.workspaceConfig ?? null;
    const languages = resolveEffectiveLanguages(
        params.languageIds,
        headingMarkers,
        workspaceConfig
    );

    const lines: string[] = [
        MOKUJI_INSTRUCTIONS_HEADING,
        '',
        getTargetIntroLine(params.target),
        '',
        '### Key Rules',
        '',
        '- **Single space around `#` (or custom marker)**: Always place a single space before and after the level hashes (e.g., `// # Section`, never `//# Section` or `// #Section`).',
        '- **Do not skip heading levels**: Start major top-level sections at level 1 (`#`), nest subsections at level 2 (`##`), then level 3 (`###`). Never jump directly from level 1 to level 3.',
        '- **Group logical sections, not every line**: Add headings for meaningful logical blocks (such as Imports & Constants, Types, Core Logic, Event Handlers, or Styles) rather than every variable or trivial helper.',
        '- **Markdown fenced code blocks**: Avoid placing `#` comment headings inside Markdown fenced code blocks unless they are intentional code examples (Mokuji skips fenced code blocks when parsing Markdown TOC).',
        '- **Avoid duplicate sibling headings**: Use concise, distinct section titles so every entry in the Table of Contents is unambiguous.',
        '',
        '### Comment Syntax by Language (Levels 1–3)',
        '',
    ];

    for (const lang of languages) {
        const displayName = LANGUAGE_DISPLAY_NAMES[lang] ?? lang;
        const customMarkers = headingMarkers[lang];
        const wsPatterns = workspaceConfig?.parsers?.[lang]?.patterns;

        if (customMarkers && customMarkers.length > 0) {
            lines.push(`- **${displayName}** (\`${lang}\`, custom \`mokuji.headingMarkers\`: \`${JSON.stringify(customMarkers)}\`):`);
            lines.push('  ```');
            const maxLevel = Math.min(3, customMarkers.length);
            const sampleLabels = ['Main Section', 'Sub Section', 'Detail'];
            for (let lvl = 1; lvl <= maxLevel; lvl++) {
                const formatted = formatHeadingComment(
                    lang,
                    lvl,
                    sampleLabels[lvl - 1],
                    headingMarkers
                );
                if (formatted) {
                    lines.push(`  ${formatted}`);
                }
            }
            lines.push('  ```');
            continue;
        }

        if (wsPatterns && wsPatterns.length > 0) {
            lines.push(`- **${displayName}** (\`${lang}\`, custom \`.vscode/mokuji.json\` regex rules):`);
            for (const wp of wsPatterns) {
                lines.push(
                    `  - Pattern: \`${wp.regex}\` (level capture group: \`${wp.levelGroup}\`, label capture group: \`${wp.labelGroup}\`)`
                );
            }
            continue;
        }

        const l1 = formatHeadingComment(lang, 1, 'Main Section');
        const l2 = formatHeadingComment(lang, 2, 'Sub Section');
        const l3 = formatHeadingComment(lang, 3, 'Detail');
        if (l1 && l2 && l3) {
            lines.push(`- **${displayName}** (\`${lang}\`):`);
            lines.push('  ```');
            lines.push(`  ${l1}`);
            lines.push(`  ${l2}`);
            lines.push(`  ${l3}`);
            lines.push('  ```');
        }
    }

    return lines.join('\n') + '\n';
}

/**
 * 既存の指示ファイル内容に Mokuji セクションを冪等にマージする。
 * 既に `## Mokuji Section Heading Conventions` セクションが存在する場合はそのブロックのみを置換し、
 * 存在しない場合は末尾に追記する。フェンスコードブロック内の `#` や `##` には誤反応しない。
 */
export function mergeAiInstructionsContent(
    existingContent: string,
    generatedSection: string
): string {
    const eol = existingContent.includes('\r\n') ? '\r\n' : '\n';
    const normalizedSection = generatedSection.replace(/\r?\n/g, eol).trimEnd();

    if (existingContent.trim().length === 0) {
        return normalizedSection + eol;
    }

    const lines = existingContent.split(/\r?\n/);
    let closingFenceRegex: RegExp | null = null;
    let startIdx = -1;
    let endIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
        const text = lines[i];

        if (closingFenceRegex !== null) {
            if (closingFenceRegex.test(text)) {
                closingFenceRegex = null;
            }
            continue;
        }

        const backtickMatch = text.match(/^\s*(`{3,})[^`]*$/);
        const tildeMatch = !backtickMatch ? text.match(/^\s*(~{3,})/) : null;
        const fence = backtickMatch?.[1] ?? tildeMatch?.[1];
        if (fence) {
            const char = fence[0];
            const len = fence.length;
            closingFenceRegex = new RegExp(`^\\s*${char}{${len},}\\s*$`);
            continue;
        }

        if (startIdx === -1) {
            if (/^##\s+Mokuji Section Heading Conventions\s*$/.test(text)) {
                startIdx = i;
            }
        } else if (/^#{1,2}\s+\S/.test(text)) {
            endIdx = i;
            break;
        }
    }

    if (startIdx !== -1) {
        const before = lines.slice(0, startIdx);
        const after = lines.slice(endIdx);

        while (before.length > 0 && before[before.length - 1].trim() === '') {
            before.pop();
        }
        while (after.length > 0 && after[0].trim() === '') {
            after.shift();
        }
        while (after.length > 0 && after[after.length - 1].trim() === '') {
            after.pop();
        }

        const chunks: string[] = [];
        if (before.length > 0) {
            chunks.push(before.join(eol));
        }
        chunks.push(normalizedSection);
        if (after.length > 0) {
            chunks.push(after.join(eol));
        }
        return chunks.join(eol + eol) + eol;
    }

    const trimmedExisting = existingContent.replace(/(\r?\n)+$/, '');
    return trimmedExisting + eol + eol + normalizedSection + eol;
}
