import * as vscode from 'vscode';
import { VImageData, Vtf } from 'vtf-js';
import { KeyVRoot, KeyVSet, parse as parseVdf } from 'fast-vdf';
import { ValveTextureDocument } from './vtf-editor';

const RE_SLASH = /(\/|\\)+/g;

function getImagePath(value: string) {
	let path = ('materials/' + value).replace(RE_SLASH, '/') + '.vtf';
	return vscode.Uri.from({ scheme: 'game', path });
}

async function getImage(value: string) {
	const uri = getImagePath(value);
	const document = new ValveTextureDocument(uri);
	return (await document.getVtf()).data.getImage(0, 0, 0, 0);
}

function parseVec(vec: string, size=3): number[] {
	if (typeof vec !== 'string') return new Array<number>(size).fill(+vec);
	return vec.slice(1, -1).split(' ').map(x => +x);
}

function toHexColor(r: number, g: number, b: number) {
	// const fixHex = (v: number) => ('00'+v.toString(16)).slice(-2);
	return ((r << 16) + (g << 8) + b);
}

function vecToHexColor(vec: number[]) {
	return toHexColor(Math.round(vec[0] * 255), Math.round(vec[1] * 255), Math.round(vec[2] * 255));
}

function getImageData(vimage: VImageData) {
	return { width: vimage.width, height: vimage.height, data: vimage.convert(Uint8Array).data };
}

interface ConfigUpdate {
	translucent: 0|1|2,
	envmap: boolean,
	envmapTint: number,
	phong: boolean,
	phongAmount: number,
	tint: number,
	phongTint: number,
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

			const basetexture = main.value('$basetexture', null) as string;
			const bumpmap = main.value('$bumpmap', null) as string;
			const bumpscale = main.value('$bumpscale', 1.0, 'number');
			const has_envmap = !!main.value('$envmap', false);
			const has_phong = !!main.value('$phong', false);
			const is_translucent = !!main.value('$translucent', false);
			const is_alphatest = !!main.value('$alphatest', false);
			const color = parseVec(main.value('$color', "1.0") as string);
			const envmap_tint = parseVec(main.value('$envmaptint', "1.0") as string);
			const phong_boost = +main.value('$phongboost', 1.0);
			const phong_exponent = +main.value('$phongexponent', 30.0);
			const phong_exponent_texture = main.value('$phongexponenttexture', null, 'string');
		
			
			if (basetexture) sendImage('basetexture', await getImage(basetexture));
			if (bumpmap) sendImage('bumpmap', await getImage(bumpmap));
			const phong_exponent_texture_image = phong_exponent_texture ? getImageData(await getImage(phong_exponent_texture)) : null;

			sendConfig({
				envmap: has_envmap,
				envmapTint: envmap_tint[0],
				phong: has_phong,
				phongAmount: phong_boost,
				phongTint: 0xffffff,
				phongExponent: phong_exponent || phong_exponent_texture_image || 30.0,
				translucent: is_translucent ? 2 : (is_alphatest ? 1 : 0),
				tint: vecToHexColor(color),
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
