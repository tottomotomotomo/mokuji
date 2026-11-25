// VS Code API に依存しない純粋なプロンプト構築・応答パース・フォールバック提案モジュール

import { flattenToc } from './parser';
import { formatHeadingComment } from './patterns';
import { OutlineSymbolInput, SectionSuggestion, TocNode } from './types';

export const DEFAULT_MAX_PROMPT_LINES = 1500;
export const DEFAULT_MAX_SUGGESTIONS = 12;

export interface SuggestSectionsPromptParams {
    content: string;
    languageId: string;
    headingMarkers?: Record<string, string[]>;
    existingHeadings?: readonly TocNode[];
    maxSuggestions?: number;
    maxLines?: number;
}

const TOP_LEVEL_SYMBOL_KINDS = new Set<string>([
    'class',
    'interface',
    'struct',
    'module',
    'namespace',
    'package',
    'function',
    'enum',
]);

const CHILD_SYMBOL_KINDS = new Set<string>([
    'method',
    'function',
    'constructor',
    'class',
    'interface',
    'struct',
    'enum',
]);

/**
 * セクション見出し提案用の LLM プロンプト文字列を構築する。
 */
export function buildSuggestSectionsPrompt(params: SuggestSectionsPromptParams): string {
    const {
        content,
        languageId,
        headingMarkers = {},
        existingHeadings = [],
        maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
        maxLines = DEFAULT_MAX_PROMPT_LINES,
    } = params;

    const allLines = content.split(/\r?\n/);
    const totalLines = allLines.length;
    const effectiveMaxLines = Math.max(1, Math.floor(maxLines));
    const visibleLines = allLines.slice(0, effectiveMaxLines);
    const numberedLines = visibleLines.map((lineText, idx) => `${idx + 1}: ${lineText}`).join('\n');
    const truncationNote =
        totalLines > effectiveMaxLines
            ? `\n... [truncated ${totalLines - effectiveMaxLines} remaining lines out of ${totalLines}; only suggest line numbers within 1..${effectiveMaxLines}]`
            : '';

    const exampleL1 =
        formatHeadingComment(languageId, 1, 'Main Section', headingMarkers) ?? '// # Main Section';
    const exampleL2 =
        formatHeadingComment(languageId, 2, 'Sub Section', headingMarkers) ?? '// ## Sub Section';
    const exampleL3 =
        formatHeadingComment(languageId, 3, 'Detail', headingMarkers) ?? '// ### Detail';

    const flatExisting = flattenToc(existingHeadings);
    const existingSectionText =
        flatExisting.length > 0
            ? flatExisting
                  .map((h) => `- Line ${h.line + 1} (Level ${h.level}): ${h.label}`)
                  .join('\n')
            : '(none)';

    return [
        `You are assisting Mokuji, a Table of Contents organizer for source code.`,
        `Analyze the following "${languageId}" file and suggest logical section headings to make it easy to navigate.`,
        ``,
        `## Mokuji Sectioning Philosophy`,
        `- Group related declarations (e.g., imports/configuration, types/models, core classes/components, helper functions, event handlers, styles) into meaningful, human-readable sections.`,
        `- Do NOT create a heading for every single variable, property, or one-line helper.`,
        `- Keep heading hierarchy clean: start top-level sections at level 1, subsections at level 2, etc. Never skip heading levels (e.g., do not jump from 1 to 3).`,
        `- Target comment format in "${languageId}" (for reference only — return plain labels without comment markers):`,
        `  - Level 1: ${exampleL1}`,
        `  - Level 2: ${exampleL2}`,
        `  - Level 3: ${exampleL3}`,
        `- Suggest at most ${maxSuggestions} new section headings.`,
        `- Do NOT duplicate or place a new heading on/immediately below existing Mokuji headings.`,
        ``,
        `## Existing Mokuji Headings`,
        existingSectionText,
        ``,
        `## Output Format`,
        `Respond ONLY with a valid JSON array (no prose, no explanations). Each element must have:`,
        `{ "line": <1-indexed line number before which to insert the heading>, "level": <integer 1-6>, "label": "<concise section title>" }`,
        `If no new headings are needed, respond with [].`,
        ``,
        `## Numbered File Content (${Math.min(totalLines, effectiveMaxLines)} of ${totalLines} lines)`,
        numberedLines + truncationNote,
    ].join('\n');
}

