// VS Code API に依存しない純粋な見出し Linter モジュール

import { flattenToc, parseLines } from './parser';
import { formatHeadingComment, LANGUAGE_PATTERNS, PATTERNS } from './patterns';
import { LintIssue, ParseOptions, PatternName, TocNode } from './types';

// // #region, //#region, //# sourceMappingURL=..., //# sourceURL=... などのプラグマ除外用
const SLASH_PRAGMA_RE = /^\s*\/\/\s*#\s*(?:sourceMappingURL|sourceURL|region|endregion)\b/i;

// 単一 # に続く 3〜8 桁の16進カラーコード除外用 (例: #fff, #ffffff, #ff00aa80)
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}\b/;

/**
 * 行内の最初の非空白文字カラムと行末カラムを返す。
 */
function getLineSpan(lineText: string): { indent: string; startColumn: number; endColumn: number } {
    const indentMatch = lineText.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const startColumn = indent.length < lineText.length ? indent.length : 0;
    const endColumn = lineText.length;
    return { indent, startColumn, endColumn };
}

/**
 * 既存の有効な見出し行のコメントスタイルを維持しつつ、指定レベルの見出しテキストを生成する。
 */
function formatReplacementPreservingStyle(
    lineText: string,
    languageId: string,
    targetLevel: number,
    label: string,
    headingMarkers?: Record<string, string[]>,
    hasWorkspaceParser?: boolean
): string | undefined {
    const { indent } = getLineSpan(lineText);
    const markers = headingMarkers?.[languageId] ?? [];

    if (markers.length > 0) {
        return formatHeadingComment(languageId, targetLevel, label, headingMarkers, indent) ?? undefined;
    }

    if (hasWorkspaceParser) {
        return undefined;
    }

    const activePatterns = LANGUAGE_PATTERNS[languageId];
    if (activePatterns) {
        const hashes = '#'.repeat(Math.min(6, Math.max(1, Math.floor(targetLevel))));
        const cleanLabel = label.trim();
        for (const patternName of activePatterns) {
            if (PATTERNS[patternName].test(lineText)) {
                return formatByPatternName(patternName, indent, hashes, cleanLabel);
            }
        }
    }

    return formatHeadingComment(languageId, targetLevel, label, headingMarkers, indent) ?? undefined;
}

