import * as vscode from 'vscode';
import { Vtf, VImageData } from 'vtf-js';
import { getThumbMip } from 'vtf-js/dist/core/utils.js';

import { outConsole } from '../extension.js';
import { modFilesystem } from '../mod-mount.js';
import { KeyV, parse as parseVdf } from 'fast-vdf';
import { join } from 'path';
import EditorHTML from './browser.html';
import { HOST_PORT } from '../mod-server.js';

function vec3ToInt(r: Float32Array): number {
	const px = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
	return (px(r[0]) << 16)
		| (px(r[1]) << 8)
		| (px(r[2]));
}

export type ImageDataLike = {
	width: number;
	height: number;
	data: Uint8Array;
}

export type MatEntry = {
	name: string;
}

export type ServerMessage = {
	type: 'indexed';
	pageSize: number;
	pageCount: number;
	items: string[];
} | {
	type: 'loaded';
	page: number;
	tints: Uint32Array;
	thumbs: (ImageDataLike | undefined)[];
};

export type ClientMessage = {
	type: 'load';
	page: number;
} | {
	type: 'unload';
	page: number;
} | {
	type: 'set-range';
	page: number;
	lookAhead: number;
	lookBehind: number;
};

const enum PageState {
	Unloaded = 0,
	Loading,
	Loaded,
	Unloading,
}

class MaterialBrowserPage {
	/** Tints are memory-reserved even when the page is scrolled away from. */
	tints: Uint32Array;
	/** Vtf paths are memory-reserved even when the page is scrolled away from. */
	vtfPaths?: string[];
	/** Thumbs are unloaded after the page loses priority. This means that the files must be reloaded from disk! */
	thumbs?: (VImageData<Uint8Array> | undefined)[];

	private loadState = PageState.Unloaded;
	private stopLoading = false;

	constructor(
		public readonly vmtPaths: string[],
		public readonly thumbSize: number,
	) {
		this.tints = new Uint32Array(vmtPaths.length);
	}

	async loadFiles(force=false) {
		if (this.loadState === PageState.Loaded && !force)
			return;

		this.stopLoading = false;
		this.loadState = PageState.Loading;

		const decoder = new TextDecoder();
		this.thumbs = new Array(this.vmtPaths.length);

		await Promise.all(this.vmtPaths.map(async (vmtPath, vmtIdx) => {
			if (this.stopLoading) return;

			const kvBuffer = await modFilesystem.gfs.readFile(vmtPath, undefined, true);
			const kvStr = decoder.decode(kvBuffer);
			if (this.stopLoading) return;

			try {
				const out = parseVdf(kvStr);
				const rootKv = out.all()[0];

				if (rootKv instanceof KeyV) return;
				let vtfPath = rootKv.value('$basetexture', null);

				if (!vtfPath) return;
				if (this.stopLoading) return;

				vtfPath = join('materials', vtfPath);
				if (!vtfPath.endsWith('.vtf')) vtfPath += '.vtf';

				const vtfBuffer = await modFilesystem.gfs.readFile(vtfPath, undefined, true);
				if (!vtfBuffer) return;

				const vtf = await Vtf.decode(vtfBuffer.buffer as ArrayBuffer);
				this.tints[vmtIdx] = vec3ToInt(vtf.reflectivity);

				const mipCount = vtf.data.getMipmapCount();
				const [width, height] = vtf.data.getSize();

				const desiredMip = getThumbMip(width, height, this.thumbSize);
				if (desiredMip >= mipCount) return;

				const mipData = vtf.data.getImage(desiredMip, 0, 0, 0, false);
				this.thumbs![vmtIdx] = mipData.decode().coerce(Uint8Array);
			}
			catch (e) {
				this.tints[vmtIdx] = 0xff00ff;
			}

		}));

		this.loadState = PageState.Loaded;

		// If a stop was requested mid-load, delete the new buffer.
		if (this.stopLoading) {
			this.unloadFiles();
		}
	}

	unloadFiles() {
		if (this.loadState === PageState.Loaded) {
			delete this.thumbs;
			this.loadState = PageState.Unloaded;
		} else {
			this.stopLoading = true;
			this.loadState = PageState.Unloading;
		}
	}

