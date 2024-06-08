import * as vscode from 'vscode';
import { VImageData, Vtf } from 'vtf-js';
import { KeyV, KeyVRoot, KeyVSet, parse as parseVdf } from 'fast-vdf';
import { ValveTextureDocument } from './vtf-editor';

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
				<meta http-equiv="Content-Security-Policy" content="default-src ${view.cspSource};">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link rel="stylesheet" href="${path('public/vmt-editor/index.css')}" />
			</head>
			<body>
				<canvas id="image"></canvas>
				<script type="module" src="${path('public/vmt-editor/index.js')}"></script>
			</body>
		</html>
		`;
	}
	
	async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {
		webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'public')] };
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

		const sendImage = (field: string, image: VImageData) => {
			webviewPanel.webview.postMessage({
				type: 'update',
				field: field,
				data: image.convert(Uint8Array).data,
				width: image.width,
				height: image.height,
			});
		};

		const sendConfig = (config: ConfigUpdate) => {
			webviewPanel.webview.postMessage({
				type: 'config',
				...config,
			});
		};

		// Update function
		const updateView = async () => {
			let root: KeyVRoot;
			try { root = parseVdf(document.getText()); }
			catch { return; }

			const main = root.all()[0];
			if (!main || !(main instanceof KeyVSet)) return;

			const basetexture    = main.pair('$basetexture', null)?.string() ?? '';
			const bumpmap        = main.pair('$bumpmap',     null)?.string() ?? '';
			const bumpscale      = main.pair('$bumpscale',   null)?.float(null) ?? 1.0;
			const has_envmap     = !!main.pair('$envmap',      null)?.bool();
			const has_phong      = !!main.pair('$phong',       null)?.bool();
			const is_translucent = !!main.pair('$translucent', null)?.bool();
			const is_alphatest   = !!main.pair('$alphatest',   null)?.bool();
			const color          = parseColor(main.pair('$color',      null));
			const envmap_tint    = parseColor(main.pair('$envmaptint', null));
			const phong_boost    = main.pair('$phongboost',    null)?.float(null) ?? 1.0;
			const phong_exponent = main.pair('$phongexponent', null)?.float(null) ?? 30.0;
			const phong_exponent_texture = main.pair('$phongexponenttexture', null)?.string() ?? '';
		
			
			if (basetexture) sendImage('basetexture', await getImage(basetexture));
			if (bumpmap) sendImage('bumpmap', await getImage(bumpmap));
			const phong_exponent_texture_image = phong_exponent_texture ? getImageData(await getImage(phong_exponent_texture)) : null;

			sendConfig({
				envmap: has_envmap,
				envmapTint: envmap_tint.r,
				phong: has_phong,
				phongAmount: phong_boost,
				phongExponent: phong_exponent || phong_exponent_texture_image || 30.0,
				translucent: is_translucent ? 2 : (is_alphatest ? 1 : 0),
				tint: color,
				bumpScale: bumpscale,
			});
		};

		// Register document edit listener
		const updateListener = vscode.workspace.onDidChangeTextDocument((event) => {
			if (document !== event.document) return;
			updateView();
		});

		// Cleanup
		webviewPanel.onDidDispose(() => {
			updateListener.dispose();
		});

		// Initial render
		updateView();
	}
}
