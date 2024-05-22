import * as vscode from 'vscode';

export default async (uri?: vscode.Uri) => {
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
	vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, null, { uri: vpk_root });
};
