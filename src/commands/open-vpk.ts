import * as vscode from 'vscode';

const RE_3DIGITS = /\d{3}\.vpk$/;

export default async (uri?: vscode.Uri) => {
	if (!uri) {
		const files = await vscode.window.showOpenDialog({ title: 'Open Vpk', canSelectMany: false, filters: {'Valve Pack': ['vpk']} });
		if (!files || !files.length) return;
		uri = files[0];
	}

	// Use XYZ_dir.vpk instead of XYZ_123.vpk
	if (RE_3DIGITS.test(uri.path)) {
		uri = uri.with({
			path: uri.path.slice(0, -7) + 'dir.vpk'
		});
	}

	// Figure out the new root.
	const vpk_root = vscode.Uri.from({ scheme: 'vpk', path: uri.path+'/' });

	// Open the new workspace.
	vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, null, { uri: vpk_root });
};
