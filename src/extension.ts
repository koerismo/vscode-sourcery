import * as vscode from 'vscode';
import { setLogTarget } from 'sfs-js';

import { VpkFileSystemProvider } from './vpk-provider';
import { ModFilesystemProvider } from './mod-mount';
import { VmtLinkProvider } from './vmt-provider';
import { ValveTextureEditorProvider } from './vtf-editor';
import { ValveMaterialEditorProvider } from './vmt-editor';
import { ValveModelEditorProvider } from './mdl-editor';
// import { MaterialBrowserManager } from './vmt-browser';

// Commands
import openVpk from './commands/open-vpk';
import revealOriginal from './commands/reveal-original';
import openVmtPreview from './commands/open-vmt-preview';
import { copyModels, renameModel, compileModel } from './commands/model-utils';
// import openVmtBrowser from './commands/open-browser';


function formatDT() {
	const d = new Date();
	const s = d.toLocaleString('en-GB');
	return s.replace(', ', ' ').replaceAll('/', '-');
}
export const outChannel = vscode.window.createOutputChannel('Sourcery', 'log');
export const outConsole = {
	log(message?: any, ...optionalParams: any[]) {
		outChannel.appendLine([formatDT(), '[info]', message, ...optionalParams].join(' '));
	},
	warn(message?: any, ...optionalParams: any[]) {
		outChannel.appendLine([formatDT(), '[warning]', message, ...optionalParams].join(' '));
	},
	error(message?: any, ...optionalParams: any[]) {
		outChannel.appendLine([formatDT(), '[error]', message, ...optionalParams].join(' '));
	}
} as const;

// sfs-js errors should be redirected to the console.
setLogTarget(outConsole);

export function activate(context: vscode.ExtensionContext) {
	outConsole.log('Registering Sourcery extension...');

	// Register providers
	context.subscriptions.push(
		VpkFileSystemProvider.register(),
		ModFilesystemProvider.register(),
		VmtLinkProvider.register(),
		ValveTextureEditorProvider.register(context),
		ValveMaterialEditorProvider.register(context),
		ValveModelEditorProvider.register(context),
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
