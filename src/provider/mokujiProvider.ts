import * as vscode from 'vscode';
import { parseText } from '../core/parser';
import { ParseOptions, TocNode, WorkspaceConfig } from '../core/types';

const DOCUMENT_CHANGE_DEBOUNCE_MS = 150;

export class MokujiTreeDataProvider implements vscode.TreeDataProvider<MokujiItem>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<MokujiItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MokujiItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Preserve the last document to maintain TOC when activeTextEditor becomes undefined
    private lastDocument: vscode.TextDocument | undefined;

    // マルチルート対応: WorkspaceFolder.uri.toString() -> WorkspaceConfig
    private readonly workspaceConfigs = new Map<string, WorkspaceConfig>();

    // getChildren() で構築された最新のルートアイテムキャッシュ（reveal / findItemAtLine 用）
    private cachedRootItems: MokujiItem[] = [];
    private cachedDocUri: string | undefined;
    private cachedDocVersion: number | undefined;
    private cacheValid = false;

    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        if (vscode.window.activeTextEditor) {
            this.lastDocument = vscode.window.activeTextEditor.document;
        }

        this.disposables.push(
            this._onDidChangeTreeData,
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) {
                    this.lastDocument = editor.document;
                }
                this.refresh();
            }),
            vscode.workspace.onDidChangeTextDocument((e) => this.onDocumentChanged(e)),
            vscode.workspace.onDidCloseTextDocument((doc) => {
                if (this.lastDocument && this.lastDocument.uri.toString() === doc.uri.toString()) {
                    this.lastDocument = undefined;
                    this.refresh();
                }
            }),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('mokuji')) {
                    this.refresh();
                }
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                void this.loadAllWorkspaceConfigs().then(() => {
                    if (!this.disposed) {
                        this.refresh();
                    }
                });
            })
        );

        // 初回ワークスペース設定読み込み
        void this.loadAllWorkspaceConfigs().then(() => {
            if (!this.disposed && this.workspaceConfigs.size > 0) {
                this.refresh();
            }
        });

        // .vscode/mokuji.json の変更を監視
        const watcher = vscode.workspace.createFileSystemWatcher('**/.vscode/mokuji.json');
        const reloadAndRefresh = () => {
            void this.loadAllWorkspaceConfigs().then(() => {
                if (!this.disposed) {
                    this.refresh();
                }
            });
        };
        this.disposables.push(
            watcher,
            watcher.onDidChange(reloadAndRefresh),
            watcher.onDidCreate(reloadAndRefresh),
            watcher.onDidDelete(reloadAndRefresh)
        );
    }

    public dispose(): void {
        this.disposed = true;
        if (this.refreshTimer !== undefined) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private async loadAllWorkspaceConfigs(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        const nextMap = new Map<string, WorkspaceConfig>();

        if (folders && folders.length > 0) {
            await Promise.all(
                folders.map(async (folder) => {
                    const configUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'mokuji.json');
                    try {
                        const data = await vscode.workspace.fs.readFile(configUri);
                        const parsed = JSON.parse(Buffer.from(data).toString('utf8')) as WorkspaceConfig;
                        if (parsed && typeof parsed === 'object') {
                            nextMap.set(folder.uri.toString(), parsed);
                        }
                    } catch {
                        // 設定ファイルが存在しない・JSON不正な場合は無視
                    }
                })
            );
        }

        this.workspaceConfigs.clear();
        for (const [key, value] of nextMap.entries()) {
            this.workspaceConfigs.set(key, value);
        }
    }

    public getWorkspaceConfigForUri(uri: vscode.Uri): WorkspaceConfig | null {
        const folder = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            return null;
        }
        return this.workspaceConfigs.get(folder.uri.toString()) ?? null;
    }

    public getParseOptions(document: vscode.TextDocument): ParseOptions {
        const config = vscode.workspace.getConfiguration('mokuji', document.uri);
        const headingMarkers = config.get<Record<string, string[]>>('headingMarkers', {});
        return {
            languageId: document.languageId,
            headingMarkers,
            workspaceConfig: this.getWorkspaceConfigForUri(document.uri),
        };
    }

    public getCurrentDocument(): vscode.TextDocument | undefined {
        return vscode.window.activeTextEditor?.document ?? this.lastDocument;
    }

    public getParsedNodes(document?: vscode.TextDocument): TocNode[] {
        const doc = document ?? this.getCurrentDocument();
        if (!doc) {
            return [];
        }
        return parseText(doc.getText(), this.getParseOptions(doc));
    }

    public findItemAtLine(line: number): MokujiItem | undefined {
        let matched: MokujiItem | undefined;

        const visit = (items: readonly MokujiItem[]): void => {
            for (const item of items) {
                if (item instanceof MokujiFileHeader) {
                    continue;
                }
                if (item.line <= line) {
                    matched = item;
                }
                if (item.children.length > 0) {
                    visit(item.children);
                }
            }
        };

        visit(this.cachedRootItems);
        return matched;
    }

    public refresh(): void {
        if (this.refreshTimer !== undefined) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        this.cacheValid = false;
        this._onDidChangeTreeData.fire();
    }

    private onDocumentChanged(changeEvent: vscode.TextDocumentChangeEvent): void {
        const currentDoc = this.getCurrentDocument();
        if (currentDoc && changeEvent.document.uri.toString() === currentDoc.uri.toString()) {
            this.cacheValid = false;
            if (this.refreshTimer !== undefined) {
                clearTimeout(this.refreshTimer);
            }
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = undefined;
                if (!this.disposed) {
                    this.refresh();
                }
            }, DOCUMENT_CHANGE_DEBOUNCE_MS);
        }
    }

    public getTreeItem(element: MokujiItem): vscode.TreeItem {
        return element;
    }

    public getParent(element: MokujiItem): vscode.ProviderResult<MokujiItem> {
        return element.parent;
    }

    public getChildren(element?: MokujiItem): Thenable<MokujiItem[]> {
        if (element) {
            return Promise.resolve(element.children);
        }

        const editor = vscode.window.activeTextEditor;
        const document = editor?.document ?? this.lastDocument;

        if (!document) {
            this.cachedRootItems = [];
            this.cachedDocUri = undefined;
            this.cachedDocVersion = undefined;
            this.cacheValid = false;
            return Promise.resolve([]);
        }

        if (editor) {
            this.lastDocument = document;
        }

        const docUriStr = document.uri.toString();
        if (
            this.cacheValid &&
            this.cachedDocUri === docUriStr &&
            this.cachedDocVersion === document.version
        ) {
            return Promise.resolve(this.cachedRootItems);
        }

        const config = vscode.workspace.getConfiguration('mokuji', document.uri);
        const showLineNumber = config.get<boolean>('showLineNumber', true);

        const nodes = this.getParsedNodes(document);
        const items = this.toTreeItems(nodes, document.uri, showLineNumber, undefined);

        const fileName = document.uri.path.split('/').pop() || '';
        const fileHeader = new MokujiFileHeader(fileName, document.uri);

        this.cachedRootItems = [fileHeader, ...items];
        this.cachedDocUri = docUriStr;
        this.cachedDocVersion = document.version;
        this.cacheValid = true;

        return Promise.resolve(this.cachedRootItems);
    }

    private toTreeItems(
        nodes: readonly TocNode[],
        documentUri: vscode.Uri,
        showLineNumber: boolean,
        parent: MokujiItem | undefined
    ): MokujiItem[] {
        return nodes.map((node) => {
            const collapsibleState = node.children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None;
            const item = new MokujiItem(
                node.label,
                collapsibleState,
                node.line,
                documentUri,
                showLineNumber,
                node.level,
                parent
            );
            item.children = this.toTreeItems(node.children, documentUri, showLineNumber, item);
            return item;
        });
    }
}

export class MokujiItem extends vscode.TreeItem {
    public children: MokujiItem[] = [];
    public parent?: MokujiItem;

    constructor(
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly line: number,
        public readonly documentUri: vscode.Uri,
        showLineNumber: boolean = true,
        public readonly level: number = 1,
        parent?: MokujiItem
    ) {
        super(label, collapsibleState);
        this.parent = parent;
        this.tooltip = `${this.label}`;
        this.description = showLineNumber ? `Line ${this.line + 1}` : '';

        this.command = {
            command: 'vscode.open',
            title: 'Open Line',
            arguments: [
                documentUri,
                {
                    selection: new vscode.Range(this.line, 0, this.line, 0),
                    preview: true,
                },
            ],
        };
    }
}

export class MokujiFileHeader extends MokujiItem {
    constructor(fileName: string, documentUri: vscode.Uri) {
        super(fileName, vscode.TreeItemCollapsibleState.None, 0, documentUri, false, 0);
        this.iconPath = new vscode.ThemeIcon('file');
        this.description = '';
        this.tooltip = documentUri.fsPath;
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [documentUri],
        };
    }
}
