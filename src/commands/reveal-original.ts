import * as vscode from 'vscode';
import { modFilesystem } from '../mod-mount.js';

export default async (uri?: vscode.Uri, notebook?: boolean, open: boolean=true) => {
	uri ??= vscode.window.activeTextEditor?.document.uri || vscode.window.activeNotebookEditor?.notebook.uri;
	notebook ??= uri === vscode.window.activeNotebookEditor?.notebook.uri;

	if (!uri) {
		vscode.window.showErrorMessage('Cannot resolve active document!');
		return;
	}

	if (!modFilesystem.isReady()) {
		vscode.window.showErrorMessage('Cannot resolve mod:// path with no active game!');
		return;
	}
	
	const origin_uri = await modFilesystem.findFileUri(uri);
	if (!origin_uri) {
		vscode.window.showErrorMessage('Failed to locate original file!');
		return;
	}

	if (open) {
		vscode.commands.executeCommand('vscode.open', origin_uri);
	}

	return origin_uri;
};
