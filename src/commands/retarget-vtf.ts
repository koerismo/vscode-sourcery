import * as vscode from 'vscode';
import Vtf from 'vtf-js';

import { modFilesystem } from '../mod-mount.js';
import { outConsole } from '../extension.js';
import { VCompressionMethods } from 'vtf-js';

const VtfVersions = {
	'7.1': 1,
	'7.2': 2,
	'7.3': 3,
	'7.4': 4,
	'7.5': 5,
	'7.6': 6,
	'7.6 (ZSTD)': [6, VCompressionMethods.ZSTD],
	'7.6 (Deflate)': [6, VCompressionMethods.Deflate],
};

interface RetargetInfo {
	ok: boolean;
	unchanged: boolean;
	lossy: boolean;
	uri: vscode.Uri;
	output?: ArrayBufferLike;
}

async function retargetVtf(uri: vscode.Uri, version: number, compression?: VCompressionMethods): Promise<RetargetInfo> {
	try {
		const inData = await vscode.workspace.fs.readFile(uri);
		const vtf = await Vtf.decode(inData.buffer as ArrayBuffer, { noClone: true });
		const lossy = vtf.meta.length > 0 && version < 3;

		if (
			vtf.version === version &&
			(
				(vtf.compression_level === 0 && compression === undefined) ||
				(vtf.compression_method === compression)
			)
		) {
			return {
				ok: true,
				unchanged: true,
				lossy: false,
				uri,
				output: inData.buffer,
			}
		}

		vtf.version = version;
		if (compression === undefined) {
			vtf.compression_level = 0;
		} else {
			vtf.compression_level = -1;
			vtf.compression_method = compression;
		}

		const outData = await vtf.encode();

		return {
			ok: true,
			unchanged: false,
			lossy,
			uri,
			output: outData,
		}
	}
	catch (e) {
		outConsole.error(e);
		return {
			ok: false,
			unchanged: true,
			lossy: false,
			uri,
		};
	}
}

function getVtfVersionDefault(v: 1 | 2 | 3 | 4 | 5 | 6): keyof typeof VtfVersions | undefined {
	switch (v) {
		case 6:
			return '7.6 (ZSTD)';
		default:
			if (v < 1 || v > 5) return;
			return `7.${v}`;
	}
}

const VtfVersionList = Object.keys(VtfVersions);

export default async function(uri?: vscode.Uri | vscode.Uri[]) {
	let fileList: vscode.Uri[];

	if (uri) {
		if (Array.isArray(uri)) fileList = uri;
		else fileList = [uri];
	} else { 
		const files = await vscode.window.showOpenDialog({ title: 'Pick Vtf', canSelectMany: true, filters: { 'Valve Texture': ['vtf'] } });
		if ((!files || files.length < 1)) return;
		fileList = files;
	}

	// Pick new version
	const opt = await vscode.window.showQuickPick(VtfVersionList, {
		canPickMany: false,
		title: 'New Version',
		placeHolder: getVtfVersionDefault(modFilesystem.getVtfVersion()),
	});

	if (!opt) 
		return outConsole.log('User cancelled Vtf retarget. No files modified.');

	const versionInfo = VtfVersions[opt as keyof typeof VtfVersions];
	
	let versionId: number;
	let compressionMethod: VCompressionMethods | undefined;

	if (typeof versionInfo === 'number') {
		versionId = versionInfo;
	} else {
		[versionId, compressionMethod] = versionInfo;
	}

	if (isNaN(versionId) || versionId < 1 || versionId > 6)
		return 

	// Attempt to read & parse file

	const results = new Array<RetargetInfo>(fileList.length);
	let unchangedCount = 0;
	let failCount = 0;
	let lossyCount = 0;

	for (let i=0; i<fileList.length; i++) {
		const r = results[i] = await retargetVtf(fileList[i], versionId, compressionMethod);
		unchangedCount += +r.unchanged;
		failCount += +!r.ok;
		lossyCount += +r.lossy;
	}

	if (failCount > 0) {
		if (failCount === results.length) {
			vscode.window.showErrorMessage(`File(s) failed to retarget! See console for more info.`);
			return;
		} else {
			const resp = await vscode.window.showErrorMessage(
				'Some vtfs failed to retarget! Continue?',
				'Discard', 'Continue');
			if (resp !== 'Continue') return;
		}
	}

	if (unchangedCount === results.length) {
		vscode.window.showInformationMessage('File(s) match the specified version. No changes made!');
		return;
	}

	if (lossyCount) {
		const resp = await vscode.window.showWarningMessage(
			'The specified vtfs contain metadata that will be lost! Continue?',
			'Discard', 'Continue');
		if (resp !== 'Continue') return;
	} else {
		const resp = await vscode.window.showInformationMessage(
			`${results.length - unchangedCount} file(s) will be modified. Continue?`,
			'Discard', 'Continue');
		if (resp !== 'Continue') return;
	}

	for (let i=0; i<results.length; i++) {
		const r = results[i];
		if (!r.ok || r.unchanged || !r.output) continue;
		await vscode.workspace.fs.writeFile(r.uri, new Uint8Array(r.output));
	}

	vscode.window.showInformationMessage('Files retargeted successfully!');
};
