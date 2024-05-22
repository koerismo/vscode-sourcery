// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { VpkFileSystemProvider } from './vpk-provider';
import { GameFileSystemProvider, gameFileSystemProvider } from './game-provider';
import { VmtLinkProvider } from './vmt-provider';
import { ValveTextureEditorProvider } from './vtf-editor';
import { ValveMaterialEditorProvider } from './vmt-editor';

// Commands
import openVpk from './commands/open-vpk';
import revealOriginal from './commands/reveal-original';
import openVmtPreview from './commands/open-vmt-preview';


export function activate(context: vscode.ExtensionContext) {
	console.log('Registering Sourcery extension...');
	
	// Register providers
	context.subscriptions.push(
		VpkFileSystemProvider.register(),
		GameFileSystemProvider.register(),
		VmtLinkProvider.register(),
		ValveTextureEditorProvider.register(context),
		ValveMaterialEditorProvider.register(context),
	);

	// Register auto-disposal subscriptions.
	context.subscriptions.push(
		vscode.commands.registerCommand('sourcery.vpk.open', openVpk),
		vscode.commands.registerCommand('sourcery.game.reveal', revealOriginal),
		vscode.commands.registerCommand('sourcery.vmt.preview', openVmtPreview),
	);

	// Init message
	// vscode.window.showInformationMessage('Sourcery initiated!');
}

// This method is called when your extension is deactivated
export function deactivate() {
}