	getThumbs() {
		return this.thumbs;
	}
}

export class MaterialBrowserManager {
	static current?: MaterialBrowserManager;
	static viewType = 'material-browser';
	static title = 'Material Browser';
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
		this.panel.webview.html = this.getHtml(panel.webview);
		this.panel.webview.onDidReceiveMessage(this.onMessage.bind(this));
		this.panel.onDidDispose(() => this.dispose());
	}

	static dispose() {
		this.current?.dispose();
		this.current = undefined;
	}

	dispose() {
		MaterialBrowserManager.current = undefined;
	}
	
	private pageList: MaterialBrowserPage[] = [];
	private pageSize = 8 * 8;
	private pathArray: string[] = [];

	getPageCount() {
		return Math.ceil(this.pathArray.length / this.pageSize);
	}

	/** SLOW! ONLY CALL THIS WHEN NECESSARY! */
	async fetchMaterialList() {
		if (!modFilesystem.isReady())
			return console.error('Attempted to open material browser without ready filesystem!');

		console.log('Starting...');
		console.time('fetch-material-list');

		const out: string[] = [];
		let searchedCount = 1;

		const walk = async (path: string) => {
			const dir = await modFilesystem.gfs.readDirectory(path);
			if (!dir) {
				console.log('Attempted to traverse to bad dir:', dir);
				return;
			}

			for (const [fname, ftype] of dir) {
				if (fname.startsWith('.')) {
					continue;
				}
				if (ftype === vscode.FileType.Directory) {
					await walk(path + '/' + fname);
					searchedCount++;
					continue;
				}
				if (ftype === vscode.FileType.File && fname.endsWith('.vmt')) {
					out.push(path + '/' + fname);
				}
			}
		};

		await walk('materials');
		console.log('Found', out.length, 'materials with', searchedCount, 'directories searched!');
		console.timeEnd('fetch-material-list');
		this.pathArray = out;

		console.time('make-page-list');

		const pageCount = this.getPageCount();
		this.pageList.length = pageCount;
		for (let i=0; i<pageCount; i++) {
			this.pageList[i] = new MaterialBrowserPage(this.getPagePaths(i), 64);
		}

		console.timeEnd('make-page-list');

		return this.pathArray;
	}

	getPagePaths(n: number): string[] {
		const start = n * this.pageSize;
		if (start >= this.pathArray.length) return [];
		return this.pathArray.slice(start, start + this.pageSize);
	}

	async reload() {
		await this.fetchMaterialList();
		console.log('Finished indexing!');

		this.sendMessage({
			type: 'indexed',
			items: this.pathArray,
			pageSize: this.pageSize,
			pageCount: this.pageList.length,
		});
	}

	sendMessage(ev: ServerMessage) {
		return this.panel.webview.postMessage(ev);
	}

	async onMessage(ev: ClientMessage) {
		if (ev.type === 'load') {
			const page = this.pageList[ev.page];
			await page.loadFiles();
			this.sendMessage({
				type: 'loaded',
				page: ev.page,
				thumbs: page.thumbs!,
				tints: page.tints!,
			});
		}
	}

	getHtml(view: vscode.Webview) {
		return EditorHTML
			.replaceAll('$ROOT$', view.asWebviewUri(this.context.extensionUri).toString())
			.replaceAll('$CSP$', view.cspSource)
			.replaceAll('$HOST_PORT$', HOST_PORT.toString());
	}

	// getHtml() {
	// 	const view = this.panel.webview;
	// 	const path = (path: string) => {
	// 		return view.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, path));
	// 	};

	// 	return `
	// 	<!DOCTYPE html>
	// 	<html lang="en">
	// 		<head>
	// 			<meta charset="UTF-8">
	// 			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${view.cspSource} data://*; style-src ${view.cspSource}; script-src ${view.cspSource};">
	// 			<meta name="viewport" content="width=device-width, initial-scale=1.0">
	// 			<link rel="stylesheet" href="${path('public/css/vmt-browser.css')}" />
	// 		</head>
	// 		<body>
	// 			<script src="${path('public/dist/vmt-browser.js')}"></script>
	// 		</body>
	// 	</html>
	// 	`;
	// }
}