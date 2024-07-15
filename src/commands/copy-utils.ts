import * as vscode from 'vscode';
import { outConsole } from '../extension.js';
import { getWorkspaceUri, modFilesystem } from '../mod-mount.js';
import { copyModel } from './model-utils.js';

export async function copyFiles(uri?: vscode.Uri|vscode.Uri[], target_root?: vscode.Uri) {
	target_root ??= getWorkspaceUri();
	if (!target_root) return outConsole.error(`No workspace open and no target folder provided!`);

	let files: vscode.Uri[];
	if (uri) {
		if (!Array.isArray(uri)) files = [uri];
		else files = uri;
	}
	else {
		const result = await vscode.window.showOpenDialog({
			title: 'Select Assets',
			canSelectMany: true,
			filters: {'Model': ['mdl'], 'Material': ['vmt'], 'Texture': ['vtf'], 'Map': ['bsp', 'vmf', 'vmx'], 'Detail': ['vbsp']},
			defaultUri: vscode.Uri.from({ scheme: 'mod', path: '/models' }),
		});

		if (!(result !== undefined && result.length > 0)) return;
		files = result;
	}

	for (const file of files) {
		if (file.scheme !== 'mod') continue;
		const origin = (await modFilesystem.findFileUri(file))!;
		if (!origin) continue;

		const source = origin;
		const target = vscode.Uri.joinPath(target_root, file.path );
		if (source.path === target.path) continue;

		if (file.path.endsWith('.mdl')) {
			copyModel(source, target);
		}
		else {
			vscode.workspace.fs.copy(source, target);
		}
	}

}