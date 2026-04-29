import * as vscode from 'vscode';
import { outConsole } from '../../../extension.js';
import { HOST_PORT, HOST_AUTH } from '../../../mod-server.js';
import { EditorMeta } from '../../shared/meta.js';
import HtmlShell from './shell.html';

export function hashUri(uri: vscode.Uri): string {
	return uri.scheme + '\x01' + uri.authority + '\x01' + uri.path;
}

export interface BaseSessionContext {
	webviewPanel: vscode.WebviewPanel;
}

export interface BaseCustomDocument extends vscode.CustomDocument {
	decode(data: Uint8Array): Thenable<void>;
	encode(cancelToken: vscode.CancellationToken): Thenable<Uint8Array>;
}

export class CommonEditorProvider<
	EditorDocument extends BaseCustomDocument = BaseCustomDocument,
	SessionContext extends BaseSessionContext = BaseSessionContext,
	ServerMsg = {},
	ClientMsg = {},
>
	implements vscode.CustomEditorProvider<EditorDocument>
{
	public static currentProvider: CommonEditorProvider;

	static register(
		context: vscode.ExtensionContext,
		viewTypeId: string,
		options?: vscode.WebviewPanelOptions,
	) {
		if (this.currentProvider)
			outConsole.warn(
				`Registering ${this.constructor.name} panel twice! Tag a programmer!`,
			);

		this.currentProvider = new this(context);

		const commandDisposable = vscode.window.registerCustomEditorProvider(
			viewTypeId,
			this.currentProvider,
			{
				supportsMultipleEditorsPerDocument: false,
				webviewOptions: options,
			},
		);

		return new vscode.Disposable(() => {
			this.currentProvider.dispose();
			commandDisposable.dispose();
		});
	}

	protected readonly context: vscode.ExtensionContext;
	protected sessions: Record<string, SessionContext> = {};

	readonly _onDidChangeCustomDocumentEmitter = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<EditorDocument>>();
	readonly onDidChangeCustomDocument = this._onDidChangeCustomDocumentEmitter.event;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	dispose() {
		for (const k in this.sessions)
			this.sessions[k].webviewPanel.dispose();
	}

	getSession(uri: vscode.Uri): SessionContext | undefined {
		const sid = uri.toString(true);
		if (sid in this.sessions) return this.sessions[sid];
	}

	initSession(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
		this.sessions[hashUri(uri)] = { webviewPanel } as SessionContext;
	}

	clearSession(uri: vscode.Uri) {
		const sid = uri.toString(true);
		if (!(sid in this.sessions)) throw `Attempted to clear nonexistent session ${uri.toString(true)}`;
		delete this.sessions[sid];
	}

	sendMessage(uri: vscode.Uri, msg: ServerMsg) {
		const session = this.getSession(uri);
		if (!session) throw `Attempted to send message to nonexistent session ${uri.toString(true)}`;
		return session.webviewPanel.webview.postMessage(msg);
	}

	onMessage(uri: vscode.Uri, msg: ClientMsg) {
		throw 'not implemented!';
	}

	getHtml(view: vscode.Webview, html?: string) {
		if (!html) throw 'getHtml should be overridden!';

		const editorMeta: EditorMeta = {
			authorization: HOST_AUTH,
			port: HOST_PORT.toString(),
			root: view.asWebviewUri(this.context.extensionUri).toString(),
		};

		return HtmlShell
			.replaceAll('$META$', JSON.stringify(editorMeta))
			.replaceAll('$ROOT$', editorMeta.root)
			.replaceAll('$CSP$', view.cspSource)
			.replaceAll('$HOST_PORT$', HOST_PORT.toString())
			.replace('$BODY$', html);
	}

	async resolveCustomEditor(
		document: EditorDocument,
		webviewPanel: vscode.WebviewPanel,
		token: vscode.CancellationToken,
	): Promise<void> {

		webviewPanel.webview.options = {
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'dist/public'),
				vscode.Uri.joinPath(this.context.extensionUri, 'public'),
			],
			enableScripts: true,
		};

		this.initSession(document.uri, webviewPanel);
		webviewPanel.onDidDispose(() => {
			this.clearSession(document.uri);
		});

		webviewPanel.webview.onDidReceiveMessage(msg => {
			this.onMessage(document.uri, msg);
		});

		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);
	}

	openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Thenable<EditorDocument> {
		throw 'openCustomDocument not implemented!';
	}

	saveCustomDocument(document: EditorDocument, cancelToken: vscode.CancellationToken): Thenable<void> {
		throw 'saveCustomDocument not implemented!';
	}

	saveCustomDocumentAs(document: EditorDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		throw 'saveCustomDocumentAs not implemented!';
	}

	backupCustomDocument(document: EditorDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		throw 'backupCustomDocument not implemented!';
	}

	revertCustomDocument(document: EditorDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw 'revertCustomDocument not implemented!';
	}
}
