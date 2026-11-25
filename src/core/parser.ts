// VS Code API に依存しない純粋な目次パーサーモジュール

import { LANGUAGE_PATTERNS, PATTERNS } from './patterns';
import { ParseOptions, TocNode } from './types';

/**
 * 1行のテキストからカスタム見出しマーカーを検出する。
 * 対応コメント形式: #, //, /* *\/, /** *\/, <!-- -->, {/* *\/}
 * @param text 判定対象の行テキスト
 * @param markers 各レベルのマーカー配列（index 0 = level 1）
 * @returns 一致した場合は level と label、一致しない場合は null
 */
export function matchHeadingMarker(
    text: string,
    markers: readonly string[]
): { level: number; label: string } | null {
    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Pattern for different comment styles:
        // - # marker text (Python, Ruby, Shell, YAML)
        // - // marker text (JS, TS, C++, etc.)
        // - /* marker text */ (CSS, C, etc.)
        // - /** marker text */ (JSDoc)
        // - <!-- marker text --> (HTML, XML)
        // - {/* marker text */} (JSX, TSX)
        const patterns = [
            new RegExp(`^\\s*#\\s*${escapedMarker}\\s+(.+)$`),
            new RegExp(`^\\s*\\/\\/\\s*${escapedMarker}\\s+(.+)$`),
            new RegExp(`^\\s*\\/\\*\\s*${escapedMarker}\\s+(.+?)\\s*\\*\\/\\s*$`),
            new RegExp(`^\\s*\\/\\*\\*\\s*${escapedMarker}\\s+(.+?)\\s*\\*\\/\\s*$`),
            new RegExp(`^\\s*<!--\\s*${escapedMarker}\\s+(.+?)\\s*-->`),
            new RegExp(`^\\s*\\{\\/\\*\\s*${escapedMarker}\\s+(.+?)\\s*\\*\\/\\}\\s*$`),
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return {
                    level: i + 1,
                    label: match[1].trim(),
                };
            }
        }
    }
    return null;
}

/**
 * 行配列を解析して階層構造の目次ツリー（TocNode[]）を構築する。
 */
export function parseLines(lines: readonly string[], options: ParseOptions): TocNode[] {
    const items: TocNode[] = [];
    const stack: { level: number; node: TocNode }[] = [];
    const langId = options.languageId;
    const headingMarkers = options.headingMarkers ?? {};
    const workspaceConfig = options.workspaceConfig ?? null;

    // Get heading markers for this language (e.g., ["@", "$", "&"])
    const markers = headingMarkers[langId] || [];

    // Markdown のフェンスコードブロック状態追跡用
    let closingFenceRegex: RegExp | null = null;

    for (let i = 0; i < lines.length; i++) {
        const text = lines[i];

        // Markdown のコードブロック（``` または ~~~）内は見出し検出をスキップ
        if (langId === 'markdown') {
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
        }

        let level: number | null = null;
        let label: string | null = null;

        // Priority 1: Heading markers (if configured for this language)
        if (markers.length > 0) {
            const markerResult = matchHeadingMarker(text, markers);
            if (markerResult) {
                level = markerResult.level;
                label = markerResult.label;
            }
        }

        // Priority 2: Workspace patterns (.vscode/mokuji.json)
        // headingMarkersが未設定かつワークスペース設定がある場合に適用
        if (level === null && markers.length === 0) {
            const wsPatterns = workspaceConfig?.parsers?.[langId]?.patterns;
            if (wsPatterns) {
                for (const wp of wsPatterns) {
                    try {
                        const match = text.match(new RegExp(wp.regex));
                        if (match) {
                            const rawLevel = match[wp.levelGroup];
                            level = typeof rawLevel === 'string' ? rawLevel.length : null;
                            label = match[wp.labelGroup]?.trim() ?? null;
                            break;
                        }
                    } catch {
                        // 無効な正規表現はスキップ
                    }
                }
            }
        }

        // Priority 3: Default patterns (only if headingMarkers and workspace patterns are NOT configured)
        // 言語IDに対応するパターンのみ試行する（未登録言語は検出しない）
        if (level === null && markers.length === 0 && !workspaceConfig?.parsers?.[langId]) {
            const activePatternNames = LANGUAGE_PATTERNS[langId];
            if (activePatternNames) {
                for (const patternName of activePatternNames) {
                    const match = text.match(PATTERNS[patternName]);
                    if (match) {
                        level = match[1].length;
                        label = match[2].trim();
                        break;
                    }
                }
            }
        }

        if (level !== null && label !== null) {
            const node: TocNode = {
                label,
                level,
                line: i,
                children: [],
            };

            // Find parent
            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            if (stack.length > 0) {
                stack[stack.length - 1].node.children.push(node);
            } else {
                items.push(node);
            }

            stack.push({ level, node });
        }
    }

    return items;
}

/**
 * テキスト文字列全体（LF / CRLF 両対応）を解析して目次ツリーを構築する。
 */
export function parseText(content: string, options: ParseOptions): TocNode[] {
    return parseLines(content.split(/\r?\n/), options);
}

/**
 * 階層構造の TocNode ツリーを行きがけ順（pre-order）で1次元配列に平坦化する。
 */
export function flattenToc(nodes: readonly TocNode[]): TocNode[] {
    const result: TocNode[] = [];
    for (const node of nodes) {
        result.push(node);
        if (node.children.length > 0) {
            result.push(...flattenToc(node.children));
        }
    }
    return result;
}
