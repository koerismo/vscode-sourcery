import * as vscode from 'vscode';
import { tokenize, ParseErrors, ParseErrorsMap } from './kv-tokenizer.js';
import { ParserCache } from '../parser-cache.js';
import { KeyValuesSchemaHandler } from './kv-schema.js';

export const enum KVType {
	Invalid = -1,
	Pair,
	Dir,
	Comment
}

export const enum KVPart {
	Invalid = -1,
	None,
	Key,
	Value,
	Query,
}

export interface KVPairRanged {
	type: KVType.Pair;
	parent: KVSetRanged;
	key_start: number;
	value_start: number;
	query_start: number; // If no query, query_start and query_end are both 0
	key_end: number;
	value_end: number;
	query_end: number;
	key: string;
	value: string;
	query?: string;
}

export interface KVCommentRanged {
	type: KVType.Comment;
	content_start: number;
	content_end: number;
}

export interface KVRootRanged {
	type: KVType.Dir;
	children: (KVPairRanged | KVSetRanged)[];
	key_start: number;
	key_end: number;
	content_start: number;
	content_end: number;
	key: string;
}

export interface KVSetRanged extends KVRootRanged {
	parent?: KVSetRanged;
}

export type KVAnyRanged = KVRootRanged | KVSetRanged | KVPairRanged;

const C_SQOPEN = 91, C_SQCLOSE = 93;

export const enum KVState {
	HasNone,
	HasKey,
	HasValue,
	HasQuery,
}

export const enum KVTokenType {
	Invalid = -1,
	Key,
	Value,
	Query,
	Command,
	CommentLine,
	CommentBlock
}

export const kvTokenLegend = new vscode.SemanticTokensLegend(
	['variable', 'string', 'keyword.control', 'meta.preprocessor', 'constant.numeric', 'comment.line', 'comment.block'],
);

const TOKEN_ERRORS = vscode.languages.createDiagnosticCollection('kv-tokenizer');

class KeyValuesCache extends ParserCache<{ tree: KVSetRanged, tokens: vscode.SemanticTokens }> {
	async _parse(doc: vscode.TextDocument, cancelToken: vscode.CancellationToken) {
		const text = doc.getText();
		const errors: vscode.Diagnostic[] = [];
		const tokens = new vscode.SemanticTokensBuilder(kvTokenLegend);

		let node: KVSetRanged;
		const root: KVSetRanged = node = {
			type: KVType.Dir,
			children: [],
			key_start: 0,
			key_end: 0,
			key: '',
			content_start: 0,
			content_end: text.length,
		};

		let state = KVState.HasNone as KVState;
		let key_start   = 0, key_end   = 0;
		let value_start = 0, value_end = 0;
		let query_start = 0, query_end = 0;

		const push_kv = () => { node.children.push({
			type: KVType.Pair,
			key_start, key_end, key: text.slice(key_start, key_end),
			value_start, value_end, value: text.slice(value_start, value_end),
			query_start, query_end, query: query_start !== query_end ? text.slice(query_start, query_end) : undefined,
			parent: node });
			key_start = key_end = 0;
			value_start = value_end = 0;
			query_start = query_end = 0;
		};

		const push_err = (start: number, end: number, code: ParseErrors) => {
			const [severity, message] = ParseErrorsMap[code];
			errors.push({
				range: new vscode.Range(doc.positionAt(start), doc.positionAt(end)),
				severity, code, message
			});
		};

		const config = {
			on_token(start: number, end: number, quoted: boolean): void {
				let token_type: KVTokenType;
				if (cancelToken.isCancellationRequested) config.state_cancel = true;
				if (state === KVState.HasValue && !quoted && text.charCodeAt(start) === C_SQOPEN && text.charCodeAt(end-1) === C_SQCLOSE) {
					query_start = start; query_end = end;
					state = KVState.HasQuery;
					token_type = KVTokenType.Query;
					push_kv();
				}
				else if (state === KVState.HasKey) {
					value_start = start; value_end = end;
					state = KVState.HasValue;
					token_type = KVTokenType.Value;
				}
				else {
					query_start = query_end = 0;
					if (state === KVState.HasValue) push_kv();
					key_start = start; key_end = end;
					state = KVState.HasKey;
					token_type = KVTokenType.Key;
				}

				const token_pos = doc.positionAt(start);
				const q = +quoted;
				tokens.push(token_pos.line, token_pos.character - q, end - start + q+q, token_type);
			},
			on_enter(start: number): void {
				if (state === KVState.HasValue) { key_start = value_start; key_end = value_end; }
				if (state !== KVState.HasKey) push_err(start, start+1, ParseErrors.MissingKey);
				state = KVState.HasNone;
				const child: KVSetRanged = { type: KVType.Dir, key_start, key_end, key: text.slice(key_start, key_end), content_start: start, content_end: 0, children: [], parent: node };
				node.children.push(child);
				node = child;
			},

			on_exit(start: number): void {
				if (state === KVState.HasKey) push_err(key_start, key_end, ParseErrors.MissingValue);
				if (state !== KVState.HasNone) push_kv();
				state = KVState.HasNone;
				node.content_end = start + 1;
				if (node.parent === undefined) push_err(start, start+1, ParseErrors.ExtraBracket);
				else node = node.parent;
			},

			on_error(start: number, end: number, err: ParseErrors): void {
				if (cancelToken.isCancellationRequested) config.state_cancel = true;
				push_err(start, end, err);
			},

			on_comment(start: number, end: number, ml: boolean): void {
				if (ml) push_err(start, start+2, ParseErrors.NoBlockComments);
				const token_type = ml ? KVTokenType.CommentBlock : KVTokenType.CommentLine;
				const token_pos = doc.positionAt(start);
				tokens.push(token_pos.line, token_pos.character, end - start, token_type);
			},

			escapes: false,
			multilines: true,
			state_cancel: false
		};

		tokenize(text, config);
		if (!config.state_cancel) {
			if (state === KVState.HasKey) push_err(key_start, key_end, ParseErrors.MissingValue);
			if (state !== KVState.HasNone) push_kv();
			if (node !== root) push_err(text.length, text.length+1, ParseErrors.UnclosedBracket);
			TOKEN_ERRORS.set(doc.uri, errors);
		}

		return { tree: root, tokens: tokens.build() };
	}

