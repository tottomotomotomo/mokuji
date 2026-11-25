import * as vscode from 'vscode';
import {
    formatHeadingComment,
    LANGUAGE_PATTERNS,
    PRIMARY_COMMENT_STYLE,
    SUPPORTED_LANGUAGE_IDS,
} from '../core/patterns';
import { MokujiTreeDataProvider } from '../provider/mokujiProvider';

export interface InsertSectionArgs {
    level?: number;
    label?: string;
}

interface LevelQuickPickItem extends vscode.QuickPickItem {
    level: number;
}

const SNIPPET_PLACEHOLDER_TOKEN = '__MOKUJI_SECTION_TITLE__';
const COMMENT_OPENER_PREFIX_RE = /^(\s*)(\/\/|\/\*\*?|#|<!--|\{\/\*)\s*(#{0,6})\s*$/;
const AUTO_CLOSE_SUFFIX_RE = /^\s*(?:\*\/\}|\*\/|-->)?\s*$/;

function isValidOpenerForLanguage(languageId: string, opener: string): boolean {
    const patterns = LANGUAGE_PATTERNS[languageId] ?? [];
    const primaryStyle = PRIMARY_COMMENT_STYLE[languageId];

    switch (opener) {
        case '//':
            return patterns.includes('slash') || primaryStyle === 'slash';
        case '/*':
            return patterns.includes('block') || primaryStyle === 'block';
        case '/**':
            return patterns.includes('jsdoc') || patterns.includes('block');
        case '#':
            return patterns.includes('hashComment') || patterns.includes('md') || primaryStyle === 'hash' || primaryStyle === 'md';
        case '<!--':
            return patterns.includes('html') || primaryStyle === 'html';
        case '{/*':
            return patterns.includes('jsxBlock') || primaryStyle === 'jsxBlock';
        default:
            return false;
    }
}

function buildSnippetForOpener(
    languageId: string,
    opener: string,
    level: number,
    headingMarkers: Record<string, string[]>
): { preview: string; snippetText: string } | null {
    const customMarkers = headingMarkers[languageId];
    if (customMarkers && customMarkers.length > 0) {
        const preview = formatHeadingComment(languageId, level, 'Section Title', headingMarkers, '');
        const template = formatHeadingComment(languageId, level, SNIPPET_PLACEHOLDER_TOKEN, headingMarkers, '');
        if (!preview || !template) {
            return null;
        }
        return {
            preview,
            snippetText: template.replace(SNIPPET_PLACEHOLDER_TOKEN, '${1:Section Title}'),
        };
    }

    const hashes = '#'.repeat(level);
    switch (opener) {
        case '//':
            return {
                preview: `// ${hashes} Section Title`,
                snippetText: `// ${hashes} \${1:Section Title}`,
            };
        case '/*':
            return {
                preview: `/* ${hashes} Section Title */`,
                snippetText: `/* ${hashes} \${1:Section Title} */`,
            };
        case '/**':
            return {
                preview: `/** ${hashes} Section Title */`,
                snippetText: `/** ${hashes} \${1:Section Title} */`,
            };
        case '<!--':
            return {
                preview: `<!-- ${hashes} Section Title -->`,
                snippetText: `<!-- ${hashes} \${1:Section Title} -->`,
            };
        case '{/*':
            return {
                preview: `{/* ${hashes} Section Title */}`,
                snippetText: `{/* ${hashes} \${1:Section Title} */}`,
            };
        case '#': {
            if (languageId === 'markdown') {
                return {
                    preview: `${hashes} Section Title`,
                    snippetText: `${hashes} \${1:Section Title}`,
                };
            }
            return {
                preview: `# ${hashes} Section Title`,
                snippetText: `# ${hashes} \${1:Section Title}`,
            };
        }
        default:
            return null;
    }
}