function formatByPatternName(
    patternName: PatternName,
    indent: string,
    hashes: string,
    cleanLabel: string
): string {
    switch (patternName) {
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

/**
 * 単一行に対して built-in `#` パターンのスペース不足（missing-space）を検査する。
 */
function checkMissingSpaceOnLine(
    text: string,
    lineIndex: number,
    activePatternNames: readonly PatternName[]
): LintIssue | null {
    // 1. slash: // # Label
    if (activePatternNames.includes('slash')) {
        if (!SLASH_PRAGMA_RE.test(text)) {
            // //に続くスペース不足: //# Title
            const missingAfterSlash = text.match(/^(\s*)\/\/(#{1,6})\s+(.+)$/);
            if (missingAfterSlash) {
                const indent = missingAfterSlash[1];
                const hashes = missingAfterSlash[2];
                const rawLabel = missingAfterSlash[3].trim();
                if (rawLabel.length > 0) {
                    const { startColumn, endColumn } = getLineSpan(text);
                    return {
                        code: 'missing-space',
                        severity: 'warning',
                        message: `Missing space after '//' in Mokuji heading comment (expected '// ${hashes} ${rawLabel}')`,
                        line: lineIndex,
                        startColumn,
                        endColumn,
                        replacement: `${indent}// ${hashes} ${rawLabel}`,
                    };
                }
            }

            // #に続くスペース不足: // #Title
            const missingAfterHash = text.match(/^(\s*)\/\/\s+(#{1,6})([^\s#].*)$/);
            if (missingAfterHash) {
                const indent = missingAfterHash[1];
                const hashes = missingAfterHash[2];
                const rawLabel = missingAfterHash[3].trim();
                const isHexColor = hashes === '#' && HEX_COLOR_RE.test(`${hashes}${rawLabel}`);
                if (rawLabel.length > 0 && !isHexColor) {
                    const { startColumn, endColumn } = getLineSpan(text);
                    return {
                        code: 'missing-space',
                        severity: 'warning',
                        message: `Missing space after '${hashes}' in Mokuji heading comment (expected '// ${hashes} ${rawLabel}')`,
                        line: lineIndex,
                        startColumn,
                        endColumn,
                        replacement: `${indent}// ${hashes} ${rawLabel}`,
                    };
                }
            }
        }
    }

    // 2. block: /* # Label */
    if (activePatternNames.includes('block')) {
        const missingAfterOpen = text.match(/^(\s*)\/\*(#{1,6})\s+(.+?)\s*\*\/\s*$/);
        if (missingAfterOpen) {
            const indent = missingAfterOpen[1];
            const hashes = missingAfterOpen[2];
            const rawLabel = missingAfterOpen[3].trim();
            if (rawLabel.length > 0) {
                const { startColumn, endColumn } = getLineSpan(text);
                return {
                    code: 'missing-space',
                    severity: 'warning',
                    message: `Missing space in block heading comment (expected '/* ${hashes} ${rawLabel} */')`,
                    line: lineIndex,
                    startColumn,
                    endColumn,
                    replacement: `${indent}/* ${hashes} ${rawLabel} */`,
                };
            }
        }

        const missingAfterBlockHash = text.match(/^(\s*)\/\*\s+(#{1,6})([^\s#*].*?)\s*\*\/\s*$/);
        if (missingAfterBlockHash) {
            const indent = missingAfterBlockHash[1];
            const hashes = missingAfterBlockHash[2];
            const rawLabel = missingAfterBlockHash[3].trim();
            const isHexColor = hashes === '#' && (
                /^[0-9a-fA-F]{3,8}$/.test(rawLabel) || HEX_COLOR_RE.test(`${hashes}${rawLabel}`)
            );
            if (rawLabel.length > 0 && !isHexColor) {
                const { startColumn, endColumn } = getLineSpan(text);
                return {
                    code: 'missing-space',
                    severity: 'warning',
                    message: `Missing space after '${hashes}' in block heading comment (expected '/* ${hashes} ${rawLabel} */')`,
                    line: lineIndex,
                    startColumn,
                    endColumn,
                    replacement: `${indent}/* ${hashes} ${rawLabel} */`,
                };
            }
        }

        // 閉じ */ 直前のスペース不足: /* # Label*/
        const missingBeforeClose = text.match(/^(\s*)\/\*\s+(#{1,6})\s+(.+?)\*\/\s*$/);
        if (missingBeforeClose) {
            const indent = missingBeforeClose[1];
            const hashes = missingBeforeClose[2];
            const rawLabel = missingBeforeClose[3].trim();
            const isHexColor = hashes === '#' && (
                /^[0-9a-fA-F]{3,8}$/.test(rawLabel) || HEX_COLOR_RE.test(`${hashes}${rawLabel}`)
            );
            if (rawLabel.length > 0 && !isHexColor) {
                const { startColumn, endColumn } = getLineSpan(text);
                return {
                    code: 'missing-space',
                    severity: 'warning',
                    message: `Missing space before '*/' in block heading comment (expected '/* ${hashes} ${rawLabel} */')`,
                    line: lineIndex,
                    startColumn,
                    endColumn,
                    replacement: `${indent}/* ${hashes} ${rawLabel} */`,
                };
            }
        }
    }

    // 3. hashComment (Python): # # Label
    if (activePatternNames.includes('hashComment')) {
        const missingAfterPyHash = text.match(/^(\s*)#\s+(#{1,6})([^\s#].*)$/);
        if (missingAfterPyHash) {
            const indent = missingAfterPyHash[1];
            const hashes = missingAfterPyHash[2];
            const rawLabel = missingAfterPyHash[3].trim();
            if (rawLabel.length > 0) {
                const { startColumn, endColumn } = getLineSpan(text);
                return {
                    code: 'missing-space',
                    severity: 'warning',
                    message: `Missing space after '${hashes}' in Python heading comment (expected '# ${hashes} ${rawLabel}')`,
                    line: lineIndex,
                    startColumn,
                    endColumn,
                    replacement: `${indent}# ${hashes} ${rawLabel}`,
                };
            }
        }
    }

    // 4. md (Markdown): # Label
    if (activePatternNames.includes('md')) {
        const missingAfterMdHash = text.match(/^(\s*)(#{1,6})([^\s#!].*)$/);
        if (missingAfterMdHash) {
            const indent = missingAfterMdHash[1];
            const hashes = missingAfterMdHash[2];
            const rawLabel = missingAfterMdHash[3].trim();
            const isPureDigits = /^\d+$/.test(rawLabel);
            if (rawLabel.length > 0 && !isPureDigits) {
                const { startColumn, endColumn } = getLineSpan(text);
                return {
                    code: 'missing-space',
                    severity: 'warning',
                    message: `Missing space after '${hashes}' in Markdown heading (expected '${hashes} ${rawLabel}')`,
                    line: lineIndex,
                    startColumn,
                    endColumn,
                    replacement: `${indent}${hashes} ${rawLabel}`,
                };
            }
        }
    }

    return null;
}

/**
 * 同一階層（兄弟配列）内の重複見出しを再帰的に検査する。
 */
function collectDuplicateIssues(
    siblings: readonly TocNode[],
    lines: readonly string[],
    issues: LintIssue[]
): void {
    const seen = new Set<string>();
    for (const node of siblings) {
        const key = `${node.level}:${node.label}`;
        if (seen.has(key)) {
            const rawLine = lines[node.line] ?? '';
            const cleanLine = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
            const { startColumn, endColumn } = getLineSpan(cleanLine);
            issues.push({
                code: 'duplicate-heading',
                severity: 'information',
                message: `Duplicate heading '${node.label}' at level ${node.level}`,
                line: node.line,
                startColumn,
                endColumn,
            });
        } else {
            seen.add(key);
        }

        if (node.children.length > 0) {
            collectDuplicateIssues(node.children, lines, issues);
        }
    }
}

/**
 * 行配列を検査して見出しの LintIssue 一覧を返す。
 */
export function lintLines(lines: readonly string[], options: ParseOptions): LintIssue[] {
    const langId = options.languageId;
    const markers = options.headingMarkers?.[langId] ?? [];
    const hasMarkers = markers.length > 0;
    const hasWorkspaceParser = Boolean(options.workspaceConfig?.parsers?.[langId]);
    const activePatternNames = LANGUAGE_PATTERNS[langId];
    const hasBuiltinPatterns = Boolean(activePatternNames && activePatternNames.length > 0);

    if (!hasMarkers && !hasWorkspaceParser && !hasBuiltinPatterns) {
        return [];
    }

    const normalizedLines = lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
    const tree = parseLines(normalizedLines, options);
    const flatNodes = flattenToc(tree);
    const validHeadingLines = new Set<number>(flatNodes.map((n) => n.line));

    const issues: LintIssue[] = [];

    // Rule A: missing-space (built-in # パターン利用時のみ)
    if (!hasMarkers && !hasWorkspaceParser && activePatternNames) {
        let closingFenceRegex: RegExp | null = null;

        for (let i = 0; i < normalizedLines.length; i++) {
            const text = normalizedLines[i];

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

            if (validHeadingLines.has(i)) {
                continue;
            }

            const missingSpaceIssue = checkMissingSpaceOnLine(text, i, activePatternNames);
            if (missingSpaceIssue) {
                issues.push(missingSpaceIssue);
            }
        }
    }

    // Rule B: skipped-level
    for (let i = 1; i < flatNodes.length; i++) {
        const prev = flatNodes[i - 1];
        const curr = flatNodes[i];
        if (curr.level > prev.level + 1) {
            const expectedLevel = prev.level + 1;
            const lineText = normalizedLines[curr.line] ?? '';
            const { startColumn, endColumn } = getLineSpan(lineText);
            const replacement = formatReplacementPreservingStyle(
                lineText,
                langId,
                expectedLevel,
                curr.label,
                options.headingMarkers,
                hasWorkspaceParser
            );
            issues.push({
                code: 'skipped-level',
                severity: 'information',
                message: `Heading level jumped from ${prev.level} to ${curr.level} (expected level ${expectedLevel})`,
                line: curr.line,
                startColumn,
                endColumn,
                ...(replacement !== undefined ? { replacement } : {}),
            });
        }
    }

    // Rule C: duplicate-heading
    collectDuplicateIssues(tree, normalizedLines, issues);

    issues.sort((a, b) => a.line - b.line);
    return issues;
}

/**
 * テキスト文字列全体（LF / CRLF 両対応）を検査して見出しの LintIssue 一覧を返す。
 */
export function lintText(content: string, options: ParseOptions): LintIssue[] {
    return lintLines(content.split(/\r?\n/), options);
}