	async nodeAtOffset(doc: vscode.TextDocument, cancelToken: vscode.CancellationToken, offset: number, allowEndChar=false) {
		const root = await this.parse(doc, cancelToken);
		const o = +!!allowEndChar;
		
		// Locate position in node tree.
		let dir: KVSetRanged = root.tree;

		main: while (true) {
			// Search through children to find a child whose bounds cover the position
			for (const child of dir.children) {
				if (child.type === KVType.Dir) {
					if (offset < child.key_start || offset >= child.content_end+o) continue;
					dir = child;
					continue main; // Found the container, keep searching within
				}
				else {
					const has_query = child.query_start && child.query_end;
					const has_value = child.value_start && child.value_end;
					const kv_end = has_value ? (has_query ? child.query_end : child.value_end) : child.key_end;
					if (offset < child.key_start || offset >= kv_end+o) continue;
					return child; // Found the active KV, drop everything
				}
			}
			// If we reach here, no child nodes matched.
			break main;
		}

		return dir;
	}

	nodePartAtOffset(node: KVPairRanged | KVSetRanged | KVCommentRanged, pos: number, allowEndChar=false) {
		const o = +!!allowEndChar;
		if (node.type === KVType.Comment) return KVPart.Invalid;
		if (node.type === KVType.Dir) {
			if (pos < node.key_end+o) return KVPart.Key;
			if (pos >= node.content_start) return KVPart.Value;
			return KVPart.None;
		}
		if (pos < node.key_end+o) return KVPart.Key;
		if (pos >= node.value_start && pos < node.value_end+o) return KVPart.Value;
		if (node.query_start && node.query_end && pos >= node.query_start && pos < node.query_end+o) return KVPart.Query;
		return KVPart.None;
	}

	async nodeAtCursor(doc: vscode.TextDocument, cancelToken: vscode.CancellationToken, offset: number) {
		return this.nodeAtOffset(doc, cancelToken, offset, true);
	}

	nodePartAtCursor(node: KVPairRanged | KVSetRanged | KVCommentRanged, pos: number) {
		return this.nodePartAtOffset(node, pos, true);
	}

