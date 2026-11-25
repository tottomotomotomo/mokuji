import * as path from 'node:path';
import * as vscode from 'vscode';
import { flattenToc, parseText } from '../core/parser';
import { TocNode, WorkspaceConfig } from '../core/types';

export interface MokujiTocToolInput {
    filePath?: string;
}

export interface TocToolSection {
    label: string;
    level: number;
    startLine: number; // 1-indexed
    endLine: number;   // 1-indexed inclusive
    children: TocToolSection[];
}

export interface MokujiTocToolPayload {
    fileName: string;
    languageId: string;
    totalLines: number;
    sections: TocToolSection[];
    error?: string;
}

function buildToolSections(
    toc: readonly TocNode[],
    totalLines: number
): TocToolSection[] {
    const flat = flattenToc(toc);
    const rangeMap = new Map<TocNode, { startLine: number; endLine: number }>();

    for (let i = 0; i < flat.length; i++) {
        const current = flat[i];
        const startLine = current.line + 1;
        let endLine = Math.max(startLine, totalLines);

        for (let j = i + 1; j < flat.length; j++) {
            if (flat[j].level <= current.level) {
                endLine = Math.max(startLine, flat[j].line);
                break;
            }
        }

        rangeMap.set(current, { startLine, endLine });
    }

    const mapNodes = (nodes: readonly TocNode[]): TocToolSection[] =>
        nodes.map((node) => {
            const range = rangeMap.get(node) ?? {
                startLine: node.line + 1,
                endLine: Math.max(node.line + 1, totalLines),
            };
            return {
                label: node.label,
                level: node.level,
                startLine: range.startLine,
                endLine: range.endLine,
                children: mapNodes(node.children),
            };
        });

    return mapNodes(toc);
}

export class MokujiTocTool implements vscode.LanguageModelTool<MokujiTocToolInput> {
    constructor(
        private readonly getWorkspaceConfig: (uri: vscode.Uri) => WorkspaceConfig | null = () =>
            null
    ) {}

    prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<MokujiTocToolInput>,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
        const targetLabel = options.input?.filePath?.trim() || 'active editor';
        return {
            invocationMessage: `Extracting Mokuji Table of Contents from ${targetLabel}`,
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<MokujiTocToolInput>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        if (token.isCancellationRequested) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    JSON.stringify({ error: 'Cancelled', sections: [] }, null, 2)
                ),
            ]);
        }

        let document: vscode.TextDocument | undefined;
        const requestedPath = options.input?.filePath?.trim();

        if (requestedPath) {
            try {
                let targetUri: vscode.Uri;
                if (requestedPath.startsWith('file://')) {
                    targetUri = vscode.Uri.parse(requestedPath);
                } else if (path.isAbsolute(requestedPath)) {
                    targetUri = vscode.Uri.file(requestedPath);
                } else {
                    const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
                    targetUri = rootUri
                        ? vscode.Uri.joinPath(rootUri, requestedPath)
                        : vscode.Uri.file(path.resolve(requestedPath));
                }
                document = await vscode.workspace.openTextDocument(targetUri);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify(
                            {
                                fileName: requestedPath,
                                languageId: '',
                                totalLines: 0,
                                sections: [],
                                error: `Unable to open file "${requestedPath}": ${message}`,
                            } satisfies MokujiTocToolPayload,
                            null,
                            2
                        )
                    ),
                ]);
            }
        } else {
            document = vscode.window.activeTextEditor?.document;
        }

        if (!document) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    JSON.stringify(
                        {
                            fileName: '',
                            languageId: '',
                            totalLines: 0,
                            sections: [],
                            error: 'No target file specified and no active text editor is open.',
                        } satisfies MokujiTocToolPayload,
                        null,
                        2
                    )
                ),
            ]);
        }

        const headingMarkers = vscode.workspace
            .getConfiguration('mokuji', document.uri)
            .get<Record<string, string[]>>('headingMarkers', {});
        const workspaceConfig = this.getWorkspaceConfig(document.uri);
        const toc = parseText(document.getText(), {
            languageId: document.languageId,
            headingMarkers,
            workspaceConfig,
        });

        const totalLines = document.lineCount;
        const sections = buildToolSections(toc, totalLines);
        const fileName = vscode.workspace.asRelativePath(document.uri, false);

        const payload: MokujiTocToolPayload = {
            fileName,
            languageId: document.languageId,
            totalLines,
            sections,
        };

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2)),
        ]);
    }
}

export function registerTocTool(
    getWorkspaceConfig: (uri: vscode.Uri) => WorkspaceConfig | null = () => null
): vscode.Disposable {
    if (vscode.lm && typeof vscode.lm.registerTool === 'function') {
        return vscode.lm.registerTool('mokuji_getToc', new MokujiTocTool(getWorkspaceConfig));
    }
    return new vscode.Disposable(() => {});
}
