import * as vscode from 'vscode';

import { getSchemaCompletionsForNode, validateDocument } from './kv-schema-validator.js';
import type { JSONSchema4 } from 'json-schema';
import { keyValuesCache, KVAnyRanged } from './kv-document.js';
// import { outConsole } from '../extension.js';

const SCHEMA_ERRORS = vscode.languages.createDiagnosticCollection('kv-schema');

export class KeyValuesSchemaHandler {

	static schemaTemp?: JSONSchema4 | Promise<JSONSchema4>;
	static schemaPath?: vscode.Uri;

	static register(ctx: vscode.ExtensionContext): vscode.Disposable {
		this.schemaPath = ctx.extensionUri.with({ path: ctx.extensionUri.path + '/schemas/proxies.schema.json' });
		const onDocumentClosed = vscode.workspace.onDidCloseTextDocument(this.onDocumentClosed.bind(this));

		return new vscode.Disposable(() => {
			onDocumentClosed.dispose();
			this.dispose();
		});
	}

	static onDocumentClosed(document: vscode.TextDocument) {
		SCHEMA_ERRORS.set(document.uri, undefined);
	}

	static async getSchema(uri: vscode.Uri): Promise<JSONSchema4 | undefined> {
		if (this.schemaTemp) return (this.schemaTemp = await this.schemaTemp);
		if (!this.schemaPath) return;

		this.schemaTemp = (async () => {
			try {
				const buf = await vscode.workspace.fs.readFile(this.schemaPath!);
				const text = new TextDecoder().decode(buf);
				const json = JSON.parse(text);
				console.log('Got schema!', json);
				return json;
			}
			catch (e) {
				console.log('Failed to get schema :(', e);
				return {};
			}
		})();

		return this.schemaTemp;
	}

	static dispose() {
		SCHEMA_ERRORS.clear();
	}

	static async getSchemaCompletions(document: vscode.TextDocument, node: KVAnyRanged, isKey: boolean) {
		const schema = await this.getSchema(document.uri);
		if (!schema) return [];
		return getSchemaCompletionsForNode(schema, isKey, node);
	}

	static async checkSchema(document: vscode.TextDocument, token: vscode.CancellationToken) {
		const schema = await this.getSchema(document.uri);
	
		if (!schema) {
			SCHEMA_ERRORS.set(document.uri, []);
			return;
		}

		const parsed = await keyValuesCache.parse(document, token);
		const diagnostics = validateDocument(document, parsed.tree, schema);

		SCHEMA_ERRORS.set(document.uri, diagnostics);
	}
}
