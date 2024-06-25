import * as vscode from 'vscode';
import { Detail, DetailFile, DetailGroup, DetailProp, DetailMessage, DetailKind } from './detail-file.js';
import { parse as parseVdf, KeyVRoot, KeyV, KeyVSet } from 'fast-vdf';
import { outConsole } from '../extension.js';
import EditorHTML from './editor.html';
import * as assert from 'assert';
import Vtf from 'vtf-js';

const RE_SLASH = /(\/|\\)+/g;
function normalizePath(path: string) {
	path =  ('/materials/' + path).replace(RE_SLASH, '/').toLowerCase();
	if (!path.endsWith('.vtf')) path += '.vtf';
	return path;
}

function filterNonNull<T>(dict: T, keys?: (keyof T)[]): T {
	const out: any = {};
	const d = dict as any;
	if (keys) {
		for (const key of keys) {
			if (d[key] !== undefined) out[key] = d[key];
		}
	}
	else {
		for (const key in dict) {
			if (d[key] !== undefined) out[key] = d[key];
		}
	}
	return out;
}

function filterDetail(prop: DetailProp): DetailProp {
	if (prop.kind === DetailKind.Sprite)
		return filterNonNull(prop, ['amount', 'upright', 'minangle', 'maxangle', 'sprite', 'spritesize', 'spriterandomscale', 'sway', 'detailOrientation']);
	if (prop.kind === DetailKind.Shape)
		return filterNonNull(prop, ['amount', 'upright', 'minangle', 'maxangle', 'sprite', 'spritesize', 'spriterandomscale', 'sway', 'sprite_shape', 'shape_size', 'shape_angle']);
	if (prop.kind === DetailKind.Model)
		return filterNonNull(prop, ['amount', 'upright', 'minangle', 'maxangle', 'model', 'sway']);
	throw Error('Invalid kind '+prop.kind+' !');
}

function detectDetailType(prop: DetailProp): DetailKind {
	if (prop.detailOrientation !== undefined) return DetailKind.Sprite;
	if (prop.sprite_shape !== undefined) return DetailKind.Shape;
	if (prop.model !== undefined) return DetailKind.Model;
	return DetailKind.Sprite;
}

export class ValveDetailDocument implements vscode.CustomDocument {
	uri: vscode.Uri;
	info: DetailFile|null = null;

	constructor(uri: vscode.Uri) {
		this.uri = uri;
	}

	dispose(): void {
	}

	async read_kv(): Promise<DetailFile> {
		const data = await vscode.workspace.fs.readFile(this.uri);
		const text = new TextDecoder().decode(data);
		const root = parseVdf(text);
		let detailRoot = root.dir('detail', null);
		if (!detailRoot) return { details: [] };

		const details: Detail[] = detailRoot.dirs().map(detail => {
			const groups: DetailGroup[] = detail.dirs().map(group => {
				const props: DetailProp[] = group.dirs().map(prop => {
					const kvs: Record<string, any> = {};
					prop.pairs().forEach(kv => {
						if (kv.key === 'sprite') {
							const [x, y, w, h, imageWidth] = kv.value.split(' ').map(x => +x);
							kvs[kv.key] = {x, y, w, h, imageWidth};
						} else if (kv.key === 'spritesize') {
							const [x, y, w, h] = kv.value.split(' ').map(x => +x);
							kvs[kv.key] = {x, y, w, h};
						} else {
							kvs[kv.key] = kv.value;
						}
					});

					const propBase = { name: prop.key, ...kvs } as DetailProp;
					propBase.kind = detectDetailType(propBase);
					return propBase;
				});

				return {
					name: group.key,
					alpha: group.pair('alpha').float(),
					props: props
				};
			});

			return {
				texture: detail.key,
				density: detail.pair('density').float(),
				groups: groups
			};
		});

		return { details };
	}

	async write_kv(file: DetailFile) {
		const root = new KeyVRoot();
		const KV = root.factory();
		KV.dir('detail');
		for (const detail of file.details) {
			KV.dir(detail.texture);
			KV.pair('density', detail.density);
			for (const group of detail.groups) {
				KV.dir(group.name);
				KV.pair('alpha', group.alpha);
				for (const prop of group.props) {
					KV.dir(prop.name);

					// Keep only the relevant keys.
					const filtered = filterDetail(prop);

					for (const key in filtered) {
						if (key === 'sprite') {
							const {x, y, w, h, imageWidth} = prop[key];
							KV.pair(key, [x, y, w, h, imageWidth].join(' '));
						} else if (key === 'spritesize') {
							const {x, y, w, h} = prop[key];
							KV.pair(key, [x, y, w, h].join(' '));
						} else {
							// @ts-expect-error Shit
							KV.pair(key, filtered[key]);
						}
					}
					KV.back();
				}
				KV.back();
			}
			KV.back();
		}
		KV.back();
		KV.exit();
		const text = root.dump({ quote: 'auto' });
		const buf = new TextEncoder().encode(text);
		vscode.workspace.fs.writeFile(this.uri, buf);
	}
}

