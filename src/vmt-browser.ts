import * as vscode from 'vscode';
import { vpkFileSystemProvider } from './vpk-provider';
import { Vtf, VImageData } from 'vtf-js';
import { outConsole } from './extension';

// function *walkFileSystem(root: string): Generator<string> {
// 	for (const provider of modFilesystem.gfs.providers) {
// 		if (provider instanceof VpkSystem) {
// 			for (const filename in provider.files) {
// 				if (filename.startsWith(root)) yield filename;
// 			}
// 		}
// 	}
// }

export class MaterialBrowserManager {
	static current?: MaterialBrowserManager;
	static viewType = 'material-browser';
	static title = 'Texture Browser';
	static context: vscode.ExtensionContext;

	private panel: vscode.WebviewPanel;
	private context: vscode.ExtensionContext;

	public static show() {
		if (!this.current) {
			const panel = vscode.window.createWebviewPanel(this.viewType, this.title, vscode.ViewColumn.Beside);
			this.current = new this(panel, this.context);
		}
		else {
			this.current.panel.reveal();
		}

		this.current.reload();
		return this.current;
	}

	public static register(context: vscode.ExtensionContext) {
		this.context = context;
		return this;
	}

	constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
		this.panel = panel;
		this.context = context;

		this.panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'public')] };
		this.panel.webview.html = this.getHtml();
		this.panel.onDidDispose(() => this.dispose());
	}

	static dispose() {
		this.current?.dispose();
		this.current = undefined;
	}

	dispose() {
		MaterialBrowserManager.current = undefined;
	}

	async reload() {
		this.panel.webview.postMessage({ type: 'setup', count: 2000 });
		
		let index = 0;
		// let timeout: number|undefined;
		const updates: Promise<VImageData>[] = [];
		
		x: for (const key in vpkFileSystemProvider.cache) {
			const vpk = vpkFileSystemProvider.cache[key];
			for (const filename in vpk.files) {
				if (!filename.endsWith('.vtf')) continue;
				const data = await vpk.readFile(filename);
				if (!data) continue;

				try {
					const vtf = Vtf.decode(data.buffer, false, true);
					const [width, height] = vtf.data.getSize(0, 0, 0, 0);
					const image = vtf.data.getImage(+(width >= 1024) + +(width >= 512) + +(width >= 256), 0, 0, 0);
					this.panel.webview.postMessage({ type: 'update', data: { data: image.data, width: image.width, height: image.height }, index: index });
					index ++;
					if (index > 2000) break x;
				}
				catch(e) {
					outConsole.log('Failed to read vtf', e);
				}
			}
		}
	}

	getHtml() {
		const view = this.panel.webview;
		const path = (path: string) => {
			return view.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, path));
		};

		return `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${view.cspSource} data://*; style-src ${view.cspSource}; script-src ${view.cspSource};">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link rel="stylesheet" href="${path('public/css/vmt-browser.css')}" />
			</head>
			<body>
				<script src="${path('public/dist/vmt-browser.js')}"></script>
			</body>
		</html>
		`;
	}
}