import * as vscode from 'vscode';
import { gameFileSystemProvider } from '../game-provider';

export default async (uri?: vscode.Uri, notebook?: boolean, open: boolean=true) => {
	uri ??= vscode.window.activeTextEditor?.document.uri || vscode.window.activeNotebookEditor?.notebook.uri;
	notebook ??= uri === vscode.window.activeNotebookEditor?.notebook.uri;

	if (!uri) {
		vscode.window.showErrorMessage('Cannot resolve active document!');
		return;
	}

	const currentGame = await gameFileSystemProvider.getGame();
	if (!currentGame) {
		vscode.window.showErrorMessage('Cannot resolve game:// path with no active game!');
		return;
	}
	
	const original_uri = await gameFileSystemProvider.locateFile(currentGame, uri);
	if (!original_uri) {
		vscode.window.showErrorMessage('Failed to locate original file!');
		return;
	}

	if (open) {
		vscode.commands.executeCommand('vscode.open', original_uri);
	}

	return original_uri;
};
