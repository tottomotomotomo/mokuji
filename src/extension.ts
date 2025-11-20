import * as vscode from 'vscode';
import { MokujiTreeDataProvider } from './mokujiProvider';

export function activate(context: vscode.ExtensionContext) {
    const mokujiProvider = new MokujiTreeDataProvider();
    vscode.window.registerTreeDataProvider('mokujiView', mokujiProvider);
}

export function deactivate() { }
