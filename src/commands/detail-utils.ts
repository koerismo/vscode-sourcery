import * as vscode from 'vscode';

export async function createNewDetail() {
	const workspace_uri = vscode.workspace.workspaceFolders?.[0]?.uri;
	const file_uri = await vscode.window.showSaveDialog({
		defaultUri: workspace_uri,
		title: 'New Detail',
		saveLabel: 'Create',
		filters: { 'Valve Detail': ['vbsp'] },
	});

	if (!file_uri) return;

	const content = new TextEncoder().encode('detail\n{\n}');
	await vscode.workspace.fs.writeFile(file_uri, content);
	await vscode.commands.executeCommand('vscode.openWith', file_uri, 'sourcery.detail');
	return file_uri;
}
