import * as vscode from 'vscode';

export class MokujiTreeDataProvider implements vscode.TreeDataProvider<MokujiItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MokujiItem | undefined | null | void> = new vscode.EventEmitter<MokujiItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MokujiItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Preserve the last document to maintain TOC when activeTextEditor becomes undefined
    private lastDocument: vscode.TextDocument | undefined;

    constructor() {
        vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
        vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
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
        } else {
            const editor = vscode.window.activeTextEditor;

            // Use active editor's document if available, otherwise use last document
            const document = editor?.document ?? this.lastDocument;

            if (document) {
                // Update lastDocument only when we have a valid text editor
                if (editor) {
                    this.lastDocument = document;
                }

                const langId = document.languageId;
                if (langId === 'css' || langId === 'scss' || langId === 'less' || langId === 'html' || langId === 'markdown') {
                    const items = this.parseDocument(document, document.uri);

                    // Add file name header as the first item
                    const fileName = document.uri.path.split('/').pop() || '';
                    const fileHeader = new MokujiFileHeader(fileName, document.uri);

                    return Promise.resolve([fileHeader, ...items]);
                }
            }
            return Promise.resolve([]);
        }
    }

    private parseDocument(document: vscode.TextDocument, documentUri: vscode.Uri): MokujiItem[] {
        const items: MokujiItem[] = [];
        const stack: { level: number, item: MokujiItem }[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;

            // Support multiple comment formats based on language
            // Pattern 1: // # text (SCSS/LESS style)
            // Pattern 2: /* # text */ (Standard CSS style)
            // Pattern 3: <!-- # text --> (HTML style)
            // Pattern 4: # text (Markdown native headers)
            const slashMatch = text.match(/^\s*\/\/ (#+) (.*)$/);
            const blockMatch = text.match(/^\s*\/\* (#+) (.*?) \*\/\s*$/);
            const htmlMatch = text.match(/^\s*<!--\s*(#+)\s*(.*?)\s*-->/);
            // Markdown: ATX-style headers, trailing hashes are optional and removed
            const mdMatch = text.match(/^\s*(#{1,6})\s+(.+?)(?:\s+#+)?$/);
            const match = slashMatch || blockMatch || htmlMatch || mdMatch;

            if (match) {
                const level = match[1].length;
                const label = match[2].trim();
                const item = new MokujiItem(label, vscode.TreeItemCollapsibleState.None, i, documentUri);

                // Find parent
                while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                    stack.pop();
                }

                if (stack.length > 0) {
                    const parent = stack[stack.length - 1].item;
                    parent.children.push(item);
                    parent.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                } else {
                    items.push(item);
                }

                stack.push({ level, item });
            }
        }

        return items;
    }
}

class MokujiItem extends vscode.TreeItem {
    public children: MokujiItem[] = [];

    constructor(
        public readonly label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly line: number,
        public readonly documentUri: vscode.Uri
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}`;
        this.description = `Line ${this.line + 1}`;

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
