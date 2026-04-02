import * as vscode from 'vscode';

// グループ1: ハッシュ記号(1-6個) = レベル
// グループ2: ヘッダーテキスト = ラベル
type PatternName = 'slash' | 'block' | 'html' | 'md' | 'jsdoc' | 'hashComment' | 'jsxBlock';

const PATTERNS: Record<PatternName, RegExp> = {
    // // # text (SCSS/LESS/JS/TS/Go style)
    slash:       /^\s*\/\/ (#+) (.*)$/,
    // /* # text */ (CSS/SCSS/LESS/Go style)
    block:       /^\s*\/\* (#+) (.*?) \*\/\s*$/,
    // <!-- # text --> (HTML/Vue/Svelte style)
    html:        /^\s*<!--\s*(#+)\s*(.*?)\s*-->/,
    // # text (Markdown native headers, trailing hashes are optional and removed)
    md:          /^\s*(#{1,6})\s+(.+?)(?:\s+#+)?$/,
    // /** # text */ (JSDoc style for JS/TS/Java)
    jsdoc:       /^\s*\/\*\*\s*(#+)\s*(.*?)\s*\*\/\s*$/,
    // # # text (Python: hash comment with level marker)
    // 先頭の # はコメント記号、その後の #+  がレベル指定
    hashComment: /^\s*#\s+(#{1,6})\s+(.+)$/,
    // {/* # text */} (JSX/TSX style)
    jsxBlock:    /^\s*\{\/\*\s*(#+)\s*(.*?)\s*\*\/\}\s*$/,
};

const LANGUAGE_PATTERNS: Record<string, PatternName[]> = {
    css:              ['block'],
    scss:             ['slash', 'block'],
    less:             ['slash', 'block'],
    html:             ['html'],
    markdown:         ['md'],
    javascript:       ['slash', 'block', 'jsdoc'],
    typescript:       ['slash', 'block', 'jsdoc'],
    javascriptreact:  ['slash', 'block', 'jsdoc', 'jsxBlock'],
    typescriptreact:  ['slash', 'block', 'jsdoc', 'jsxBlock'],
    python:           ['hashComment'],
    java:             ['slash', 'block', 'jsdoc'],
    go:               ['slash', 'block'],
    vue:              ['html', 'slash', 'block', 'jsdoc'],
    svelte:           ['html', 'slash', 'block', 'jsdoc'],
};

export class MokujiTreeDataProvider implements vscode.TreeDataProvider<MokujiItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MokujiItem | undefined | null | void> = new vscode.EventEmitter<MokujiItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MokujiItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Preserve the last document to maintain TOC when activeTextEditor becomes undefined
    private lastDocument: vscode.TextDocument | undefined;

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

            // Use active editor's document if available, otherwise use last document
            const document = editor?.document ?? this.lastDocument;

            if (document) {
                // Update lastDocument only when we have a valid text editor
                if (editor) {
                    this.lastDocument = document;
                }

                const config = vscode.workspace.getConfiguration('mokuji');
                const headingMarkers = config.get<Record<string, string[]>>('headingMarkers', {});
                const items = this.parseDocument(document, headingMarkers);

                // Add file name header as the first item
                const fileName = document.uri.path.split('/').pop() || '';
                const fileHeader = new MokujiFileHeader(fileName, document.uri);

                return Promise.resolve([fileHeader, ...items]);
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
        const documentUri = document.uri;

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
            // 言語IDに対応するパターンのみ試行する（未登録言語は検出しない）
            if (level === null && markers.length === 0) {
                const activePatternNames = LANGUAGE_PATTERNS[langId];
                if (activePatternNames) {
                    for (const patternName of activePatternNames) {
                        const match = text.match(PATTERNS[patternName]);
                        if (match) {
                            level = match[1].length;
                            label = match[2].trim();
                            break;
                        }
                    }
                }
            }

            if (level !== null && label !== null) {
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
