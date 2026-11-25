import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { MokujiExtensionApi } from '../../src/extension';
import type { SuggestSectionsResult } from '../../src/ai/suggestSections';
import type { GenerateAiInstructionsResult } from '../../src/ai/instructionsGenerator';

suite('Mokuji v0.3.0 Extension Host Integration Suite', () => {
    let api: MokujiExtensionApi;
    const samplesDir = path.resolve(__dirname, '../../../samples');

    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension<MokujiExtensionApi>('tottomotomotomo.mokuji');
        assert.ok(ext, 'Extension tottomotomotomo.mokuji should be found');
        api = await ext.activate();
        assert.ok(api && api.provider, 'Extension API should be returned on activation');
    });

    teardown(async () => {
        api.setMockModelSelector(null);
        await vscode.workspace
            .getConfiguration('mokuji')
            .update('ai.enabled', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace
            .getConfiguration('mokuji')
            .update('lint.enabled', undefined, vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('registers all v0.3.0 commands and mokuji_getToc LanguageModelTool', async () => {
        const allCommands = await vscode.commands.getCommands(true);
        const expectedCommands = [
            'mokuji.refresh',
            'mokuji.nextSection',
            'mokuji.prevSection',
            'mokuji.insertSection',
            'mokuji.suggestSections',
            'mokuji.applySuggestedSections',
            'mokuji.generateAiInstructions',
        ];
        for (const cmd of expectedCommands) {
            assert.ok(allCommands.includes(cmd), `Command ${cmd} should be registered`);
        }

        if (vscode.lm && Array.isArray(vscode.lm.tools)) {
            const hasTocTool = vscode.lm.tools.some((t) => t.name === 'mokuji_getToc');
            assert.ok(hasTocTool, 'mokuji_getToc should be registered in vscode.lm.tools');
        }
    });

    test('builds TreeView items with parent links and navigates next/prev sections', async () => {
        const pyUri = vscode.Uri.file(path.join(samplesDir, 'sample.py'));
        const doc = await vscode.workspace.openTextDocument(pyUri);
        const editor = await vscode.window.showTextDocument(doc);

        const rootItems = await api.provider.getChildren();
        // First item is file header, followed by top-level sections ("Data Models", "Services", "Utilities")
        assert.equal(rootItems.length, 4);
        assert.equal(rootItems[0].label, 'sample.py');
        assert.equal(rootItems[1].label, 'Data Models');
        assert.equal(rootItems[1].children.length, 1);
        assert.equal(rootItems[1].children[0].label, 'User Class');
        assert.equal(api.provider.getParent(rootItems[1].children[0]), rootItems[1]);

        // Place cursor at line 0 ("# # Data Models") and jump to next section ("# ## User Class" at line 5)
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        await vscode.commands.executeCommand('mokuji.nextSection');
        assert.equal(editor.selection.active.line, 5);

        // Jump back to previous section (line 0)
        await vscode.commands.executeCommand('mokuji.prevSection');
        assert.equal(editor.selection.active.line, 0);
    });

    test('inserts formatted section heading via mokuji.insertSection', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: 'export function greet() {\n    return "hi";\n}\n',
        });
        const editor = await vscode.window.showTextDocument(doc);
        editor.selection = new vscode.Selection(0, 0, 0, 0);

        await vscode.commands.executeCommand('mokuji.insertSection', {
            level: 2,
            label: 'Greeting API',
        });

        assert.ok(
            doc.lineAt(0).text.includes('// ## Greeting API'),
            `Expected inserted heading at line 0, got: ${doc.lineAt(0).text}`
        );
    });

    test('reports lint diagnostics and provides Quick Fix for malformed headings', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: '//# MissingSpaceSection\nconst x = 1;\n',
        });
        await vscode.window.showTextDocument(doc);

        const diags = api.diagnostics.lintDocumentNow(doc);
        assert.equal(diags.length, 1);
        assert.equal(diags[0].code, 'missing-space');

        let actions: vscode.CodeAction[] | undefined;
        for (let attempt = 0; attempt < 6; attempt++) {
            try {
                actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                    'vscode.executeCodeActionProvider',
                    doc.uri,
                    new vscode.Range(0, 0, 0, 10),
                    vscode.CodeActionKind.QuickFix.value
                );
                break;
            } catch (err) {
                const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
                if (attempt < 5 && msg.includes('Canceled')) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    continue;
                }
                throw err;
            }
        }
        const fix = actions?.find((a) => a.title.toLowerCase().includes('mokuji') && a.edit);
        assert.ok(fix?.edit, 'Expected Quick Fix CodeAction with WorkspaceEdit');

        await vscode.workspace.applyEdit(fix.edit);
        assert.equal(doc.lineAt(0).text, '// # MissingSpaceSection');
    });

    test('mokuji.suggestSections uses vscode.lm when available and falls back gracefully when absent, errored, or disabled', async () => {
        const sampleCode = [
            'export class AuthService {',
            '    login() { return true; }',
            '}',
            '',
            'export function hashToken(raw: string) {',
            '    return raw;',
            '}',
        ].join('\n');

        // 1. Mock AI model available -> uses AI suggestions
        const docAi = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: sampleCode,
        });
        await vscode.window.showTextDocument(docAi);

        api.setMockModelSelector(async () => ({
            id: 'mock-gpt-4o',
            name: 'Mock Copilot Model',
            async sendRequest() {
                return JSON.stringify([
                    { line: 1, level: 1, label: 'Authentication Service' },
                    { line: 5, level: 1, label: 'Token Helpers' },
                ]);
            },
        }));

        const aiResult = await vscode.commands.executeCommand<SuggestSectionsResult>(
            'mokuji.suggestSections',
            { autoApply: true, silent: true }
        );
        assert.equal(aiResult?.source, 'ai');
        assert.equal(aiResult?.count, 2);
        assert.ok(docAi.getText().includes('// # Authentication Service'));
        assert.ok(docAi.getText().includes('// # Token Helpers'));

        // 2. Copilot absent (selectAvailableModel returns null) -> falls back to outline rules without error
        const docFallback = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: sampleCode,
        });
        await vscode.window.showTextDocument(docFallback);
        api.setMockModelSelector(async () => null);

        const fallbackResult = await vscode.commands.executeCommand<SuggestSectionsResult>(
            'mokuji.suggestSections',
            { autoApply: true, silent: true }
        );
        assert.equal(fallbackResult?.source, 'fallback');
        assert.ok((fallbackResult?.count ?? 0) >= 1);
        assert.ok(docFallback.getText().includes('// # AuthService'));

        // 3. LanguageModelError (e.g. consent denied) -> caught cleanly and falls back
        const docErr = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: sampleCode,
        });
        await vscode.window.showTextDocument(docErr);
        api.setMockModelSelector(async () => ({
            id: 'mock-denied',
            name: 'Mock Denied',
            async sendRequest() {
                throw vscode.LanguageModelError.NoPermissions('Consent not granted');
            },
        }));

        const errFallbackResult = await vscode.commands.executeCommand<SuggestSectionsResult>(
            'mokuji.suggestSections',
            { autoApply: true, silent: true }
        );
        assert.equal(errFallbackResult?.source, 'fallback');
        assert.ok(docErr.getText().includes('// # AuthService'));

        // 4. mokuji.ai.enabled = 'off' -> bypasses AI model even when mock selector is present
        let modelCalled = false;
        api.setMockModelSelector(async () => {
            modelCalled = true;
            return null;
        });
        await vscode.workspace
            .getConfiguration('mokuji')
            .update('ai.enabled', 'off', vscode.ConfigurationTarget.Global);

        const docOff = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: sampleCode,
        });
        await vscode.window.showTextDocument(docOff);

        const offResult = await vscode.commands.executeCommand<SuggestSectionsResult>(
            'mokuji.suggestSections',
            { autoApply: true, silent: true }
        );
        assert.equal(modelCalled, false, 'Model selector must not be called when ai.enabled is off');
        assert.equal(offResult?.source, 'fallback');
    });

    test('mokuji_getToc tool returns structured TOC with 1-indexed line ranges', async () => {
        const cts = new vscode.CancellationTokenSource();
        try {
            const toolResult = await api.tocTool.invoke(
                {
                    input: { filePath: 'sample.py' },
                    toolInvocationToken: undefined,
                },
                cts.token
            );
            const textPart = toolResult.content[0] as vscode.LanguageModelTextPart;
            const payload = JSON.parse(textPart.value);
            assert.equal(payload.languageId, 'python');
            assert.equal(payload.sections.length, 3);
            assert.equal(payload.sections[0].label, 'Data Models');
            assert.equal(payload.sections[0].startLine, 1);
        } finally {
            cts.dispose();
        }
    });

    test('mokuji.generateAiInstructions generates Markdown conventions document', async () => {
        const res = await vscode.commands.executeCommand<GenerateAiInstructionsResult>(
            'mokuji.generateAiInstructions',
            { target: 'agents-md', openOnly: true }
        );
        assert.ok(res?.content.includes('## Mokuji Section Heading Conventions'));
    });
});
