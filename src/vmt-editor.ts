import * as vscode from 'vscode';
import { VImageData, Vtf } from 'vtf-js';
import { KeyV, KeyVRoot, KeyVSet, parse as parseVdf } from 'fast-vdf';
import { ValveTextureDocument } from './vtf-editor.js';
import { modFilesystem } from './mod-mount.js';
import { normalize } from 'path/posix';

const RE_SLASH = /(\/|\\)+/g;

function getImagePath(value: string) {
	let path = ('/materials/' + value).replace(RE_SLASH, '/') + '.vtf';
	return vscode.Uri.from({ scheme: 'mod', path });
}

async function getImage(value: string) {
	const uri = getImagePath(value);
	const document = new ValveTextureDocument(uri);
	return (await document.getVtf()).data.getImage(0, 0, 0, 0);
}

const COLOR_DEFAULT = { r: 1.0, g: 1.0, b: 1.0 };
function parseColor(key: KeyV|null): Color {
	if (key === null) return COLOR_DEFAULT;
	const vec = key.vector(null);
	if (vec !== null) return { r: vec[0], g: vec[1], b: vec[2] };
	const float = key.float(null);
	if (float !== null) return { r: float, g: float, b: float };
	return COLOR_DEFAULT;
}

function getImageData(vimage: VImageData) {
	return { width: vimage.width, height: vimage.height, data: vimage.convert(Uint8Array).data };
}

interface Color { r: number, g: number, b: number }

interface ConfigUpdate {
	translucent: 0|1|2,
	envmap: boolean,
	envmapTint: number,
	phong: boolean,
	phongAmount: number,
	tint: Color,
	phongExponent: number|{ width: number, height: number, data: Uint8Array },
	bumpScale: number,
}

export class ValveMaterialEditorProvider implements vscode.CustomTextEditorProvider {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	static register(context: vscode.ExtensionContext) {
		const editor = new this(context);
		return vscode.window.registerCustomEditorProvider('sourcery.vmt', editor, {
			supportsMultipleEditorsPerDocument: true,
			webviewOptions: { enableFindWidget: false, retainContextWhenHidden: true }
		});
	}

	getHtml(view: vscode.Webview) {
		const path = (path: string) => {
			return view.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, path));
		};

		return `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src ${view.cspSource} 'unsafe-eval';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link rel="stylesheet" href="${path('public/css/vmt-editor.css')}" />
			</head>
			<body>
				<script type="module" src="${path('public/dist/vmt-editor.js')}"></script>
			</body>
		</html>
		`;
	}
	
	async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {
		webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'public'), vscode.Uri.from({ scheme: 'mod', path: '/' })] };
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

		const sendFile = async (path: string) => {
			const file = await modFilesystem.gfs.readFile(normalize('/'+path));
			webviewPanel.webview.postMessage({
				path: path,
				data: file ?? null
			});
		};

		webviewPanel.webview.onDidReceiveMessage(message => {
			if (message.path) {
				sendFile(message.path);
			}
		});

		// Register document edit listener
		// const updateListener = vscode.workspace.onDidChangeTextDocument((event) => {
		// 	if (document !== event.document) return;
		// 	// updateView();
		// });

		// Cleanup
		// webviewPanel.onDidDispose(() => {
		// 	updateListener.dispose();
		// });

		// Initial render
		// updateView();
	}
}
