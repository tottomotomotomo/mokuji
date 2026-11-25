// VS Code API に依存しない言語別見出し正規表現パターン定義

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
