import * as vscode from 'vscode';
import { Detail, DetailFile, DetailGroup, DetailProp } from './detail-file.js';
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
					return kvs as DetailProp;
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
		const KV = new KeyVRoot().factory();
		KV.dir('detail');
		for (const detail of file.details) {
			KV.dir(detail.texture);
			KV.pair('density', detail.density);
			for (const group of detail.groups) {
				KV.dir(group.name);
				KV.pair('alpha', group.alpha);
				for (const prop of group.props) {
					// @ts-expect-error Shit
					for (const key in prop) KV.pair(key, prop[key]);
				}
			}
		}
	}
}

export class ValveDetailEditorProvider implements vscode.CustomEditorProvider {
	private readonly context: vscode.ExtensionContext;


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
	
	saveCustomDocument(document: vscode.CustomDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}

	saveCustomDocumentAs(document: vscode.CustomDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}

	revertCustomDocument(document: vscode.CustomDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}

	backupCustomDocument(document: vscode.CustomDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		throw new Error('Method not implemented.');
	}

	getHtml(view: vscode.Webview) {
		return EditorHTML
			.replaceAll('$ROOT$', view.asWebviewUri(this.context.extensionUri).toString())
			.replaceAll('$CSP$', view.cspSource);
	}

	resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void | Thenable<void> {
		webviewPanel.webview.options = {
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'public'),
				vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
			],
			enableScripts: true
		};

		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);
	}

	openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
		return new ValveDetailDocument(uri);
	}
}