/**
 * 生の LLM 応答文字列から JSON 配列を抽出する。
 */
function extractJsonArray(rawText: string): unknown[] | null {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return null;
    }

    // 1. 直接 JSON としてパース試行
    try {
        const direct = JSON.parse(trimmed);
        if (Array.isArray(direct)) {
            return direct;
        }
    } catch {
        // 次の抽出戦略へ進む
    }

    // 2. Markdown コードブロック ```json ... ``` から抽出試行
    const fenceRegex = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = fenceRegex.exec(trimmed)) !== null) {
        try {
            const parsed = JSON.parse(fenceMatch[1].trim());
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            // 次のブロックを試行
        }
    }

    // 3. 最外殻の '[' ... ']' を試行
    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
            const parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            // 複数ブラケットが含まれる散文向けにバランス走査へフォールバック
        }
    }

    // 4. 文字列リテラルを考慮したバランス '[' ... ']' スライス走査
    for (let start = 0; start < trimmed.length; start++) {
        if (trimmed[start] !== '[') {
            continue;
        }
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let end = start; end < trimmed.length; end++) {
            const ch = trimmed[end];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
            } else if (ch === '[') {
                depth++;
            } else if (ch === ']') {
                depth--;
                if (depth === 0) {
                    try {
                        const parsed = JSON.parse(trimmed.slice(start, end + 1));
                        if (Array.isArray(parsed)) {
                            return parsed;
                        }
                    } catch {
                        // 次の '[' 候補を試す
                    }
                    break;
                }
            }
        }
    }

    return null;
}

/**
 * LLM の応答テキストを検証・正規化し、0-indexed の SectionSuggestion 配列を返す。
 */
export function parseSuggestSectionsResponse(
    rawText: string,
    totalLines: number,
    existingHeadingLines?: ReadonlySet<number>
): SectionSuggestion[] {
    if (totalLines <= 0) {
        return [];
    }

    const items = extractJsonArray(rawText);
    if (!items) {
        return [];
    }

    const seenLines = new Set<number>();
    const results: SectionSuggestion[] = [];

    for (const item of items) {
        if (typeof item !== 'object' || item === null) {
            continue;
        }
        const record = item as Record<string, unknown>;
        if (typeof record.line !== 'number' || !Number.isFinite(record.line)) {
            continue;
        }
        if (typeof record.label !== 'string') {
            continue;
        }

        const zeroIndexedLine = Math.floor(record.line) - 1;
        if (zeroIndexedLine < 0 || zeroIndexedLine >= totalLines) {
            continue;
        }

        const cleanLabel = record.label.replace(/[\r\n]+/g, ' ').trim();
        if (!cleanLabel) {
            continue;
        }

        if (
            existingHeadingLines &&
            (existingHeadingLines.has(zeroIndexedLine) ||
                existingHeadingLines.has(zeroIndexedLine - 1))
        ) {
            continue;
        }

        if (seenLines.has(zeroIndexedLine)) {
            continue;
        }

        const rawLevel =
            record.level === undefined
                ? 1
                : typeof record.level === 'number'
                  ? record.level
                  : Number(record.level);
        if (!Number.isFinite(rawLevel)) {
            continue;
        }
        const clampedLevel = Math.min(6, Math.max(1, Math.floor(rawLevel)));

        seenLines.add(zeroIndexedLine);
        results.push({
            line: zeroIndexedLine,
            level: clampedLevel,
            label: cleanLabel,
        });
    }

    results.sort((a, b) => a.line - b.line);
    return results;
}

/**
 * DocumentSymbol 相当のアウトライン構造から決定論的に見出し提案を生成する（オフラインフォールバック用）。
 */
