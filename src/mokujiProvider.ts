import * as vscode from 'vscode';
import { parseText } from './core/parser';
import { TocNode, WorkspaceConfig } from './core/types';

export class MokujiTreeDataProvider implements vscode.TreeDataProvider<MokujiItem>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<MokujiItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MokujiItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Preserve the last document to maintain TOC when activeTextEditor becomes undefined
    private lastDocument: vscode.TextDocument | undefined;

    // .vscode/mokuji.json のキャッシュ
    private workspaceConfig: WorkspaceConfig | null = null;

    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            this._onDidChangeTreeData,
            vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
            vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e)),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('mokuji')) {
                    this.refresh();
                }
            })
        );

        // ワークスペース設定を初回読み込み
        this.loadWorkspaceConfig();

        // .vscode/mokuji.json の変更を監視
        const watcher = vscode.workspace.createFileSystemWatcher('**/.vscode/mokuji.json');
        this.disposables.push(
            watcher,
            watcher.onDidChange(() => { this.loadWorkspaceConfig().then(() => this.refresh()); }),
            watcher.onDidCreate(() => { this.loadWorkspaceConfig().then(() => this.refresh()); }),
            watcher.onDidDelete(() => { this.workspaceConfig = null; this.refresh(); })
        );
    }

    dispose(): void {
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private async loadWorkspaceConfig(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            this.workspaceConfig = null;
            return;
        }

        const configUri = vscode.Uri.joinPath(folders[0].uri, '.vscode', 'mokuji.json');
        try {
            const data = await vscode.workspace.fs.readFile(configUri);
            this.workspaceConfig = JSON.parse(Buffer.from(data).toString('utf8'));
        } catch {
            this.workspaceConfig = null;
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private onDocumentChanged(changeEvent: vscode.TextDocumentChangeEvent): void {
        if (vscode.window.activeTextEditor && changeEvent.document.uri.toString() === vscode.window.activeTextEditor.document.uri.toString()) {
            this.refresh();
        }
    }

    getTreeItem(element: MokujiItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MokujiItem): Thenable<MokujiItem[]> {
        if (element) {
            return Promise.resolve(element.children);
        }

        const editor = vscode.window.activeTextEditor;

        // Use active editor's document if available, otherwise use last document
        const document = editor?.document ?? this.lastDocument;

        if (document) {
            // Update lastDocument only when we have a valid text editor
            if (editor) {
                this.lastDocument = document;
            }

            const config = vscode.workspace.getConfiguration('mokuji');
            const headingMarkers = config.get<Record<string, string[]>>('headingMarkers', {});
            const showLineNumber = config.get<boolean>('showLineNumber', true);

            const nodes = parseText(document.getText(), {
                languageId: document.languageId,
                headingMarkers,
                workspaceConfig: this.workspaceConfig,
            });
            const items = this.toTreeItems(nodes, document.uri, showLineNumber);

            // Add file name header as the first item
            const fileName = document.uri.path.split('/').pop() || '';
            const fileHeader = new MokujiFileHeader(fileName, document.uri);

            return Promise.resolve([fileHeader, ...items]);
        }
        return Promise.resolve([]);
    }

    private toTreeItems(nodes: readonly TocNode[], documentUri: vscode.Uri, showLineNumber: boolean): MokujiItem[] {
        return nodes.map(node => {
            const children = this.toTreeItems(node.children, documentUri, showLineNumber);
            const collapsibleState = children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None;
            const item = new MokujiItem(node.label, collapsibleState, node.line, documentUri, showLineNumber);
            item.children = children;
            return item;
        });
    }
}

export class MokujiItem extends vscode.TreeItem {
    public children: MokujiItem[] = [];

    constructor(
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly line: number,
        public readonly documentUri: vscode.Uri,
        showLineNumber: boolean = true
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}`;
        this.description = showLineNumber ? `Line ${this.line + 1}` : '';

        this.command = {
            command: 'vscode.open',
            title: 'Open Line',
            arguments: [
                documentUri,
                {
                    selection: new vscode.Range(this.line, 0, this.line, 0),
                    preview: true
                }
            ]
        };
    }
}

class MokujiFileHeader extends MokujiItem {
    constructor(fileName: string, documentUri: vscode.Uri) {
        super(fileName, vscode.TreeItemCollapsibleState.None, 0, documentUri);
        this.iconPath = new vscode.ThemeIcon('file');
        this.description = '';
        this.tooltip = documentUri.fsPath;
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [documentUri]
        };
    }
}
