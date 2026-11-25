import * as vscode from 'vscode';
import { flattenToc, parseText } from '../core/parser';
import { formatHeadingComment } from '../core/patterns';
import {
    applySuggestionsToContent,
    buildOutlineFallbackSuggestions,
    buildSuggestSectionsPrompt,
    extractRegexOutlineSymbols,
    parseSuggestSectionsResponse,
} from '../core/promptCodec';
import { OutlineSymbolInput, SectionSuggestion, WorkspaceConfig } from '../core/types';
import { selectAvailableModel } from './lmClient';

export const PREVIEW_SCHEME = 'mokuji-preview';

export interface SuggestSectionsOptions {
    autoApply?: boolean;
    silent?: boolean;
}

export interface SuggestSectionsResult {
    source: 'ai' | 'fallback' | 'none';
    count: number;
}

interface PendingSuggestionState {
    targetUri: vscode.Uri;
    previewUri: vscode.Uri;
    proposedContent: string;
    source: 'ai' | 'fallback';
    count: number;
}

class MokujiPreviewContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange: vscode.Event<vscode.Uri> = this._onDidChange.event;

    private readonly contents = new Map<string, string>();

    setContent(uri: vscode.Uri, content: string): void {
        this.contents.set(uri.toString(), content);
        this._onDidChange.fire(uri);
    }

    deleteContent(uri: vscode.Uri): void {
        this.contents.delete(uri.toString());
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) ?? '';
    }

    dispose(): void {
        this.contents.clear();
        this._onDidChange.dispose();
    }
}

function isDocumentSymbol(
    sym: vscode.DocumentSymbol | vscode.SymbolInformation
): sym is vscode.DocumentSymbol {
    return 'selectionRange' in sym && 'range' in sym;
}

function convertSymbolsToOutlineInputs(
    symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[]
): OutlineSymbolInput[] {
    return symbols.map((sym) => {
        const kindName = vscode.SymbolKind[sym.kind] ?? 'Unknown';
        if (isDocumentSymbol(sym)) {
            return {
                name: sym.name,
                kindName,
                line: sym.range.start.line,
                children:
                    sym.children && sym.children.length > 0
                        ? convertSymbolsToOutlineInputs(sym.children)
                        : undefined,
            };
        }
        return {
            name: sym.name,
            kindName,
            line: sym.location.range.start.line,
        };
    });
}

async function applyFullDocumentText(
    document: vscode.TextDocument,
    newContent: string
): Promise<boolean> {
    const fullRange = document.validateRange(
        new vscode.Range(0, 0, document.lineCount + 1, 0)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, newContent);
    return vscode.workspace.applyEdit(edit);
}

export class SuggestSectionsController implements vscode.Disposable {
    private readonly previewProvider = new MokujiPreviewContentProvider();
    private readonly disposables: vscode.Disposable[] = [];
    private pendingSuggestion: PendingSuggestionState | null = null;

    constructor(
        private readonly getWorkspaceConfig: (uri: vscode.Uri) => WorkspaceConfig | null = () =>
            null
    ) {
        void vscode.commands.executeCommand('setContext', 'mokuji.hasPendingSuggestion', false);

        this.disposables.push(
            this.previewProvider,
            vscode.workspace.registerTextDocumentContentProvider(
                PREVIEW_SCHEME,
                this.previewProvider
            ),
            vscode.commands.registerCommand(
                'mokuji.suggestSections',
                (options?: SuggestSectionsOptions) => this.suggestSections(options)
            ),
            vscode.commands.registerCommand('mokuji.applySuggestedSections', () =>
                this.applySuggestedSections()
            )
        );
    }

