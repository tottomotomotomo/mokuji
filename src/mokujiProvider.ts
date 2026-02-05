import * as vscode from 'vscode';

export class MokujiTreeDataProvider implements vscode.TreeDataProvider<MokujiItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MokujiItem | undefined | null | void> = new vscode.EventEmitter<MokujiItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MokujiItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
        vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('mokuji')) {
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
                const config = vscode.workspace.getConfiguration('mokuji');
                const headingMarkers = config.get<Record<string, string[]>>('headingMarkers', {});
                return Promise.resolve(this.parseDocument(editor.document, headingMarkers));
            }
            return Promise.resolve([]);
        }
    }

    private parseDocument(
        document: vscode.TextDocument,
        headingMarkers: Record<string, string[]> = {}
    ): MokujiItem[] {
        const items: MokujiItem[] = [];
        const stack: { level: number, item: MokujiItem }[] = [];
        const langId = document.languageId;

        // Get heading markers for this language (e.g., ["@", "$", "&"])
        const markers = headingMarkers[langId] || [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;

            let level: number | null = null;
            let label: string | null = null;

            // Priority 1: Heading markers (if configured for this language)
            if (markers.length > 0) {
                const markerResult = this.matchHeadingMarker(text, markers);
                if (markerResult) {
                    level = markerResult.level;
                    label = markerResult.label;
                }
            }

            // Priority 2: Default patterns (only if headingMarkers is NOT configured)
            if (level === null && markers.length === 0) {
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

                const match = slashMatch || blockMatch || htmlMatch || mdMatch || jsdocMatch;
                if (match) {
                    level = match[1].length;
                    label = match[2].trim();
                }
            }

            if (level !== null && label !== null) {
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

    /**
     * Match heading markers in a line of text.
     * Supports common comment formats: #, //, block comments, HTML comments
     * @param text The line text to match
     * @param markers Array of markers for each level (index 0 = level 1)
     * @returns level and label if matched, null otherwise
     */
    private matchHeadingMarker(text: string, markers: string[]): { level: number; label: string } | null {
        for (let i = 0; i < markers.length; i++) {
            const marker = markers[i];
            const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Pattern for different comment styles:
            // - # marker text (Python, Ruby, Shell, YAML)
            // - // marker text (JS, TS, C++, etc.)
            // - /* marker text */ (CSS, C, etc.)
            // - /** marker text */ (JSDoc)
            // - <!-- marker text --> (HTML, XML)
            const patterns = [
                new RegExp(`^\\s*#\\s*${escapedMarker}\\s+(.+)$`),
                new RegExp(`^\\s*\\/\\/\\s*${escapedMarker}\\s+(.+)$`),
                new RegExp(`^\\s*\\/\\*\\s*${escapedMarker}\\s+(.+?)\\s*\\*\\/\\s*$`),
                new RegExp(`^\\s*\\/\\*\\*\\s*${escapedMarker}\\s+(.+?)\\s*\\*\\/\\s*$`),
                new RegExp(`^\\s*<!--\\s*${escapedMarker}\\s+(.+?)\\s*-->`)
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    return {
                        level: i + 1,
                        label: match[1].trim()
                    };
                }
            }
        }
        return null;
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
