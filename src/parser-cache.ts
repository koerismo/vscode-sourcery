import { TextDocument, CancellationToken, workspace } from 'vscode';
import { outConsole } from './extension.js';

export function ParserCache<T>() {
	abstract class ParserCache {
		static cache: Record<string, { version: number, value: T }> = {};

		static {
			workspace.onDidCloseTextDocument(this.onDocumentClosed.bind(this));
		}

		static onDocumentClosed(document: TextDocument) {
			outConsole.log('Freeing document...');
			const key = document.uri.toString(true);
			if (key in this.cache) delete this.cache[key];
		}

		static async parse(document: TextDocument, token: CancellationToken) {
			const key = document.uri.toString(true);
			const entry = this.cache[key] ?? (this.cache[key] = { version: -1, value: null! });

			if (!entry.value || entry.version < document.version) {
				const startTime = performance.now();
				const startMem = process.memoryUsage();
				entry.value = await this._parse(document, token);
				entry.version = document.version;
				const endTime = performance.now();
				const endMem = process.memoryUsage();
				outConsole.log(`Parsed document (${document.lineCount} lines) in ${Math.round(endTime - startTime)}ms! Used ${(endMem.heapUsed - startMem.heapUsed) / 1_000_000} mb`);
				
			}

			return entry.value;
		}

		static _parse(document: TextDocument, token: CancellationToken): T | Promise<T> {
			throw Error('Parser not implemented!');
		}
	};
	return ParserCache;
}

/* 
export class ParserCache<T> {
	static cache: Record<string, { version: number, value: T }> = {};
	
	static {
		workspace.onDidCloseTextDocument(this.onDocumentClosed.bind(this));
	}
	
	static onDocumentClosed(document: TextDocument) {
		outConsole.log('Freeing document...');
		const key = document.uri.toString(true);
		if (key in this.cache) delete this.cache[key];
	}

	static async parse(document: TextDocument, token: CancellationToken) {
		const key = document.uri.toString(true);
		const entry = this.cache[key] ?? (this.cache[key] = { version: -1, value: null! });

		if (!entry.value || entry.version < document.version) {
			const startTime = performance.now();
			const startMem = process.memoryUsage();
			entry.value = await this._parse(document, token);
			entry.version = document.version;
			const endTime = performance.now();
			const endMem = process.memoryUsage();
			outConsole.log(`Parsed document (${document.lineCount} lines) in ${Math.round(endTime - startTime)}ms! Used ${(endMem.heapUsed - startMem.heapUsed) / 1_000_000} mb`);
			
		}

		return entry.value;
	}

	_parse(document: TextDocument, token: CancellationToken): T | Promise<T> {
		throw Error('Parser not implemented!');
	}
}
 */