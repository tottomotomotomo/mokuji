import * as vscode from 'vscode';
import { MokujiTreeDataProvider } from './mokujiProvider';

export function activate(context: vscode.ExtensionContext) {
    const mokujiProvider = new MokujiTreeDataProvider();
    const treeViewRegistration = vscode.window.registerTreeDataProvider('mokujiView', mokujiProvider);
    context.subscriptions.push(mokujiProvider, treeViewRegistration);
}

export function deactivate() { }