export function buildOutlineFallbackSuggestions(
    symbols: readonly OutlineSymbolInput[],
    existingHeadingLines?: ReadonlySet<number>
): SectionSuggestion[] {
    const candidates: SectionSuggestion[] = [];

    for (const sym of symbols) {
        const kindLower = sym.kindName.trim().toLowerCase();
        const label = sym.name.replace(/[\r\n]+/g, ' ').trim();
        if (!TOP_LEVEL_SYMBOL_KINDS.has(kindLower) || !label || sym.line < 0) {
            continue;
        }

        const line = Math.floor(sym.line);
        if (
            !existingHeadingLines ||
            (!existingHeadingLines.has(line) && !existingHeadingLines.has(line - 1))
        ) {
            candidates.push({
                line,
                level: 1,
                label,
            });
        }

        if (sym.children && sym.children.length > 0) {
            for (const child of sym.children) {
                const childKindLower = child.kindName.trim().toLowerCase();
                const childLabel = child.name.replace(/[\r\n]+/g, ' ').trim();
                if (!CHILD_SYMBOL_KINDS.has(childKindLower) || !childLabel || child.line < 0) {
                    continue;
                }
                const childLine = Math.floor(child.line);
                if (
                    existingHeadingLines &&
                    (existingHeadingLines.has(childLine) || existingHeadingLines.has(childLine - 1))
                ) {
                    continue;
                }
                candidates.push({
                    line: childLine,
                    level: 2,
                    label: childLabel,
                });
            }
        }
    }

    const seenLines = new Set<number>();
    const deduped: SectionSuggestion[] = [];
    for (const candidate of candidates) {
        if (!seenLines.has(candidate.line)) {
            seenLines.add(candidate.line);
            deduped.push(candidate);
        }
    }

    deduped.sort((a, b) => a.line - b.line);
    return deduped;
}

/**
 * 言語サーバーの DocumentSymbol が未起動の場合（ヘッドレステスト環境等）でも機能する
 * 軽量な正規表現ベースのシンボル抽出フォールバック。
 */