export class ValveDetailEditorProvider implements vscode.CustomEditorProvider {
	private readonly context: vscode.ExtensionContext;
	private sessions: Record<string, vscode.WebviewPanel> = {};
	private askListener?: vscode.Disposable;

	static register(context: vscode.ExtensionContext) {
		const editor = new this(context);
		const commandDisposable = vscode.window.registerCustomEditorProvider('sourcery.detail', editor, {
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: { enableFindWidget: false, retainContextWhenHidden: true }
		});

		return new vscode.Disposable(() => {
			editor.dispose();
			commandDisposable.dispose();
		});
	}

	
	
	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	dispose() {
		this.askListener?.dispose();
	}
	
	// onDidChangeCustomDocument: vscode.Event<vscode.CustomDocumentEditEvent<vscode.CustomDocument>> | vscode.Event<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>>;
	private _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>>();
	get onDidChangeCustomDocument(): vscode.Event<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>> {
		return this._onDidChangeCustomDocument.event;
	}
	
	saveCustomDocument(document: ValveDetailDocument, cancellation: vscode.CancellationToken): Promise<void> {
		const webviewPanel = this.sessions[document.uri.path];
		return new Promise((resolve, reject) => {
			const listener = webviewPanel.webview.onDidReceiveMessage((msg: DetailMessage) => {
				if (msg.type !== 'save') return;
				if (msg.error) return reject(msg.error);
				if (!msg.data) {
					outConsole.error('No data returned from webview!!! WTF?');
					reject('No data returned from webview!!! WTF?');
					return;
				}
				document.write_kv(msg.data);
				listener.dispose();
				resolve();
			});
			webviewPanel.webview.postMessage(<DetailMessage>{ type: 'save' });
		});
	}

	saveCustomDocumentAs(document: ValveDetailDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		document.uri = destination;
		return this.saveCustomDocument(document, cancellation);
	}

	revertCustomDocument(document: ValveDetailDocument, cancellation: vscode.CancellationToken): Promise<void> {
		throw new Error('Method not implemented.');
	}

	backupCustomDocument(document: ValveDetailDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		throw new Error('Method not implemented.');
	}

	getHtml(view: vscode.Webview) {
		return EditorHTML
			.replaceAll('$ROOT$', view.asWebviewUri(this.context.extensionUri).toString())
			.replaceAll('$CSP$', view.cspSource);
	}

	async resolveCustomEditor(document: ValveDetailDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
		webviewPanel.webview.options = {
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'public'),
				vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
			],
			enableScripts: true
		};

		// Save session for later message IO
		this.sessions[document.uri.path] = webviewPanel;

		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);
		const readyListener = webviewPanel.webview.onDidReceiveMessage(async (msg: DetailMessage) => {
			readyListener.dispose();
			webviewPanel.webview.postMessage(<DetailMessage>{
				type: 'load',
				data: await document.read_kv(),
			});
		});

		let hasAskedBefore = false;
		this.askListener = webviewPanel.webview.onDidReceiveMessage(async (msg: DetailMessage) => {
			if (msg.type === 'markDirty') {
				this._onDidChangeCustomDocument.fire({ document });
				return;
			}
			
			if (msg.type === 'ask') {
				assert(msg.kind === 'material');
				
				let files; // TODO: BAD!!!

				//TODO: THIS IS A HACK!!!! REPLACE THIS WHEN THE VIEWPORT IS IMPLEMENTED!
				//ON FIRST ASK, THE HOST WILL RESPOND WITH THE DEFAULT TEXTURE.
				if (!hasAskedBefore) {
					files = [vscode.Uri.from({ scheme: 'mod', path: '/materials/detail/detailsprites.vmt' })];
					hasAskedBefore = true;
				}
				else {
					files = await vscode.window.showOpenDialog({
						defaultUri: vscode.Uri.from({ scheme: 'mod', path: '/materials' }),
						filters: { 'Materials': ['vmt'] }
					});
	
					if (!files || !files.length || files[0].scheme !== 'mod') {
						return webviewPanel.webview.postMessage(<DetailMessage>{
							type: 'ask',
							data: null
						});
					}
				}

				try {
					const matString = new TextDecoder().decode((await vscode.workspace.fs.readFile(files[0])).buffer);
					const matKV = parseVdf(matString);
					const rootDir = matKV.dirs()[0];
					assert(rootDir !== undefined);
					const basetexPath = normalizePath(rootDir.value('$basetexture'));

					const texFile = await vscode.workspace.fs.readFile(vscode.Uri.from({ scheme: 'mod', path: basetexPath }));
					const decoded = Vtf.decode(texFile.buffer);
					const imData = decoded.data.getImage(0, 0, 0, 0).convert(Uint8Array);
					return webviewPanel.webview.postMessage(<DetailMessage>{
						type: 'ask',
						kind: 'material',
						data: [files[0].path, imData]
					});
				}
				catch (e) {
					outConsole.error(e);
					return webviewPanel.webview.postMessage(<DetailMessage>{
						type: 'ask',
						data: null
					});
				}
			}
		});
	}

	openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
		return new ValveDetailDocument(uri);
	}
}
