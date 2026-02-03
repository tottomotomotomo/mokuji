import * as vscode from 'vscode';

export class MokujiTreeDataProvider implements vscode.TreeDataProvider<MokujiItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MokujiItem | undefined | null | void> = new vscode.EventEmitter<MokujiItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MokujiItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Built-in supported language IDs
    private static readonly BUILTIN_LANGUAGES = [
        'css', 'scss', 'less', 'html', 'markdown',
        'javascript', 'typescript', 'javascriptreact', 'typescriptreact'
    ];

    constructor() {
        vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
        vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('mokuji.customPatterns')) {
                this.refresh();
            }
        });
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
            if (editor) {
                const langId = editor.document.languageId;
                const customPatterns = vscode.workspace.getConfiguration('mokuji').get<Record<string, { pattern: string; enabled?: boolean }>>('customPatterns', {});
                if (MokujiTreeDataProvider.BUILTIN_LANGUAGES.includes(langId) || this.hasCustomPattern(langId, customPatterns)) {
                    return Promise.resolve(this.parseDocument(editor.document, customPatterns));
                }
            }
            return Promise.resolve([]);
        }
    }

    private hasCustomPattern(langId: string, customPatterns: Record<string, { pattern: string; enabled?: boolean }>): boolean {
        const config = customPatterns[langId];
        return config !== undefined && config.enabled !== false;
    }

    private parseDocument(document: vscode.TextDocument, customPatterns: Record<string, { pattern: string; enabled?: boolean }> = {}): MokujiItem[] {
        const items: MokujiItem[] = [];
        const stack: { level: number, item: MokujiItem }[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;

            // Support multiple comment formats based on language
            // Pattern 1: // # text (SCSS/LESS/JS/TS style)
            // Pattern 2: /* # text */ (Standard CSS style)
            // Pattern 3: <!-- # text --> (HTML style)
            // Pattern 4: # text (Markdown native headers)
            // Pattern 5: /** # text */ (JSDoc style for JS/TS)
            const slashMatch = text.match(/^\s*\/\/ (#+) (.*)$/);
            const blockMatch = text.match(/^\s*\/\* (#+) (.*?) \*\/\s*$/);
            const htmlMatch = text.match(/^\s*<!--\s*(#+)\s*(.*?)\s*-->/);
            // Markdown: ATX-style headers, trailing hashes are optional and removed
            const mdMatch = text.match(/^\s*(#{1,6})\s+(.+?)(?:\s+#+)?$/);
            // JSDoc: /** # text */ (single-line JSDoc comment)
            const jsdocMatch = text.match(/^\s*\/\*\*\s*(#+)\s*(.*?)\s*\*\/\s*$/);

            // Custom pattern from settings.json
            // Group 1: hash symbols for level, Group 2: label text
            const langId = document.languageId;
            const customConfig = customPatterns[langId];
            let customMatch: RegExpMatchArray | null = null;
            if (customConfig && customConfig.enabled !== false) {
                try {
                    customMatch = text.match(new RegExp(customConfig.pattern));
                } catch {
                    // Invalid regex pattern is silently ignored
                }
            }

            const match = slashMatch || blockMatch || htmlMatch || mdMatch || jsdocMatch || customMatch;

            if (match) {
                const level = match[1].length;
                const label = match[2].trim();
                const item = new MokujiItem(label, vscode.TreeItemCollapsibleState.None, i);

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
        public readonly line: number
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}`;
        this.description = `Line ${this.line + 1}`;

        this.command = {
            command: 'vscode.open',
            title: 'Open Line',
            arguments: [
                vscode.window.activeTextEditor?.document.uri,
                {
                    selection: new vscode.Range(this.line, 0, this.line, 0),
                    preview: true
                }
            ]
        };
    }
}
