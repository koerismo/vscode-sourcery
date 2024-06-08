import * as vscode from 'vscode';

import { VpkFileSystemProvider } from './vpk-provider';
import { ModFilesystemProvider } from './mod-mount';
import { VmtLinkProvider } from './vmt-provider';
import { ValveTextureEditorProvider } from './vtf-editor';
import { ValveMaterialEditorProvider } from './vmt-editor';
// import { MaterialBrowserManager } from './vmt-browser';

// Commands
import openVpk from './commands/open-vpk';
import revealOriginal from './commands/reveal-original';
import openVmtPreview from './commands/open-vmt-preview';
import { copyModels, renameModel, compileModel } from './commands/model-utils';
// import openVmtBrowser from './commands/open-browser';


export function activate(context: vscode.ExtensionContext) {
	console.log('Registering Sourcery extension...');
	
	// Register providers
	context.subscriptions.push(
		VpkFileSystemProvider.register(),
		ModFilesystemProvider.register(),
		VmtLinkProvider.register(),
		ValveTextureEditorProvider.register(context),
		ValveMaterialEditorProvider.register(context),
		// MaterialBrowserManager.register(context),
	);

	// Register auto-disposal subscriptions.
	context.subscriptions.push(
		vscode.commands.registerCommand('sourcery.vpk.open', openVpk),
		vscode.commands.registerCommand('sourcery.game.reveal', revealOriginal),
		vscode.commands.registerCommand('sourcery.vmt.preview', openVmtPreview),
		vscode.commands.registerCommand('sourcery.mdl.copy', copyModels),
		vscode.commands.registerCommand('sourcery.mdl.compile', compileModel),
		vscode.workspace.onDidRenameFiles(renameModel),
		// vscode.commands.registerCommand('sourcery.vmt.browse', openVmtBrowser),
	);

	// Init message
	// vscode.window.showInformationMessage('Sourcery initiated!');
}

// This method is called when your extension is deactivated
export function deactivate() {
}
