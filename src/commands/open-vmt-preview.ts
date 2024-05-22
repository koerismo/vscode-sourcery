import * as vscode from 'vscode';

export default async (uri?: vscode.Uri) => {
	uri ??= vscode.window.activeTextEditor?.document.uri;
	if (!uri) return;
	vscode.commands.executeCommand('vscode.openWith', uri, 'sourcery.vmt', { viewColumn: vscode.ViewColumn.Beside });
};