export function registerInsertSection(provider: MokujiTreeDataProvider): vscode.Disposable {
    const insertCmd = vscode.commands.registerCommand(
        'mokuji.insertSection',
        async (args?: InsertSectionArgs) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                void vscode.window.showInformationMessage(
                    'Mokuji: Open a file in the editor to insert a section heading.'
                );
                return;
            }

            const document = editor.document;
            const parseOptions = provider.getParseOptions(document);
            const headingMarkers = parseOptions.headingMarkers ?? {};

            if (formatHeadingComment(document.languageId, 1, 'Preview', headingMarkers) === null) {
                void vscode.window.showWarningMessage(
                    `Mokuji: Unsupported language '${document.languageId}' for section heading insertion.`
                );
                return;
            }

            let level = args?.level;
            if (typeof level !== 'number' || Number.isNaN(level)) {
                const items: LevelQuickPickItem[] = [];
                for (let lvl = 1; lvl <= 6; lvl++) {
                    const preview = formatHeadingComment(
                        document.languageId,
                        lvl,
                        'Section Title',
                        headingMarkers
                    );
                    if (preview !== null) {
                        items.push({
                            label: `Level ${lvl}`,
                            description: preview,
                            level: lvl,
                        });
                    }
                }

                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select Mokuji heading level (1-6)',
                });
                if (!picked) {
                    return;
                }
                level = picked.level;
            }

            let label = args?.label;
            if (typeof label !== 'string' || label.trim().length === 0) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter section heading title',
                    placeHolder: 'Section Title',
                    validateInput: (val) =>
                        val.trim().length === 0 ? 'Section title cannot be empty' : null,
                });
                if (!input || input.trim().length === 0) {
                    return;
                }
                label = input.trim();
            }

            const cursorLine = editor.selection.active.line;
            const lineObj = document.lineAt(cursorLine);
            const indentMatch = lineObj.text.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            const formatted = formatHeadingComment(
                document.languageId,
                level,
                label,
                headingMarkers,
                indent
            );
            if (!formatted) {
                return;
            }

            const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
            await editor.edit((editBuilder) => {
                if (lineObj.isEmptyOrWhitespace) {
                    editBuilder.replace(lineObj.range, formatted);
                } else {
                    editBuilder.insert(new vscode.Position(cursorLine, 0), `${formatted}${eol}`);
                }
            });
        }
    );

    const selector: vscode.DocumentSelector = SUPPORTED_LANGUAGE_IDS.map((lang) => ({
        language: lang,
    }));

    const completionRegistration = vscode.languages.registerCompletionItemProvider(
        selector,
        {
            provideCompletionItems(
                document: vscode.TextDocument,
                position: vscode.Position
            ): vscode.CompletionItem[] | undefined {
                const fullLineText = document.lineAt(position.line).text;
                const linePrefix = fullLineText.slice(0, position.character);
                const lineSuffix = fullLineText.slice(position.character);

                const match = linePrefix.match(COMMENT_OPENER_PREFIX_RE);
                if (!match) {
                    return undefined;
                }

                const indent = match[1];
                const opener = match[2];
                if (!isValidOpenerForLanguage(document.languageId, opener)) {
                    return undefined;
                }

                const headingMarkers = provider.getParseOptions(document).headingMarkers ?? {};
                const typedPrefix = linePrefix.slice(indent.length);
                const endCol = AUTO_CLOSE_SUFFIX_RE.test(lineSuffix)
                    ? fullLineText.length
                    : position.character;
                const replaceRange = new vscode.Range(position.line, indent.length, position.line, endCol);

                const completions: vscode.CompletionItem[] = [];
                for (let level = 1; level <= 6; level++) {
                    const built = buildSnippetForOpener(
                        document.languageId,
                        opener,
                        level,
                        headingMarkers
                    );
                    if (!built) {
                        continue;
                    }

                    const item = new vscode.CompletionItem(
                        `Mokuji Section H${level}: ${built.preview}`,
                        vscode.CompletionItemKind.Snippet
                    );
                    item.detail = `Mokuji Level ${level} Section Heading`;
                    item.insertText = new vscode.SnippetString(built.snippetText);
                    item.range = replaceRange;
                    item.filterText = `${typedPrefix} ${built.preview}`;
                    item.sortText = `0${level}`;
                    completions.push(item);
                }

                return completions;
            },
        },
        '#'
    );

    return new vscode.Disposable(() => {
        insertCmd.dispose();
        completionRegistration.dispose();
    });
}