    async suggestSections(options?: SuggestSectionsOptions): Promise<SuggestSectionsResult> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme === PREVIEW_SCHEME) {
            if (!options?.silent) {
                void vscode.window.showInformationMessage(
                    'Mokuji: Open a supported source file to suggest section headings.'
                );
            }
            return { source: 'none', count: 0 };
        }

        const document = editor.document;
        const config = vscode.workspace.getConfiguration('mokuji', document.uri);
        const headingMarkers = config.get<Record<string, string[]>>('headingMarkers', {});
        const workspaceConfig = this.getWorkspaceConfig(document.uri);

        if (formatHeadingComment(document.languageId, 1, 'Section', headingMarkers) === null) {
            if (!options?.silent) {
                void vscode.window.showInformationMessage(
                    `Mokuji: Language "${document.languageId}" is not supported for automatic section heading suggestions.`
                );
            }
            return { source: 'none', count: 0 };
        }

        const originalContent = document.getText();
        const totalLines = document.lineCount;
        const existingToc = parseText(originalContent, {
            languageId: document.languageId,
            headingMarkers,
            workspaceConfig,
        });
        const existingHeadingLines = new Set<number>(
            flattenToc(existingToc).map((node) => node.line)
        );

        const { suggestions, source } = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Mokuji: Suggesting section headings...',
                cancellable: true,
            },
            async (_progress, token) => {
                // 1. AI パス (vscode.lm) を試行
                try {
                    const model = await selectAvailableModel(token);
                    if (model && !token.isCancellationRequested) {
                        const maxLines = model.maxInputTokens
                            ? Math.max(300, Math.min(1500, Math.floor(model.maxInputTokens / 10)))
                            : 1500;
                        const prompt = buildSuggestSectionsPrompt({
                            content: originalContent,
                            languageId: document.languageId,
                            headingMarkers,
                            existingHeadings: existingToc,
                            maxLines,
                        });
                        const rawResponse = await model.sendRequest(
                            prompt,
                            'Suggest logical Mokuji section heading comments for the active file.',
                            token
                        );
                        const aiSuggestions = parseSuggestSectionsResponse(
                            rawResponse,
                            totalLines,
                            existingHeadingLines
                        );
                        if (aiSuggestions.length > 0) {
                            return {
                                suggestions: aiSuggestions,
                                source: 'ai' as const,
                            };
                        }
                    }
                } catch (err) {
                    // LanguageModelError やストリーム中断時はエラー表示で止めず安全にフォールバックへ移行
                    if (err instanceof vscode.LanguageModelError) {
                        console.warn(
                            `[Mokuji] LanguageModelError (${err.code}): ${err.message}. Falling back to outline rules.`
                        );
                    } else {
                        console.warn(
                            '[Mokuji] Language model request failed. Falling back to outline rules.',
                            err
                        );
                    }
                }

                if (token.isCancellationRequested) {
                    return {
                        suggestions: [] as SectionSuggestion[],
                        source: 'none' as const,
                    };
                }

                // 2. ルールベースフォールバック (DocumentSymbol -> 軽量正規表現シンボル抽出)
                let outlineInputs: OutlineSymbolInput[] = [];
                try {
                    const symbols = await vscode.commands.executeCommand<
                        (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined
                    >('vscode.executeDocumentSymbolProvider', document.uri);
                    if (Array.isArray(symbols) && symbols.length > 0) {
                        outlineInputs = convertSymbolsToOutlineInputs(symbols);
                    }
                } catch {
                    // シンボルプロバイダー未対応時は正規表現抽出へフォールバック
                }

                let fallbackSuggestions = buildOutlineFallbackSuggestions(
                    outlineInputs,
                    existingHeadingLines
                );
                if (fallbackSuggestions.length === 0) {
                    const regexSymbols = extractRegexOutlineSymbols(
                        originalContent,
                        document.languageId
                    );
                    fallbackSuggestions = buildOutlineFallbackSuggestions(
                        regexSymbols,
                        existingHeadingLines
                    );
                }

                if (fallbackSuggestions.length > 0) {
                    return {
                        suggestions: fallbackSuggestions,
                        source: 'fallback' as const,
                    };
                }

                return {
                    suggestions: [] as SectionSuggestion[],
                    source: 'none' as const,
                };
            }
        );

        if (suggestions.length === 0 || source === 'none') {
            if (!options?.silent) {
                void vscode.window.showInformationMessage(
                    'Mokuji: No new section headings to suggest for this file.'
                );
            }
            return { source: 'none', count: 0 };
        }

        const proposedContent = applySuggestionsToContent(
            originalContent,
            suggestions,
            document.languageId,
            headingMarkers
        );
        if (proposedContent === originalContent) {
            if (!options?.silent) {
                void vscode.window.showInformationMessage(
                    'Mokuji: No new section headings to suggest for this file.'
                );
            }
            return { source: 'none', count: 0 };
        }

        if (options?.autoApply === true) {
            await applyFullDocumentText(document, proposedContent);
            return { source, count: suggestions.length };
        }

        const previewUri = vscode.Uri.from({
            scheme: PREVIEW_SCHEME,
            path: document.uri.path,
        });
        this.previewProvider.setContent(previewUri, proposedContent);
        this.pendingSuggestion = {
            targetUri: document.uri,
            previewUri,
            proposedContent,
            source,
            count: suggestions.length,
        };

        await vscode.commands.executeCommand('setContext', 'mokuji.hasPendingSuggestion', true);

        const fileName = document.uri.path.split('/').pop() || 'Document';
        const modeLabel = source === 'ai' ? 'AI' : 'Outline Fallback';
        await vscode.commands.executeCommand(
            'vscode.diff',
            document.uri,
            previewUri,
            `Mokuji Section Suggestions (${modeLabel}): ${fileName}`
        );

        if (!options?.silent) {
            void vscode.window
                .showInformationMessage(
                    `Mokuji suggested ${suggestions.length} section heading(s) via ${modeLabel}.`,
                    'Apply Headings',
                    'Discard'
                )
                .then(async (choice) => {
                    if (choice === 'Apply Headings') {
                        await vscode.commands.executeCommand('mokuji.applySuggestedSections');
                    } else if (choice === 'Discard') {
                        await this.clearPendingSuggestion(true);
                    }
                });
        }

        return { source, count: suggestions.length };
    }

    async applySuggestedSections(): Promise<boolean> {
        const pending = this.pendingSuggestion;
        if (!pending) {
            return false;
        }

        try {
            const targetDoc = await vscode.workspace.openTextDocument(pending.targetUri);
            const applied = await applyFullDocumentText(targetDoc, pending.proposedContent);
            await this.clearPendingSuggestion(true);
            if (applied) {
                try {
                    await vscode.window.showTextDocument(targetDoc, { preview: false });
                } catch {
                    // テスト環境等でエディタ表示に失敗しても編集自体は成功扱いとする
                }
            }
            return applied;
        } catch {
            await this.clearPendingSuggestion(true);
            return false;
        }
    }

    private async clearPendingSuggestion(closePreviewTab: boolean): Promise<void> {
        const pending = this.pendingSuggestion;
        this.pendingSuggestion = null;
        await vscode.commands.executeCommand('setContext', 'mokuji.hasPendingSuggestion', false);

        if (!pending) {
            return;
        }

        const previewUriStr = pending.previewUri.toString();
        if (closePreviewTab && vscode.window.tabGroups) {
            for (const group of vscode.window.tabGroups.all) {
                for (const tab of group.tabs) {
                    const input = tab.input;
                    const isMatchingDiff =
                        input instanceof vscode.TabInputTextDiff &&
                        input.modified.toString() === previewUriStr;
                    const isMatchingText =
                        input instanceof vscode.TabInputText &&
                        input.uri.toString() === previewUriStr;
                    if (isMatchingDiff || isMatchingText) {
                        try {
                            await vscode.window.tabGroups.close(tab);
                        } catch {
                            // タブクローズ失敗は無視
                        }
                    }
                }
            }
        }

        this.previewProvider.deleteContent(pending.previewUri);
    }

    dispose(): void {
        this.pendingSuggestion = null;
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }
}

export function registerSuggestSections(
    getWorkspaceConfig: (uri: vscode.Uri) => WorkspaceConfig | null = () => null
): SuggestSectionsController {
    return new SuggestSectionsController(getWorkspaceConfig);
}
