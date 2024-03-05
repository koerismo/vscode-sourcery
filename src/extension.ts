// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { VpkFileSystemProvider } from './vpk-provider';
import { GameFileSystemProvider, gameFileSystemProvider } from './game-provider';
import { VmtLinkProvider } from './vmt-provider';
import { ValveTextureEditorProvider } from './vtf-editor';


export function activate(context: vscode.ExtensionContext) {
	console.log('Registering Sourcery extension...');
	
	// Register providers
	context.subscriptions.push(
		VpkFileSystemProvider.register(),
		GameFileSystemProvider.register(),
		VmtLinkProvider.register(),
		ValveTextureEditorProvider.register(context),
	);

	// Register VPK open command.
	const vpkOpenCommand = vscode.commands.registerCommand('sourcery.vpk.open', async (uri?: vscode.Uri) => {
		let file: vscode.Uri;
		
		if (uri) {
			if (!uri.path.endsWith('_dir.vpk')) return vscode.window.showErrorMessage('File must be *_dir.vpk!');
			file = uri;
		}
		else {
			const files = await vscode.window.showOpenDialog({ title: 'Open Vpk', canSelectMany: false, filters: {'Vpk (Dir)': ['.+_dir\.vpk']} });
			if (!(files !== undefined && files.length > 0)) return;
			file = files[0];
		}

		// Figure out the new root.
		const vpk_root = vscode.Uri.from({ scheme: 'vpk', path: file.path+'/' });

		// Open the new workspace.
		console.log('Registered. Opening workspace with URI '+vpk_root.toString());
		vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, null, { uri: vpk_root });
	});

	const gameRevealCommand = vscode.commands.registerCommand('sourcery.game.reveal', async (uri?: vscode.Uri, notebook?: boolean, open: boolean=true) => {
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
	});

	// Register auto-disposal subscriptions.
	context.subscriptions.push(
		vpkOpenCommand,
		gameRevealCommand
	);

	// Init message
	// vscode.window.showInformationMessage('Sourcery initiated!');
}

// This method is called when your extension is deactivated
export function deactivate() {
}
