import * as vscode from 'vscode';
import Vtf from 'vtf-js';

import { modFilesystem } from '../mod-mount.js';
import { outConsole } from '../extension.js';
import { VCompressionMethods } from 'vtf-js';

async function retargetVtf(uri?: vscode.Uri) {
	if (!uri) {
		const files = await vscode.window.showOpenDialog({ title: 'Pick Vtf', canSelectMany: false, filters: { 'Valve Texture': ['vtf'] } });
		if ((!files || files.length !== 1)) return;
		uri = files[0];
	}

	// Pick new version
	const opt = await vscode.window.showQuickPick([
		'7.1', '7.2', '7.3',
		'7.4', '7.5', '7.6 (Compressed)'
	], { canPickMany: false, title: 'New Version', placeHolder: '7.' + modFilesystem.getVtfVersion() });
	if (!opt)
		return outConsole.log('User cancelled Vtf retarget.');

	// Decode version number
	const new_version = +opt[2];
	if (isNaN(new_version) || new_version < 1 || new_version > 6)
		return outConsole.log(`Got invalid pick for new Vtf version: "${opt}"`);

	// Attempt to read & parse file
	const file = await vscode.workspace.fs.readFile(uri);

	try {
		const vtf = await Vtf.decode(file.buffer as ArrayBuffer, false);

		// Version already matches? No changes necessary!
		if (vtf.version === new_version)
			return vscode.window.showInformationMessage('No changes necessary!');

		const prev_version = vtf.version;
		vtf.version = new_version;
		if (vtf.version === 6) {
			vtf.compression_level = 6;
			vtf.compression_method = VCompressionMethods.Deflate;
		}
		else {
			vtf.compression_level = 0;
		}
		
		const new_vtf = await vtf.encode();
		vscode.workspace.fs.writeFile(uri.with({ path: uri.path.slice(0,-4) + `_v${new_version}.vtf` }), new Uint8Array(new_vtf));

		vscode.window.showInformationMessage(`Retargeted Vtf from v7.${prev_version} to v7.${new_version}!`);
		outConsole.log(`Retargeted Vtf successfully!`);
	}
	catch (e) {
		vscode.window.showErrorMessage('Retarget failed! File not modified.');
		outConsole.error('Failed to retarget Vtf file! Error message:\n' + e);
	}
};

export default retargetVtf;
