import * as vscode from 'vscode';

export async function copyModels(uri?: vscode.Uri[], target_folder?: vscode.Uri) {
	let files: vscode.Uri[];

	if (uri) {
		files = uri;
	}
	else {
		const result = await vscode.window.showOpenDialog({ title: 'Select Model', canSelectMany: true, filters: {'Model': ['.*\.mdl']} });
		if (!(result !== undefined && result.length > 0)) return;
		files = result;
	}

	for (const file of files) {
		const target = target_folder ?? file.path;
		// vscode.workspace.fs.copy(file, )
	}
}

export async function renameModel(uri?: vscode.Uri, new_uri?: vscode.Uri) {

}

export async function batchRenameModels(uris?: vscode.Uri[], regex?: RegExp, format?: string) {

}