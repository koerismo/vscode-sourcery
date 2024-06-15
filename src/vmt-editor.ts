import * as vscode from 'vscode';
import { VImageData, Vtf } from 'vtf-js';
import { KeyV, KeyVRoot, KeyVSet, parse as parseVdf } from 'fast-vdf';
import { ValveTextureDocument } from './vtf-editor.js';
import { modFilesystem } from './mod-mount.js';
import { normalize } from 'path/posix';
import { createServer, type Server } from 'http';

const RE_SLASH = /(\/|\\)+/g;
const HOST_PORT = 50001;

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
	server: Server | null = null;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	static register(context: vscode.ExtensionContext) {
		const editor = new this(context);
		const register = vscode.window.registerCustomEditorProvider('sourcery.vmt', editor, {
			supportsMultipleEditorsPerDocument: true,
			webviewOptions: { enableFindWidget: false, retainContextWhenHidden: true }
		});

		return new vscode.Disposable(() => {
			editor.dispose();
			register.dispose();
		});
	}

	async startup(): Promise<void> {
		if (this.server) return Promise.resolve() ;
		console.log('Starting up VMT server...');
		return new Promise(resolve => {
			this.server = createServer(async (req, res) => {
				if (!modFilesystem.isReady()) {
					res.writeHead(500);
					res.end();
					return;
				}
				res.writeHead(200, { 'access-control-allow-origin': '*' });
				const out = await modFilesystem.gfs.readFile(req.url!, undefined, true);
				if (!out) {
					res.end();
					return;
				}
				res.end(out);

			}).listen(HOST_PORT, 'localhost', () => {
				console.log('Listening!!!');
				resolve();
			});
		});
	}

	dispose() {
		if (this.server) this.server.close();
	}

	getHtml(view: vscode.Webview) {
		const path = (path: string) => {
			return view.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, path));
		};
		console.log(view.cspSource);

		return `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src ${view.cspSource} 'unsafe-eval'; connect-src http://localhost:${HOST_PORT}/ https://*.vscode-cdn.net">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta name="mod_uri" content="${view.asWebviewUri(vscode.Uri.from({ scheme: 'mod', path: '/' }))}">
				<link rel="stylesheet" href="${path('public/css/vmt-editor.css')}" />
			</head>
			<body>
				<script type="module" src="${path('public/dist/vmt-editor.js')}"></script>
			</body>
		</html>
		`;
	}
	
	async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {
		await this.startup();

		webviewPanel.webview.options = {
			enableScripts: true,
			portMapping: [{ extensionHostPort: HOST_PORT, webviewPort: HOST_PORT }],
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'public')]
		};
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

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
