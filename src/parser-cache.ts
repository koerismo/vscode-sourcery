import { TextDocument, CancellationToken, workspace } from 'vscode';

export function ParserCache<T>() {
	abstract class ParserCache {
		static cache: Record<string, { version: number, value: T }> = {};

		static {
			workspace.onDidCloseTextDocument(this.onDocumentClosed.bind(this));
		}

		static onDocumentClosed(document: TextDocument) {
			const key = document.uri.toString(true);
			if (!(key in this.cache)) return;
			delete this.cache[key];
		}

		static async parse(document: TextDocument, token: CancellationToken) {
			const key = document.uri.toString(true);
			const entry = this.cache[key] ?? (this.cache[key] = { version: -1, value: null! });

			if (!entry.value || entry.version < document.version) {
				entry.value = await this._parse(document, token);
				entry.version = document.version;
			}

			return entry.value;
		}

		static _parse(document: TextDocument, token: CancellationToken): T | Promise<T> {
			throw Error('Parser not implemented!');
		}
	};
	return ParserCache;
}
