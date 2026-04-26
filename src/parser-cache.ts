import { TextDocument, CancellationToken, workspace, Disposable } from 'vscode';

export abstract class ParserCache<T> implements Disposable {
	cache: Record<string, { version: number, value: T }> = {};
	disposables: Disposable[] = [];
	
	constructor() {
		this.disposables.push(
			workspace.onDidCloseTextDocument(this.onDocumentClosed.bind(this))
		);
	}

	dispose() {
		this.disposables.map(x => x.dispose());
	}

	onDocumentClosed(document: TextDocument) {
		const key = document.uri.toString(true);
		if (!(key in this.cache)) return;
		delete this.cache[key];
	}

	async parse(document: TextDocument, token: CancellationToken) {
		const key = document.uri.toString(true);
		const entry = this.cache[key] ?? (this.cache[key] = { version: -1, value: null! });

		if (!entry.value || entry.version < document.version) {
			entry.value = await this._parse(document, token);
			entry.version = document.version;
		}

		return entry.value;
	}

	_parse(document: TextDocument, token: CancellationToken): T | Promise<T> {
		throw Error('Parser not implemented!');
	}
}
