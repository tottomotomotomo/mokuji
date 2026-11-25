import * as vscode from 'vscode';
import { lintText } from '../core/linter';
import { LintIssue } from '../core/types';
import { MokujiTreeDataProvider } from '../provider/mokujiProvider';

const DIAGNOSTIC_SOURCE = 'mokuji';
const LINT_DEBOUNCE_MS = 200;

export class MokujiDiagnosticsManager implements vscode.Disposable {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;
    private readonly issuesByUri = new Map<string, LintIssue[]>();
    private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly disposables: vscode.Disposable[] = [];
    private disposed = false;

    constructor(private readonly provider: MokujiTreeDataProvider) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);

        const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
            { scheme: '*' },
            {
                provideCodeActions: (document, range, context) =>
                    this.provideCodeActions(document, range, context),
            },
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
            }
        );

        this.disposables.push(
            this.diagnosticCollection,
            codeActionRegistration,
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) {
                    this.lintDocumentNow(editor.document);
                }
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                this.scheduleLint(event.document);
            }),
            vscode.workspace.onDidCloseTextDocument((document) => {
                const uriKey = document.uri.toString();
                const pending = this.debounceTimers.get(uriKey);
                if (pending !== undefined) {
                    clearTimeout(pending);
                    this.debounceTimers.delete(uriKey);
                }
                this.issuesByUri.delete(uriKey);
                this.diagnosticCollection.delete(document.uri);
            }),
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('mokuji')) {
                    this.onConfigurationChanged();
                }
            })
        );

        if (vscode.window.activeTextEditor) {
            this.lintDocumentNow(vscode.window.activeTextEditor.document);
        }
    }

    public dispose(): void {
        this.disposed = true;
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.issuesByUri.clear();
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private isLintEnabled(uri?: vscode.Uri): boolean {
        return vscode.workspace.getConfiguration('mokuji', uri).get<boolean>('lint.enabled', true);
    }

    private onConfigurationChanged(): void {
        if (!this.isLintEnabled()) {
            for (const timer of this.debounceTimers.values()) {
                clearTimeout(timer);
            }
            this.debounceTimers.clear();
            this.issuesByUri.clear();
            this.diagnosticCollection.clear();
            return;
        }

        const lintedUris = new Set<string>();
        if (vscode.window.activeTextEditor) {
            const doc = vscode.window.activeTextEditor.document;
            lintedUris.add(doc.uri.toString());
            this.lintDocumentNow(doc);
        }
        for (const visibleEditor of vscode.window.visibleTextEditors) {
            const doc = visibleEditor.document;
            const key = doc.uri.toString();
            if (!lintedUris.has(key)) {
                lintedUris.add(key);
                this.lintDocumentNow(doc);
            }
        }
    }

    private scheduleLint(document: vscode.TextDocument): void {
        const uriKey = document.uri.toString();
        const existingTimer = this.debounceTimers.get(uriKey);
        if (existingTimer !== undefined) {
            clearTimeout(existingTimer);
        }

        if (!this.isLintEnabled(document.uri)) {
            this.debounceTimers.delete(uriKey);
            this.issuesByUri.delete(uriKey);
            this.diagnosticCollection.delete(document.uri);
            return;
        }

        const timer = setTimeout(() => {
            this.debounceTimers.delete(uriKey);
            if (!this.disposed && !document.isClosed) {
                this.lintDocumentNow(document);
            }
        }, LINT_DEBOUNCE_MS);

        this.debounceTimers.set(uriKey, timer);
    }

    public lintDocumentNow(document: vscode.TextDocument): vscode.Diagnostic[] {
        const uriKey = document.uri.toString();
        const pendingTimer = this.debounceTimers.get(uriKey);
        if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            this.debounceTimers.delete(uriKey);
        }

        if (!this.isLintEnabled(document.uri)) {
            this.issuesByUri.delete(uriKey);
            this.diagnosticCollection.delete(document.uri);
            return [];
        }

        const parseOptions = this.provider.getParseOptions(document);
        const issues = lintText(document.getText(), parseOptions);
        this.issuesByUri.set(uriKey, issues);

        const diagnostics = issues.map((issue) => {
            const safeLine = Math.min(issue.line, Math.max(0, document.lineCount - 1));
            const lineLength = document.lineCount > 0 ? document.lineAt(safeLine).text.length : 0;
            const startCol = Math.min(issue.startColumn, lineLength);
            const endCol = Math.min(Math.max(startCol, issue.endColumn), lineLength);
            const range = new vscode.Range(safeLine, startCol, safeLine, endCol);

            const severity = issue.severity === 'warning'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Information;
            const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
            diagnostic.source = DIAGNOSTIC_SOURCE;
            diagnostic.code = issue.code;
            return diagnostic;
        });

        if (diagnostics.length > 0) {
            this.diagnosticCollection.set(document.uri, diagnostics);
        } else {
            this.diagnosticCollection.delete(document.uri);
        }

        return diagnostics;
    }

    private provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        if (!this.isLintEnabled(document.uri)) {
            return [];
        }

        const uriKey = document.uri.toString();
        const issues = this.issuesByUri.get(uriKey)
            ?? lintText(document.getText(), this.provider.getParseOptions(document));

        const actions: vscode.CodeAction[] = [];
        const storedDiagnostics = this.diagnosticCollection.get(document.uri) ?? [];

        for (const issue of issues) {
            if (issue.replacement === undefined || issue.line >= document.lineCount) {
                continue;
            }

            const lineObj = document.lineAt(issue.line);
            const issueRange = new vscode.Range(
                issue.line,
                Math.min(issue.startColumn, lineObj.text.length),
                issue.line,
                Math.min(issue.endColumn, lineObj.text.length)
            );

            if (!issueRange.intersection(range) && !lineObj.range.intersection(range)) {
                continue;
            }

            const matchingDiagnostic =
                context.diagnostics.find(
                    (d) => d.source === DIAGNOSTIC_SOURCE && d.code === issue.code && d.range.start.line === issue.line
                ) ??
                storedDiagnostics.find(
                    (d) => d.source === DIAGNOSTIC_SOURCE && d.code === issue.code && d.range.start.line === issue.line
                );

            const title = issue.code === 'missing-space'
                ? `Mokuji: Fix heading spacing to '${issue.replacement.trim()}'`
                : `Mokuji: Adjust heading level to '${issue.replacement.trim()}'`;

            const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
            action.isPreferred = true;
            if (matchingDiagnostic) {
                action.diagnostics = [matchingDiagnostic];
            }

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, lineObj.range, issue.replacement);
            action.edit = edit;
            actions.push(action);
        }

        return actions;
    }
}
