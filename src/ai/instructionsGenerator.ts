import * as vscode from 'vscode';
import {
    generateAiInstructionsMarkdown,
    getTargetRelativePath,
    inferLanguageIdFromFilePath,
    mergeAiInstructionsContent,
    MOKUJI_INSTRUCTIONS_HEADING,
} from '../core/instructions';
import { SUPPORTED_LANGUAGE_IDS } from '../core/patterns';
import { AiInstructionTarget, WorkspaceConfig } from '../core/types';

export {
    generateAiInstructionsMarkdown,
    getTargetRelativePath,
    inferLanguageIdFromFilePath,
    mergeAiInstructionsContent,
    MOKUJI_INSTRUCTIONS_HEADING,
};

export interface GenerateAiInstructionsOptions {
    target?: AiInstructionTarget;
    openOnly?: boolean;
}

export interface GenerateAiInstructionsResult {
    uri?: vscode.Uri;
    content: string;
}

interface TargetQuickPickItem extends vscode.QuickPickItem {
    target: AiInstructionTarget;
}

async function detectWorkspaceLanguages(): Promise<string[]> {
    const supportedSet = new Set<string>(SUPPORTED_LANGUAGE_IDS);
    const detected: string[] = [];
    const seen = new Set<string>();

    const addLang = (lang: string | null | undefined): void => {
        if (lang && supportedSet.has(lang) && !seen.has(lang)) {
            seen.add(lang);
            detected.push(lang);
        }
    };

    // 1. アクティブエディタの言語を最優先で追加
    addLang(vscode.window.activeTextEditor?.document.languageId);

    // 2. 開いているテキストドキュメントの言語を追加
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.uri.scheme === 'file' || doc.uri.scheme === 'untitled') {
            addLang(doc.languageId);
        }
    }

    // 3. ワークスペース内ファイルを最大200件スキャンして使用言語を補完
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        try {
            const uris = await vscode.workspace.findFiles(
                '**/*.{ts,tsx,js,mjs,cjs,jsx,py,css,scss,less,html,htm,md,java,go,vue,svelte}',
                '**/{node_modules,.git,out,out-test,dist,build,.vscode-test}/**',
                200
            );
            for (const uri of uris) {
                addLang(inferLanguageIdFromFilePath(uri.path));
            }
        } catch {
            // findFiles 失敗時は開いているドキュメント情報のみで続行
        }
    }

    return detected;
}

export function registerGenerateAiInstructions(
    getWorkspaceConfig: (uri: vscode.Uri) => WorkspaceConfig | null = () => null
): vscode.Disposable {
    return vscode.commands.registerCommand(
        'mokuji.generateAiInstructions',
        async (
            options?: GenerateAiInstructionsOptions
        ): Promise<GenerateAiInstructionsResult | undefined> => {
            let target = options?.target;

            if (!target) {
                const items: TargetQuickPickItem[] = [
                    {
                        label: 'AGENTS.md',
                        description: 'Cross-agent workspace instructions at repository root',
                        target: 'agents-md',
                    },
                    {
                        label: '.github/copilot-instructions.md',
                        description: 'GitHub Copilot custom repository instructions',
                        target: 'copilot-instructions',
                    },
                    {
                        label: 'CLAUDE.md',
                        description: 'Claude Code instructions at repository root',
                        target: 'claude-md',
                    },
                ];
                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select where to write Mokuji AI section heading instructions',
                });
                if (!picked) {
                    return undefined;
                }
                target = picked.target;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const scopeUri =
                workspaceFolder?.uri ?? vscode.window.activeTextEditor?.document.uri;
            const headingMarkers = vscode.workspace
                .getConfiguration('mokuji', scopeUri)
                .get<Record<string, string[]>>('headingMarkers', {});
            const workspaceConfig = scopeUri ? getWorkspaceConfig(scopeUri) : null;

            const languageIds = await detectWorkspaceLanguages();
            const generatedSection = generateAiInstructionsMarkdown({
                languageIds,
                headingMarkers,
                workspaceConfig,
                target,
            });

            if (options?.openOnly || !workspaceFolder) {
                const untitledDoc = await vscode.workspace.openTextDocument({
                    language: 'markdown',
                    content: generatedSection,
                });
                await vscode.window.showTextDocument(untitledDoc);
                return { content: generatedSection };
            }

            const relPath = getTargetRelativePath(target);
            const pathParts = relPath.split('/');
            const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, ...pathParts);

            if (pathParts.length > 1) {
                const parentDirUri = vscode.Uri.joinPath(
                    workspaceFolder.uri,
                    ...pathParts.slice(0, -1)
                );
                await vscode.workspace.fs.createDirectory(parentDirUri);
            }

            const openDoc = vscode.workspace.textDocuments.find(
                (d) => d.uri.toString() === targetUri.toString()
            );

            let existingContent = '';
            if (openDoc) {
                existingContent = openDoc.getText();
            } else {
                try {
                    const bytes = await vscode.workspace.fs.readFile(targetUri);
                    existingContent = Buffer.from(bytes).toString('utf8');
                } catch {
                    existingContent = '';
                }
            }

            const mergedContent = mergeAiInstructionsContent(existingContent, generatedSection);

            if (openDoc) {
                const fullRange = openDoc.validateRange(
                    new vscode.Range(0, 0, openDoc.lineCount + 1, 0)
                );
                const edit = new vscode.WorkspaceEdit();
                edit.replace(targetUri, fullRange, mergedContent);
                await vscode.workspace.applyEdit(edit);
                await openDoc.save();
            } else {
                await vscode.workspace.fs.writeFile(
                    targetUri,
                    Buffer.from(mergedContent, 'utf8')
                );
            }

            const doc = await vscode.workspace.openTextDocument(targetUri);
            await vscode.window.showTextDocument(doc);

            return {
                uri: targetUri,
                content: mergedContent,
            };
        }
    );
}
