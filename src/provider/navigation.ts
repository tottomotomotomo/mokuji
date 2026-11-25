import * as vscode from 'vscode';
import { flattenToc } from '../core/parser';
import { MokujiItem, MokujiTreeDataProvider } from './mokujiProvider';

const CURSOR_SYNC_DEBOUNCE_MS = 80;

async function resolveTargetEditor(provider: MokujiTreeDataProvider): Promise<vscode.TextEditor | undefined> {
    if (vscode.window.activeTextEditor) {
        return vscode.window.activeTextEditor;
    }
    const fallbackDoc = provider.getCurrentDocument();
    if (!fallbackDoc) {
        return undefined;
    }
    try {
        return await vscode.window.showTextDocument(fallbackDoc);
    } catch {
        return undefined;
    }
}

function moveToLine(editor: vscode.TextEditor, targetLine: number): void {
    const clampedLine = Math.max(0, Math.min(targetLine, Math.max(0, editor.document.lineCount - 1)));
    const position = new vscode.Position(clampedLine, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

export function registerNavigation(
    treeView: vscode.TreeView<MokujiItem>,
    provider: MokujiTreeDataProvider
): vscode.Disposable {
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const refreshCmd = vscode.commands.registerCommand('mokuji.refresh', () => {
        provider.refresh();
    });

    const nextSectionCmd = vscode.commands.registerCommand('mokuji.nextSection', async () => {
        const editor = await resolveTargetEditor(provider);
        if (!editor) {
            return;
        }
        const headings = flattenToc(provider.getParsedNodes(editor.document));
        const currentLine = editor.selection.active.line;
        const nextHeading = headings.find((node) => node.line > currentLine);
        if (nextHeading) {
            moveToLine(editor, nextHeading.line);
        }
    });

    const prevSectionCmd = vscode.commands.registerCommand('mokuji.prevSection', async () => {
        const editor = await resolveTargetEditor(provider);
        if (!editor) {
            return;
        }
        const headings = flattenToc(provider.getParsedNodes(editor.document));
        const currentLine = editor.selection.active.line;
        for (let i = headings.length - 1; i >= 0; i--) {
            if (headings[i].line < currentLine) {
                moveToLine(editor, headings[i].line);
                break;
            }
        }
    });

    const selectionListener = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (syncTimer !== undefined) {
            clearTimeout(syncTimer);
        }

        syncTimer = setTimeout(async () => {
            syncTimer = undefined;
            if (disposed || !treeView.visible) {
                return;
            }

            const editor = event.textEditor;
            const syncEnabled = vscode.workspace
                .getConfiguration('mokuji', editor.document.uri)
                .get<boolean>('syncCursor', true);
            if (!syncEnabled) {
                return;
            }

            try {
                await provider.getChildren();
                if (disposed || !treeView.visible) {
                    return;
                }
                const cursorLine = event.selections[0]?.active.line ?? editor.selection.active.line;
                const item = provider.findItemAtLine(cursorLine);
                if (item && item.documentUri.toString() === editor.document.uri.toString()) {
                    await treeView.reveal(item, { select: true, focus: false, expand: true });
                }
            } catch {
                // Ignore reveal races if tree state updates concurrently
            }
        }, CURSOR_SYNC_DEBOUNCE_MS);
    });

    return new vscode.Disposable(() => {
        disposed = true;
        if (syncTimer !== undefined) {
            clearTimeout(syncTimer);
            syncTimer = undefined;
        }
        refreshCmd.dispose();
        nextSectionCmd.dispose();
        prevSectionCmd.dispose();
        selectionListener.dispose();
    });
}
