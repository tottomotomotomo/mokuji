import * as vscode from 'vscode';

export interface ChatModelLike {
    id: string;
    name: string;
    maxInputTokens?: number;
    sendRequest(
        prompt: string,
        justification: string,
        token: vscode.CancellationToken
    ): Promise<string>;
}

export type ModelSelectorFn = (token: vscode.CancellationToken) => Promise<ChatModelLike | null>;

let mockModelSelector: ModelSelectorFn | null = null;

/**
 * 結合テスト等から決定論的にモデル応答・空モデル・LanguageModelError を差し込むためのモックフック。
 * null を渡すと標準の vscode.lm 選択ロジックに戻る。
 */
export function setMockModelSelector(fn: ModelSelectorFn | null): void {
    mockModelSelector = fn;
}

/**
 * 利用可能な VS Code Language Model を選択して返す。
 * - `mokuji.ai.enabled === 'off'` の場合は常に `null` を返す（モック設定時も優先して無効化）。
 * - `vscode.lm` が未提供、または利用可能なモデルが0件の場合も安全に `null` を返す。
 * - 初回呼び出し時は同意ダイアログが表示され得るため、必ずユーザー操作起点のコマンド内から呼び出すこと。
 */
export async function selectAvailableModel(
    token: vscode.CancellationToken
): Promise<ChatModelLike | null> {
    const aiMode = vscode.workspace
        .getConfiguration('mokuji')
        .get<string>('ai.enabled', 'auto');
    if (aiMode === 'off') {
        return null;
    }

    if (token.isCancellationRequested) {
        return null;
    }

    if (mockModelSelector !== null) {
        return mockModelSelector(token);
    }

    if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
        return null;
    }

    let models: vscode.LanguageModelChat[] = [];
    try {
        models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels();
        }
    } catch {
        return null;
    }

    if (models.length === 0) {
        return null;
    }

    const selected = models[0];
    return {
        id: selected.id,
        name: selected.name,
        maxInputTokens: selected.maxInputTokens,
        async sendRequest(
            prompt: string,
            justification: string,
            reqToken: vscode.CancellationToken
        ): Promise<string> {
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const response = await selected.sendRequest(messages, { justification }, reqToken);
            let output = '';
            for await (const fragment of response.text) {
                if (reqToken.isCancellationRequested) {
                    break;
                }
                output += fragment;
            }
            return output;
        },
    };
}