	nodeKeyPath(node: KVPairRanged | KVSetRanged): string[] {
		const path: string[] = [];
		let tmp = node;
		let count = 0;

		while (tmp.parent) {
			path.push(tmp.key);
			tmp = tmp.parent;

			count++;
			if (count > 512) throw Error(`Recursive node parents! Aborted.`);
		}

		return path.reverse();
	}
}

export const keyValuesCache = new KeyValuesCache();
const keyValuesLanguages = [{ language: 'sourcery.keyvalues' }, { language: 'sourcery.vmt' }];

export class KeyValuesHoverProvider implements vscode.HoverProvider {
	static register() {
		return vscode.languages.registerHoverProvider(keyValuesLanguages, new this());
	}

	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
		const offset = document.offsetAt(position);
		const node = await keyValuesCache.nodeAtOffset(document, token, offset);
		const part = keyValuesCache.nodePartAtOffset(node, offset);

		if (part === KVPart.None) return;
		if (node.type === KVType.Dir && part !== KVPart.Key) return;

		let path: string[] = [];
		let tmp = node;
		while (tmp.parent) {
			path.push(tmp.key);
			tmp = tmp.parent;
		}

		return {
			contents: [path.reverse().join('.')]
		};
	}
}

export class KeyValuesTokenProvider implements vscode.DocumentSemanticTokensProvider {
	static register() {
		return vscode.languages.registerDocumentSemanticTokensProvider(keyValuesLanguages, new this(), kvTokenLegend);
	}

	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const out = await keyValuesCache.parse(document, token);
		await KeyValuesSchemaHandler.checkSchema(document, token);
		return out.tokens;
	}
}

export class KeyValuesCompletionProvider implements vscode.CompletionItemProvider, vscode.InlineCompletionItemProvider {
	static register() {
		const self = new this();
		const ext = vscode.languages.registerCompletionItemProvider(keyValuesLanguages, self, '"', '$', '%', '[');
		const inl = vscode.languages.registerInlineCompletionItemProvider(keyValuesLanguages, self);

		return new vscode.Disposable(() => {
			ext.dispose();
			inl.dispose();
		});
	}
	
	async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | undefined> {
		const offset = document.offsetAt(position);
		const node = await keyValuesCache.nodeAtCursor(document, token, offset);
		let part = keyValuesCache.nodePartAtCursor(node, offset);

		const completions = await KeyValuesSchemaHandler.getSchemaCompletions(document, node, part !== KVPart.Value);
		return completions;
	}

	async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[] | undefined> {
		const word = document.getWordRangeAtPosition(position);
		if (!word) return;

		const offset = document.offsetAt(position);
		const node = await keyValuesCache.nodeAtCursor(document, token, offset);
		const part = keyValuesCache.nodePartAtCursor(node, offset);

		if (part === KVPart.None) return;

		const completions = await KeyValuesSchemaHandler.getSchemaCompletions(document, node, part !== KVPart.Value);
		return completions.map<vscode.InlineCompletionItem>(x => ({
			insertText: x.insertText ?? x.label as string
		}));
	}

	// resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
	// 	throw new Error('Method not implemented.');
	// }
}

export class KeyValuesSymbolProvider implements vscode.DocumentSymbolProvider {
	static register() {
		return vscode.languages.registerDocumentSymbolProvider(keyValuesLanguages, new this());
	}

	async provideDocumentSymbols(doc: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
		const resolveNode = (node: KVSetRanged) => {
			const key_range = new vscode.Range(doc.positionAt(node.key_start), doc.positionAt(node.key_end));
			const full_range = new vscode.Range(doc.positionAt(node.key_start), doc.positionAt(node.content_end));
			const symbol = new vscode.DocumentSymbol(node.key || ' ', '', vscode.SymbolKind.Namespace, full_range, key_range);

			for (let i=0; i<node.children.length; i++) {
				const child = node.children[i];
				if (child.type === KVType.Dir) symbol.children.push(resolveNode(child));
			}

			return symbol;
		};

		const parsed = await keyValuesCache.parse(doc, token);
		const symbols = resolveNode(parsed.tree).children;
		return symbols;
	}
}
