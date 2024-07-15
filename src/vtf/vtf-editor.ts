import * as vscode from 'vscode';
import { VFormats, Vtf } from 'vtf-js';
import { HOST_PORT } from '../mod-server.js';
import EditorHTML from './editor.html';

export class ValveTextureDocument implements vscode.CustomDocument {
	uri: vscode.Uri;
	cache: Vtf|null = null;

	constructor(uri: vscode.Uri) {
		this.uri = uri;
	}

	dispose(): void {
	}

	async getVtf(allow_cache=true) {
		if (allow_cache && this.cache !== null) return this.cache;
		const data = await vscode.workspace.fs.readFile(this.uri);
		return (this.cache = Vtf.decode(data));
	}
}

export class ValveTextureEditorProvider implements vscode.CustomReadonlyEditorProvider {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	static register(context: vscode.ExtensionContext) {
		const editor = new this(context);
		return vscode.window.registerCustomEditorProvider('sourcery.vtf', editor, {
			supportsMultipleEditorsPerDocument: true,
			webviewOptions: { enableFindWidget: false, retainContextWhenHidden: true }
		});
	}
	
	// onDidChangeCustomDocument: vscode.Event<vscode.CustomDocumentEditEvent<vscode.CustomDocument>> | vscode.Event<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>>;
	private _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>>();
	get onDidChangeCustomDocument(): vscode.Event<vscode.CustomDocumentContentChangeEvent<vscode.CustomDocument>> {
		return this._onDidChangeCustomDocument.event;
	}

	openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
		return new ValveTextureDocument(uri);
	}

	getHtml(view: vscode.Webview) {
		return EditorHTML
			.replaceAll('$ROOT$', view.asWebviewUri(this.context.extensionUri).toString())
			.replaceAll('$CSP$', view.cspSource)
			.replaceAll('$HOST_PORT$', HOST_PORT.toString());
	}
	
	async resolveCustomEditor(document: ValveTextureDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {

		webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'public')] };
		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

		try {
			const vtf = await document.getVtf();
			const image = vtf.data.getImage(0, 0, 0, 0);
			webviewPanel.webview.postMessage({
				type: 'update',
				width: image.width,
				height: image.height,
				data: image.data,
				version: vtf.version,
				format: VFormats[vtf.format],
				mipmaps: vtf.data.mipmapCount(),
				frames: vtf.data.frameCount(),
				faces: vtf.data.faceCount(),
				slices: vtf.data.sliceCount(),
			});
		}
		catch(e) {
			webviewPanel.webview.postMessage({ type: 'error', message: 'Failed to load Vtf! '+e });	
		}
	}
}
