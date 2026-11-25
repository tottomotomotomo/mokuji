// VS Code API に依存しない言語別見出し正規表現パターン & 書式フォーマッター定義

import { PatternName } from './types';

// グループ1: ハッシュ記号(1-6個) = レベル
// グループ2: ヘッダーテキスト = ラベル
export const PATTERNS: Record<PatternName, RegExp> = {
    // // # text (SCSS/LESS/JS/TS/Go style)
    slash:       /^\s*\/\/ (#+) (.*)$/,
    // /* # text */ (CSS/SCSS/LESS/Go style)
    block:       /^\s*\/\* (#+) (.*?) \*\/\s*$/,
    // <!-- # text --> (HTML/Vue/Svelte style)
    html:        /^\s*<!--\s*(#+)\s*(.*?)\s*-->/,
    // # text (Markdown native headers, trailing hashes are optional and removed)
    md:          /^\s*(#{1,6})\s+(.+?)(?:\s+#+)?$/,
    // /** # text */ (JSDoc style for JS/TS/Java)
    jsdoc:       /^\s*\/\*\*\s*(#+)\s*(.*?)\s*\*\/\s*$/,
    // # # text (Python: hash comment with level marker)
    // 先頭の # はコメント記号、その後の #+  がレベル指定
    hashComment: /^\s*#\s+(#{1,6})\s+(.+)$/,
    // {/* # text */} (JSX/TSX style)
    jsxBlock:    /^\s*\{\/\*\s*(#+)\s*(.*?)\s*\*\/\}\s*$/,
};

export const LANGUAGE_PATTERNS: Record<string, PatternName[]> = {
    css:              ['block'],
    scss:             ['slash', 'block'],
    less:             ['slash', 'block'],
    html:             ['html'],
    markdown:         ['md'],
    javascript:       ['slash', 'block', 'jsdoc'],
    typescript:       ['slash', 'block', 'jsdoc'],
    javascriptreact:  ['slash', 'block', 'jsdoc', 'jsxBlock'],
    typescriptreact:  ['slash', 'block', 'jsdoc', 'jsxBlock'],
    python:           ['hashComment'],
    java:             ['slash', 'block', 'jsdoc'],
    go:               ['slash', 'block'],
    vue:              ['html', 'slash', 'block', 'jsdoc'],
    svelte:           ['html', 'slash', 'block', 'jsdoc'],
};

export const SUPPORTED_LANGUAGE_IDS: readonly string[] = Object.keys(LANGUAGE_PATTERNS);

// 言語ごとの標準コメントラッパー種別（headingMarkers 使用時や見出し生成時に利用）
export type CommentStyle = 'slash' | 'block' | 'html' | 'md' | 'hash' | 'jsxBlock';

export const PRIMARY_COMMENT_STYLE: Record<string, CommentStyle> = {
    css: 'block',
    scss: 'slash',
    less: 'slash',
    html: 'html',
    markdown: 'md',
    javascript: 'slash',
    typescript: 'slash',
    javascriptreact: 'slash',
    typescriptreact: 'slash',
    python: 'hash',
    java: 'slash',
    go: 'slash',
    vue: 'slash',
    svelte: 'slash',
    ruby: 'hash',
    shellscript: 'hash',
    yaml: 'hash',
};

/**
 * 指定された言語ID・レベル(1-6)・ラベル・カスタムマーカーから、
 * Mokuji が認識可能な1行の見出しコメント文字列を生成する。
 * 対応していない言語かつ headingMarkers 未設定の場合は null を返す。
 */
export function formatHeadingComment(
    languageId: string,
    level: number,
    label: string,
    headingMarkers: Record<string, string[]> = {},
    indent: string = ''
): string | null {
    const clampedLevel = Math.min(6, Math.max(1, Math.floor(level)));
    const cleanLabel = label.trim();
    if (!cleanLabel) {
        return null;
    }

    const customMarkers = headingMarkers[languageId];
    if (customMarkers && customMarkers.length > 0) {
        if (clampedLevel > customMarkers.length) {
            return null;
        }
        const marker = customMarkers[clampedLevel - 1];
        const style = PRIMARY_COMMENT_STYLE[languageId] ?? 'slash';
        switch (style) {
            case 'block':
                return `${indent}/* ${marker} ${cleanLabel} */`;
            case 'html':
                return `${indent}<!-- ${marker} ${cleanLabel} -->`;
            case 'jsxBlock':
                return `${indent}{/* ${marker} ${cleanLabel} */}`;
            case 'hash':
            case 'md':
                return `${indent}# ${marker} ${cleanLabel}`;
            case 'slash':
            default:
                return `${indent}// ${marker} ${cleanLabel}`;
        }
    }

    const patternNames = LANGUAGE_PATTERNS[languageId];
    if (!patternNames || patternNames.length === 0) {
        return null;
    }

    const hashes = '#'.repeat(clampedLevel);
    const primary = patternNames[0];
    switch (primary) {
        case 'slash':
            return `${indent}// ${hashes} ${cleanLabel}`;
        case 'block':
            return `${indent}/* ${hashes} ${cleanLabel} */`;
        case 'html':
            return `${indent}<!-- ${hashes} ${cleanLabel} -->`;
        case 'md':
            return `${indent}${hashes} ${cleanLabel}`;
        case 'jsdoc':
            return `${indent}/** ${hashes} ${cleanLabel} */`;
        case 'hashComment':
            return `${indent}# ${hashes} ${cleanLabel}`;
        case 'jsxBlock':
            return `${indent}{/* ${hashes} ${cleanLabel} */}`;
    }
}
