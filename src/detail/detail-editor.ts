import * as vscode from 'vscode';
import { Detail, DetailFile, DetailGroup, DetailProp, DetailMessage, DetailKind, DetailSpriteSize, DetailSpriteBound } from './detail-file.js';
import { parse as parseVdf, KeyVRoot, KeyV, KeyVSet } from 'fast-vdf';
import { outConsole } from '../extension.js';
import { HOST_PORT, MountServerManager } from '../mod-server.js';
import EditorHTML from './editor.html';

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
		return filterNonNull(prop, ['amount', 'upright', 'minangle', 'maxangle', 'detailOrientation', 'sprite', 'spritesize', 'spriterandomscale', 'sway']);
	if (prop.kind === DetailKind.Shape)
		return filterNonNull(prop, ['amount', 'upright', 'minangle', 'maxangle', 'detailOrientation', 'sprite', 'spritesize', 'spriterandomscale', 'sway', 'sprite_shape', 'shape_size', 'shape_angle']);
	if (prop.kind === DetailKind.Model)
		return filterNonNull(prop, ['amount', 'upright', 'minangle', 'maxangle', 'detailOrientation', 'model', 'sway']);
	throw Error('Invalid kind '+prop.kind+' !');
}

function detectDetailType(prop: DetailProp): DetailKind {
	// https://github.com/ValveSoftware/source-sdk-2013/blob/0d8dceea4310fde5706b3ce1c70609d72a38efdf/mp/src/utils/vbsp/detailobjects.cpp#L135-L164
	if (prop.model !== undefined) return DetailKind.Model;
	if (prop.sprite_shape !== undefined) return DetailKind.Shape;
	return DetailKind.Sprite;
}

// Copy of "decodeBound" from frontend code
export function decodeSprite(bstr: string): DetailSpriteBound {
	const values = bstr.split(' ', 5).map(x => +x);
	if (values.length !== 5) throw Error('Failed to parse sprite! (Bad length)');
	if (!Object.values(values).every(x => !isNaN(x))) throw Error('Failed to parse sprite! (NaN)');
	const [x, y, w, h, imageWidth] = values;
	return {x, y, w, h, imageWidth};
}

// Copy of "decodeBound" from frontend code
export function decodeSpriteSize(bstr: string): DetailSpriteSize {
	const values = bstr.split(' ', 4).map(x => +x);
	if (values.length !== 4) throw Error('Failed to parse spritesize! (Bad length)');
	if (!Object.values(values).every(x => !isNaN(x))) throw Error('Failed to parse spritesize! (NaN)');
	const [x, y, w, h] = values;
	return {x, y, w, h};
}

export class ValveDetailDocument implements vscode.CustomDocument {
	uri: vscode.Uri;

	constructor(uri: vscode.Uri) {
		this.uri = uri;
	}

	dispose(): void {
	}

	async read_kv(): Promise<DetailFile> {
		const vdata = await vscode.workspace.fs.readFile(this.uri);
		const vroot = parseVdf(new TextDecoder().decode(vdata));
		const vfile = vroot.dir('detail', null) ?? new KeyVSet('detail');
	
		const dFile: DetailFile = { details: [] };

		for (const vDetail of vfile.dirs()) {
			const dDetail: Detail = {
				type: vDetail.key,
				density: vDetail.pair('density').float(1000),
				groups: [],
			};
			dFile.details.push(dDetail);

			for (const vGroup of vDetail.dirs()) {
				const dGroup: DetailGroup = {
					name: vGroup.key,
					alpha: vGroup.pair('alpha').float(1.0),
					props: [],
				};
				dDetail.groups.push(dGroup);

				for (const vProp of vGroup.dirs()) {
					const dProp: DetailProp = {
						name:              vProp.key,
						kind:              0, // REPLACED
						amount:            vProp.pair('amount').float(1.0),
						minangle:          vProp.pair('minangle', null)?.float(),
						maxangle:          vProp.pair('maxangle', null)?.float(),
						sprite:            decodeSprite(vProp.value('sprite')),
						spritesize:        decodeSpriteSize(vProp.value('spritesize')),
						spriterandomscale: vProp.pair('spriterandomscale', null)?.float(),
						sway:              vProp.pair('sway', null)?.float(),
						sprite_shape:      <'tri'|'cross'>vProp.value('sprite_shape', null),
						shape_size:        vProp.pair('shape_size', null)?.float(),
						shape_angle:       vProp.pair('shape_angle', null)?.float(),
						detailOrientation: vProp.pair('detailOrientation', null)?.int(),
					};

					// Set kind based on detected type
					dProp.kind = detectDetailType(dProp);
					dGroup.props.push(dProp);
				}
			}
		}

		return dFile;
	}

	async write_kv(file: DetailFile) {
		const root = new KeyVRoot();
		const KV = root.factory();
		KV.dir('detail');
		for (const detail of file.details) {
			KV.dir(detail.type);
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
			.replaceAll('$CSP$', view.cspSource)
			.replaceAll('$HOST_PORT$', HOST_PORT.toString());
	}

	async resolveCustomEditor(document: ValveDetailDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
		// Make sure content server is live
		await MountServerManager.startup();
		
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

		this.askListener = webviewPanel.webview.onDidReceiveMessage(async (msg: DetailMessage) => {
			if (msg.type === 'markDirty') {
				this._onDidChangeCustomDocument.fire({ document });
				return;
			}
			
			if (msg.type === 'ask') {
				const for_mat = msg.kind === 'material';
				
				let files = await vscode.window.showOpenDialog({
					defaultUri: vscode.Uri.from({ scheme: 'mod', path: for_mat ? '/materials' : '/models' }),
					filters: for_mat ? { 'Materials': ['vmt'] } : { 'Models': ['mdl'] }
				});

				if (!files || !files.length || files[0].scheme !== 'mod') {
					return webviewPanel.webview.postMessage(<DetailMessage>{
						type: 'ask',
						data: null
					});
				}

				return webviewPanel.webview.postMessage(<DetailMessage>{
					type: 'ask',
					kind: msg.kind,
					data: files[0].path
				});

			}
		});
	}

	openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
		return new ValveDetailDocument(uri);
	}
}
