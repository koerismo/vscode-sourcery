import * as vscode from 'vscode';
import { MountServerManager, HOST_PORT } from '../mod-server.js';
import EditorHTML from './editor.html';

export class ValveMaterialEditorProvider implements vscode.CustomTextEditorProvider {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	static register(context: vscode.ExtensionContext) {
		const editor = new this(context);
		const register = vscode.window.registerCustomEditorProvider('sourcery.vmt', editor, {
			supportsMultipleEditorsPerDocument: true,
			webviewOptions: { enableFindWidget: false, retainContextWhenHidden: true }
		});

		return new vscode.Disposable(() => {
			editor.dispose();
			register.dispose();
		});
	}

	dispose() {
	}

	getHtml(view: vscode.Webview) {
		return EditorHTML
			.replaceAll('$ROOT$', view.asWebviewUri(this.context.extensionUri).toString())
			.replaceAll('$CSP$', view.cspSource)
			.replaceAll('$HOST_PORT$', HOST_PORT.toString());
	}
	
	async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {
		await MountServerManager.startup();

		webviewPanel.webview.options = {
			enableScripts: true,
			portMapping: [{ extensionHostPort: HOST_PORT, webviewPort: HOST_PORT }],
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'public')]
		};

		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);
	}
}