export function extractRegexOutlineSymbols(
    content: string,
    languageId: string
): OutlineSymbolInput[] {
    if (languageId === 'markdown') {
        return [];
    }

    const lines = content.split(/\r?\n/);
    const results: OutlineSymbolInput[] = [];

    if (languageId === 'python') {
        let currentClass: { symbol: OutlineSymbolInput; indent: number } | null = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
            if (currentClass && indent <= currentClass.indent) {
                currentClass = null;
            }

            const classMatch = line.match(/^(\s*)class\s+([A-Za-z_]\w*)\b/);
            if (classMatch && indent === 0) {
                const clsSymbol: OutlineSymbolInput = {
                    name: classMatch[2],
                    kindName: 'Class',
                    line: i,
                    children: [],
                };
                results.push(clsSymbol);
                currentClass = { symbol: clsSymbol, indent };
                continue;
            }

            const defMatch = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
            if (defMatch) {
                if (indent === 0) {
                    results.push({
                        name: defMatch[2],
                        kindName: 'Function',
                        line: i,
                    });
                } else if (currentClass && indent > currentClass.indent) {
                    currentClass.symbol.children = currentClass.symbol.children ?? [];
                    currentClass.symbol.children.push({
                        name: defMatch[2],
                        kindName: defMatch[2] === '__init__' ? 'Constructor' : 'Method',
                        line: i,
                    });
                }
            }
        }
        return results;
    }

    if (languageId === 'go') {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                continue;
            }
            const structMatch = line.match(/^type\s+([A-Za-z_]\w*)\s+struct\b/);
            if (structMatch) {
                results.push({ name: structMatch[1], kindName: 'Struct', line: i });
                continue;
            }
            const ifaceMatch = line.match(/^type\s+([A-Za-z_]\w*)\s+interface\b/);
            if (ifaceMatch) {
                results.push({ name: ifaceMatch[1], kindName: 'Interface', line: i });
                continue;
            }
            const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s*)?([A-Za-z_]\w*)\s*\(/);
            if (funcMatch) {
                results.push({ name: funcMatch[1], kindName: 'Function', line: i });
            }
        }
        return results;
    }

    if (languageId === 'css' || languageId === 'scss' || languageId === 'less') {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('//') || trimmed.startsWith('*')) {
                continue;
            }
            const atRuleMatch = line.match(/^(@(?:media|keyframes|layer|supports)[^{;]+)\{/);
            if (atRuleMatch) {
                results.push({ name: atRuleMatch[1].trim(), kindName: 'Module', line: i });
                continue;
            }
            if (/^:root\s*\{/.test(line)) {
                results.push({ name: 'Root Variables', kindName: 'Module', line: i });
            }
        }
        return results;
    }

    if (languageId === 'html') {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('<!--')) {
                continue;
            }
            const tagMatch = line.match(/^\s*<(header|nav|main|section|article|aside|footer)\b([^>]*)>/i);
            if (tagMatch) {
                const tagName = tagMatch[1].toLowerCase();
                const idMatch = tagMatch[2].match(/\bid=["']([^"']+)["']/i);
                const label = idMatch ? `${tagName}#${idMatch[1]}` : tagName;
                results.push({ name: label, kindName: 'Module', line: i });
            }
        }
        return results;
    }

    // JS / TS / JSX / TSX / Java / Vue / Svelte 等の C 系構文
    const controlKeywords = new Set([
        'if',
        'else',
        'for',
        'while',
        'switch',
        'catch',
        'return',
        'throw',
        'new',
        'super',
    ]);
    let currentContainer: { symbol: OutlineSymbolInput; indent: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (
            !trimmed ||
            trimmed.startsWith('//') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('<!--') ||
            trimmed.startsWith('{/*')
        ) {
            continue;
        }

        const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (currentContainer && indent <= currentContainer.indent && trimmed.startsWith('}')) {
            currentContainer = null;
            continue;
        }

        const typeDeclMatch = line.match(
            /^(\s{0,4})(?:export\s+)?(?:default\s+)?(?:(?:public|protected|private|abstract|final|static)\s+)*(class|interface|enum|namespace|module)\s+([A-Za-z_$][\w$]*)\b/
        );
        if (typeDeclMatch) {
            const rawKind = typeDeclMatch[2].toLowerCase();
            const kindName = rawKind.charAt(0).toUpperCase() + rawKind.slice(1);
            const sym: OutlineSymbolInput = {
                name: typeDeclMatch[3],
                kindName,
                line: i,
                children: [],
            };
            results.push(sym);
            if (rawKind === 'class') {
                currentContainer = { symbol: sym, indent };
            } else {
                currentContainer = null;
            }
            continue;
        }

        const fnMatch = line.match(
            /^(\s{0,4})(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*[<(]/
        );
        if (fnMatch) {
            currentContainer = null;
            results.push({
                name: fnMatch[2],
                kindName: 'Function',
                line: i,
            });
            continue;
        }

        const arrowFnMatch = line.match(
            /^(\s{0,4})(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/
        );
        if (arrowFnMatch) {
            currentContainer = null;
            results.push({
                name: arrowFnMatch[2],
                kindName: 'Function',
                line: i,
            });
            continue;
        }

        if (currentContainer && indent > currentContainer.indent) {
            const methodMatch = line.match(
                /^\s+(?:(?:public|private|protected|static|async|readonly|override|abstract|final|synchronized)\s+)*(?:[A-Za-z_$][\w$<>[\],?\s]*\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\{\s*$/
            );
            if (methodMatch && !controlKeywords.has(methodMatch[1])) {
                const methodName = methodMatch[1];
                currentContainer.symbol.children = currentContainer.symbol.children ?? [];
                currentContainer.symbol.children.push({
                    name: methodName,
                    kindName: methodName === 'constructor' ? 'Constructor' : 'Method',
                    line: i,
                });
            }
        }
    }

    return results;
}

/**
 * 提案された見出しコメントを元のテキストへ挿入し、改行コードとインデントを保持した新しいテキストを返す。
 */
export function applySuggestionsToContent(
    content: string,
    suggestions: readonly SectionSuggestion[],
    languageId: string,
    headingMarkers: Record<string, string[]> = {}
): string {
    if (suggestions.length === 0) {
        return content;
    }

    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);

    const sorted = [...suggestions].sort((a, b) => a.line - b.line);
    const byLine = new Map<number, SectionSuggestion>();
    for (const suggestion of sorted) {
        const lineIndex = Math.floor(suggestion.line);
        if (lineIndex >= 0 && lineIndex < lines.length && !byLine.has(lineIndex)) {
            byLine.set(lineIndex, suggestion);
        }
    }

    if (byLine.size === 0) {
        return content;
    }

    let insertedAny = false;
    const outputLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const suggestion = byLine.get(i);
        if (suggestion) {
            const targetLine = lines[i];
            const leadingIndent =
                targetLine.trim().length > 0 ? (targetLine.match(/^(\s*)/)?.[1] ?? '') : '';
            const formatted = formatHeadingComment(
                languageId,
                suggestion.level,
                suggestion.label,
                headingMarkers,
                leadingIndent
            );
            if (formatted !== null) {
                outputLines.push(formatted);
                insertedAny = true;
            }
        }
        outputLines.push(lines[i]);
    }

    return insertedAny ? outputLines.join(eol) : content;
}
