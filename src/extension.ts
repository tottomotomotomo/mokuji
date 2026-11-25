import * as vscode from 'vscode';
import { registerGenerateAiInstructions } from './ai/instructionsGenerator';
import { ModelSelectorFn, setMockModelSelector } from './ai/lmClient';
import { registerSuggestSections } from './ai/suggestSections';
import { MokujiTocTool, registerTocTool } from './ai/tocTool';
import { MokujiDiagnosticsManager } from './features/diagnostics';
import { registerInsertSection } from './features/insertSection';
import { MokujiTreeDataProvider } from './provider/mokujiProvider';
import { registerNavigation } from './provider/navigation';

export interface MokujiExtensionApi {
    readonly provider: MokujiTreeDataProvider;
    readonly diagnostics: MokujiDiagnosticsManager;
    readonly tocTool: MokujiTocTool;
    readonly setMockModelSelector: (fn: ModelSelectorFn | null) => void;
}

export function activate(context: vscode.ExtensionContext): MokujiExtensionApi {
    const mokujiProvider = new MokujiTreeDataProvider();
    const treeView = vscode.window.createTreeView('mokujiView', {
        treeDataProvider: mokujiProvider,
        showCollapseAll: true,
    });

    const navigation = registerNavigation(treeView, mokujiProvider);
    const diagnostics = new MokujiDiagnosticsManager(mokujiProvider);
    const insertSection = registerInsertSection(mokujiProvider);

    const getWorkspaceConfig = (uri: vscode.Uri) => mokujiProvider.getWorkspaceConfigForUri(uri);
    const suggestSections = registerSuggestSections(getWorkspaceConfig);
    const tocTool = new MokujiTocTool(getWorkspaceConfig);
    const tocToolRegistration = registerTocTool(getWorkspaceConfig);
    const aiInstructions = registerGenerateAiInstructions(getWorkspaceConfig);

    context.subscriptions.push(
        mokujiProvider,
        treeView,
        navigation,
        diagnostics,
        insertSection,
        suggestSections,
        tocToolRegistration,
        aiInstructions
    );

    return {
        provider: mokujiProvider,
        diagnostics,
        tocTool,
        setMockModelSelector,
    };
}

export function deactivate() {}
