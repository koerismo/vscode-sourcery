import * as vscode from 'vscode';
import { MdlInfo, readInfo, writeInfo } from './mdl-io.js';
import { outConsole } from '../extension.js';
import { HOST_PORT } from '../mod-server.js';
import EditorHTML from './editor.html';

export class ValveModelDocument implements vscode.CustomDocument {
	uri: vscode.Uri;
	info: MdlInfo|null = null;

	constructor(uri: vscode.Uri) {
		this.uri = uri;
	}

	dispose(): void {
	}

	async getInfo(allow_cache=true) {
		if (allow_cache && this.info !== null) return this.info;
		const data = await vscode.workspace.fs.readFile(this.uri);
		return (this.info = readInfo(data));
	}
}

export class ValveModelEditorProvider implements vscode.CustomReadonlyEditorProvider {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	static register(context: vscode.ExtensionContext) {
		const editor = new this(context);
		return vscode.window.registerCustomEditorProvider('sourcery.mdl', editor, {
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: { enableFindWidget: false, retainContextWhenHidden: false }
		});
	}
	
	// onDidChangeCustomDocument: vscode.Event<vscode.CustomDocumentEditEvent<vscode.CustomDocument>> | vscode.Event<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>>;
	private _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>>();
	get onDidChangeCustomDocument(): vscode.Event<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>> {
		return this._onDidChangeCustomDocument.event;
	}

	openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
		return new ValveModelDocument(uri);
	}

	getHtml(view: vscode.Webview) {
		const path = (path: string) => {
			return view.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, path));
		};

		return EditorHTML
			.replaceAll('$ROOT$', view.asWebviewUri(this.context.extensionUri).toString())
			.replaceAll('$CSP$', view.cspSource)
			.replaceAll('$HOST_PORT$', HOST_PORT.toString());
	}
	
	async resolveCustomEditor(document: ValveModelDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {

		webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'public')] };
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(event => {
			outConsole.log('Trying to update mdl!!', event);
		});

		setTimeout(async () => {
			try {
				const info = await document.getInfo();
				webviewPanel.webview.postMessage({ type: 'update', data: info });
			}
			catch(error) {
				webviewPanel.webview.postMessage({ type: 'error', error: error });	
			}
		}, 50);
	}
}
