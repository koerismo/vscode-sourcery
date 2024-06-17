import * as vscode from 'vscode';
import { Detail, DetailFile, DetailGroup, DetailProp, DetailMessage } from './detail-file.js';
import { parse as parseVdf, KeyVRoot, KeyV, KeyVSet } from 'fast-vdf';
import { outConsole } from '../extension.js';
import EditorHTML from './editor.html';


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
		const details: Detail[] = root.dir('detail').dirs().map(detail => {
			const groups: DetailGroup[] = detail.dirs().map(group => {
				const props: DetailProp[] = group.dirs().map(prop => {
					const kvs: Record<string, any> = {};
					prop.pairs().forEach(kv => kvs[kv.key] = kv.value);
					return {
						name: prop.key,
						...kvs
					} as DetailProp;
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
					// @ts-expect-error Shit
					for (const key in prop) KV.pair(key, prop[key]);
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


	static register(context: vscode.ExtensionContext) {
		const editor = new this(context);
		return vscode.window.registerCustomEditorProvider('sourcery.detail', editor, {
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: { enableFindWidget: false, retainContextWhenHidden: false }
		});
	}


	constructor(context: vscode.ExtensionContext) {
		this.context = context;
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
		const readyListener = webviewPanel.webview.onDidReceiveMessage(async msg => {
			readyListener.dispose();
			webviewPanel.webview.postMessage(<DetailMessage>{
				type: 'load',
				data: await document.read_kv(),
			});
		});
	}

	openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
		return new ValveDetailDocument(uri);
	}
}
