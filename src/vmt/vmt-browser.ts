import * as vscode from 'vscode';

import { Vtf, VImageData } from 'vtf-js';
import { linearToSrgb } from 'vtf-js/dist/core/utils.js';
import { join } from 'path/posix';

import { getThumbMip } from 'vtf-js/dist/core/utils.js';
import { modFilesystem } from '../mod-mount.js';
import { HOST_PORT } from '../mod-server.js';
import { ParsedVmt } from './vmt-parser.js';

import EditorHTML from './browser.html';

function vec3ToInt(r: ArrayLike<number>): number {
	const px = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
	return (px(r[0]) << 16)
		| (px(r[1]) << 8)
		| (px(r[2]));
}

function makeHexColor(r: ArrayLike<number>): number {
	return vec3ToInt([
		linearToSrgb(r[0]),
		linearToSrgb(r[1]),
		linearToSrgb(r[2]),
	]);
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
} | {
	type: 'unloaded';
	page: number;
};

export type ClientMessage = {
	type: 'index';
} | {
	type: 'load';
	page: number;
} | {
	type: 'unload';
	page: number;
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
		if (!this.vtfPaths) this.vtfPaths = new Array(this.vmtPaths.length);

		for (let vmtIdx=0; vmtIdx<this.vmtPaths.length; vmtIdx++) {
			if (this.stopLoading) break;
			this.tints[vmtIdx] = 0x000000;

			let vtfPath: string | undefined = this.vtfPaths[vmtIdx];
			if (!vtfPath) {
				const vmtPath = this.vmtPaths[vmtIdx];
				const kvBuffer = await modFilesystem.gfs.readFile(vmtPath);
				const kvStr = decoder.decode(kvBuffer);

				const rootKv = ParsedVmt.parse(kvStr);
				vtfPath =
					rootKv.value('%tooltexture') ||
					rootKv.value('$basetexture') ||
					rootKv.value('$flowmap') ||
					rootKv.value('$bumpmap');

				if (!vtfPath) continue;
				vtfPath = join('materials', vtfPath.toLowerCase().replaceAll('\\', '/')) as string;
				if (!vtfPath.endsWith('.vtf')) vtfPath += '.vtf';
				this.vtfPaths[vmtIdx] = vtfPath;
			}

			const vtfBuffer = await modFilesystem.gfs.readFile(vtfPath);
			if (!vtfBuffer) continue;

			try {
				const vtf = await Vtf.decode(vtfBuffer.buffer as ArrayBuffer, { noClone: true });
				this.tints[vmtIdx] = makeHexColor(vtf.reflectivity);

				const mipCount = vtf.data.getMipmapCount();
				const [width, height] = vtf.data.getSize();

				const desiredMip = getThumbMip(width, height, this.thumbSize);
				if (desiredMip >= mipCount) continue;
				if (this.stopLoading) break;

				const mipData = vtf.data.getImage(Math.max(0, desiredMip), 0, 0, 0, false);
				this.thumbs![vmtIdx] = mipData.decode().coerce(Uint8Array);
				if (this.thumbs![vmtIdx]?.data.buffer === vtfBuffer.buffer) throw 'whoops!';
			}
			catch (e) {
				this.tints[vmtIdx] = 0xff00ff;
			}
		}

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

	isLoaded() {
		return this.loadState === PageState.Loaded;
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

		this.panel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'public'),
				vscode.Uri.joinPath(this.context.extensionUri, 'public'),
			]
		};

		this.panel.webview.html = this.getHtml(panel.webview);
		this.panel.webview.onDidReceiveMessage(this.onMessage.bind(this));
		this.panel.onDidDispose(() => this.dispose());
	}

	static dispose() {
		this.current?.dispose();
		this.current = undefined;
	}

	dispose() {
		for (const page of this.pageList) {
			page.unloadFiles();
		}
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
			if (path === '/materials/models') return;
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

		await walk('/materials');
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

	rollingUnloadPos = 0;
	rollingUnload = new Array<number>(16);

	getUnloadRequired(newId: number): number | undefined {
		this.rollingUnload[this.rollingUnloadPos] = newId;
		this.rollingUnloadPos = (this.rollingUnloadPos + 1) % this.rollingUnload.length;
		return this.rollingUnload[this.rollingUnloadPos];
	}

	getLoadedPageCount() {
		let accum = 0;
		for (const page of this.pageList)
			accum += +page.isLoaded();
		return accum;
	}

	async onMessage(ev: ClientMessage) {
		if (ev.type === 'load') {
			const toUnload = this.getUnloadRequired(ev.page);
			if (toUnload !== undefined) {
				const page = this.pageList[toUnload];
				page.unloadFiles();
				console.log('Unloading', toUnload);
			}

			console.log('Loading', ev.page, '...');
			const page = this.pageList[ev.page];

			await page.loadFiles();
			if (page.isLoaded()) {
				this.sendMessage({
					type: 'loaded',
					page: ev.page,
					thumbs: page.thumbs!,
					tints: page.tints!,
				});
			} else {
				console.log('Cancelled', ev.page);
				this.sendMessage({
					type: 'unloaded',
					page: ev.page,
				});
			}

			console.log('Count:', this.getLoadedPageCount());
			return;
		}

		// if (ev.type === 'unload') {
		// 	console.log('Unloading', ev.page);
		// 	const page = this.pageList[ev.page];
		// 	page.unloadFiles();
		// 	console.log('Count:', this.getLoadedPageCount());
		// 	return;
		// }
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