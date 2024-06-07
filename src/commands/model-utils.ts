import * as vscode from 'vscode';

export async function copyModels(uri?: vscode.Uri|vscode.Uri[], target_root?: vscode.Uri) {
	let files: vscode.Uri[];

	if (uri) {
		if (!Array.isArray(uri)) files = [uri];
		else files = uri;
	}
	else {
		const result = await vscode.window.showOpenDialog({
			title: 'Select Model',
			canSelectMany: true,
			filters: {'Model': ['.*\.mdl']},
			defaultUri: vscode.Uri.from({ scheme: 'game', path: '/models' }),
		});

		if (!(result !== undefined && result.length > 0)) return;
		files = result;
	}

	target_root ??= vscode.workspace.workspaceFolders?.[0]?.uri;
	if (!target_root) return console.error(`No workspace open and no target folder provided!`);
	
	for (const file of files) {
		const target = vscode.Uri.joinPath(target_root, file.path);
		console.log(file.toString(), 'to', target.toString());
		// vscode.workspace.fs.copy(file, target);
	}
}

export async function renameModel(uri?: vscode.Uri, new_uri?: vscode.Uri) {

}

export async function batchRenameModels(uris?: vscode.Uri[], regex?: RegExp, format?: string) {

}