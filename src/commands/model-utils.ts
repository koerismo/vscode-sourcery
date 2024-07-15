import * as vscode from 'vscode';
import { join, normalize, posix, relative, parse, resolve } from 'path';
import { platform } from 'os';

import { modFilesystem } from '../mod-mount.js';
import { outConsole } from '../extension.js';

const COPYLIST = [
	'.mdl',
	'.vvd',
	'.vtx',
	'.dx80.vtx',
	'.dx90.vtx',
	'.sw.vtx',
	'.xbox.vtx',
	'.phy',
	'.ani',
];

async function fileExists(uri: vscode.Uri) {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	}
	catch {
		return false;
	}
}

async function ifExists(path: string) {
	try {
		await vscode.workspace.fs.stat(vscode.Uri.file(path));
		return path;
	}
	catch {
		return undefined;
	}
}


// Invoked by copyFiles
export async function copyModel(source: vscode.Uri, target: vscode.Uri) {
	const sourceNoExt = source.path.slice(0, -4);
	const targetNoExt = source.path.slice(0, -4);

	let isReplacing = false;
	for (const item of COPYLIST) {
		const path_to   = target.with({ path: targetNoExt + item });
		try {
			vscode.workspace.fs.stat(path_to);
			isReplacing = true;
		}
		catch {
			// i love errors!!! :D
		}
	}

	if (isReplacing) {
		const response = await vscode.window.showWarningMessage('Overwrite existing model files?', 'Continue', 'Cancel');
		if (!response || response === 'Cancel') return;
	}

	for (const item of COPYLIST) {
		const path_from = source.with({ path: sourceNoExt + item });
		const path_to   = target.with({ path: targetNoExt + item });
		vscode.workspace.fs.copy(path_from, path_to, { overwrite: true });
	}
}

// Invoked by vscode.workspace.onDidRenameFiles
export async function renameModel(e: vscode.FileRenameEvent) {

	// Make sure that a sourcemod is loaded so that we can edit the path correctly.
	if (!modFilesystem.isReady()) return;

	for (const file of e.files) {
		if (!file.oldUri.path.endsWith('.mdl')) continue;
		if (!file.newUri.path.endsWith('.mdl')) continue;
		const old_path_prefix = file.oldUri.path.slice(0, -4);
		const new_path_prefix = file.newUri.path.slice(0, -4);
		let rename_count = 0;

		// Check that we aren't overwriting anything. Even if the file isn't getting copied, it could still cause problems!
		const exists: Record<string, boolean> = {};
		for (const item of COPYLIST) {
			if (item === '.mdl') continue;
			const old_item_uri = file.oldUri.with({ path: old_path_prefix + item });
			const new_item_uri = file.newUri.with({ path: new_path_prefix + item });
			if (await fileExists(new_item_uri)) {
				return vscode.window.showWarningMessage(`Smart rename cancelled! Conflicting model files already exist.`);
			}
			if (exists[item] = await fileExists(old_item_uri)) {
				rename_count ++;
			}
		}

		// Actually do the copy
		for (const item of COPYLIST) {
			if (item === '.mdl') continue;
			const old_item_uri = file.oldUri.with({ path: old_path_prefix + item });
			const new_item_uri = file.newUri.with({ path: new_path_prefix + item });
			if (exists[item]) vscode.workspace.fs.rename(old_item_uri, new_item_uri);
		}

		// Edit the internal model path to match the new name
		const mdl_bytes = new Uint8Array(await vscode.workspace.fs.readFile(file.newUri));
		const mdl_name_bytes = new Uint8Array(mdl_bytes.buffer, 12, 64);
		// const old_mdl_name = new TextDecoder().decode(mdl_name_bytes);
		const new_mdl_name = posix.normalize(relative(join(modFilesystem.gfs.modroot, 'models'), file.newUri.path));
		
		mdl_name_bytes.fill(0);
		new TextEncoder().encodeInto(new_mdl_name, mdl_name_bytes);
		// console.log('Old mdl name =', old_mdl_name);
		// console.log('New mdl name =', new_mdl_name);
		
		vscode.workspace.fs.writeFile(file.newUri, mdl_bytes);
		vscode.window.showInformationMessage(`Smart-renamed ${rename_count} model partner files!`);
	}
}

// Invoked by command
export async function compileModel(uri?: vscode.Uri, notebook?: boolean): Promise<void> {
	const config = vscode.workspace.getConfiguration('sourcery.game');
	const manualBinPath = config.get<string>('binPath');

	uri ??= vscode.window.activeTextEditor?.document.uri || vscode.window.activeNotebookEditor?.notebook.uri;
	notebook ??= uri === vscode.window.activeNotebookEditor?.notebook.uri;

	if (!uri) {
		vscode.window.showErrorMessage('No document is currently active!');
		return;
	}

	let gameRoot: string;
	if (modFilesystem.isReady()) {
		gameRoot = modFilesystem.gfs.gameroot ?? modFilesystem.gfs.modroot;
	}
	else if (manualBinPath !== undefined) {
		gameRoot = resolve(manualBinPath, '../');
	}
	else {
		vscode.window.showErrorMessage('Cannot resolve mod:// path with no active game!');
		return;
	}
	
	let studiomdl_path: string | undefined;
	if (platform() === 'win32') studiomdl_path = (
		(await ifExists(join(gameRoot, 'bin/studiomdl.exe'))) ??
		(await ifExists(join(gameRoot, 'bin/win64/studiomdl.exe')))
	);
	else studiomdl_path = (
		(await ifExists(join(gameRoot, 'bin/studiomdl'))) ??
		(await ifExists(join(gameRoot, 'bin/linux64/studiomdl')))
	);

	if (studiomdl_path === undefined) {
		vscode.window.showErrorMessage('Could not locate studiomdl!');
		return;
	}

	vscode.tasks.executeTask(new vscode.Task(
		{ type: 'studiomdl' },
		vscode.TaskScope.Workspace,
		'Model Compile',
		'studiomdl',
		new vscode.ProcessExecution(studiomdl_path, ['-game', normalize(modFilesystem.gfs.modroot), normalize(uri.fsPath)])
	));
	
	return;
};
