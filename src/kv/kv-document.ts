import * as vscode from 'vscode';
import { tokenize, ParseErrors, ParseErrorsMap } from './kv-tokenizer.js';
import { outConsole } from '../extension.js';
import { ParserCache } from '../parser-cache.js';

export const enum KVType {
	Invalid = -1,
	Pair,
	Dir,
	Comment
}

export const enum KVHover {
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

export type KVRootRanged = Omit<KVSetRanged, 'parent'>;

export interface KVSetRanged {
	type: KVType.Dir;
	parent?: KVSetRanged;
	children: (KVPairRanged | KVSetRanged)[];
	key_start: number;
	key_end: number;
	content_start: number;
	content_end: number;
	key: string;
}

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

export class KeyValuesCache extends ParserCache<{ tree: KVSetRanged, tokens: vscode.SemanticTokens }>() {
	static async _parse(doc: vscode.TextDocument, cancelToken: vscode.CancellationToken) {
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

		let state = KVState.HasNone;
		let key_start   = 0, key_end   = 0;
		let value_start = 0, value_end = 0;
		let query_start = 0, query_end = 0;

		const push_kv = () => { node.children.push({
			type: KVType.Pair,
			key_start, key_end, key: text.slice(key_start, key_end),
			value_start, value_end, value: text.slice(value_start, value_end),
			query_start, query_end, query: query_start !== query_end ? text.slice(query_start, query_end) : undefined,
			parent: node }); };

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

				const token_pos = doc.positionAt(start), q = +quoted;
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
				else if (state !== KVState.HasNone) push_kv();
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
			if (state !== KVState.HasNone) push_kv();
			if (node !== root) push_err(text.length, text.length+1, ParseErrors.UnclosedBracket);
			TOKEN_ERRORS.set(doc.uri, errors);
		}

		return { tree: root, tokens: tokens.build() };
	}

	static async nodeAtOffset(doc: vscode.TextDocument, cancelToken: vscode.CancellationToken, offset: number) {
		const root = await this.parse(doc, cancelToken);
		
		// Locate position in node tree.
		let dir: KVSetRanged = root.tree;

		main: while (true) {
			// Search through children to find a child whose bounds cover the position
			for (const child of dir.children) {
				if (child.type === KVType.Dir) {
					if (child.key_start > offset || child.content_end < offset) continue;
					dir = child;
					continue main; // Found the container, keep searching within
				}
				else {
					const has_query = child.query_end && child.query_start;
					if (child.key_start > offset || (has_query ? child.query_end : child.value_end) < offset) continue;
					return child; // Found the active KV, drop everything
				}
			}
			// If we reach here, no child nodes matched.
			break main;
		}

		return dir;
	}

	static nodePartAtOffset(node: KVPairRanged | KVSetRanged | KVCommentRanged, pos: number) {
		if (node.type === KVType.Comment) return KVHover.Invalid;
		if (node.type === KVType.Dir) {
			if (pos <= node.key_end) return KVHover.Key;
			if (pos >= node.content_start) return KVHover.Value;
			return KVHover.None;
		}
		if (pos < node.key_end) return KVHover.Key;
		if (pos >= node.value_start && pos < node.value_end) return KVHover.Value;
		if (node.query_start && node.query_end && pos >= node.query_start && pos < node.query_end) return KVHover.Query;
		return KVHover.None;
	}
}

export class KeyValuesHoverProvider implements vscode.HoverProvider {
	static register() {
		return vscode.languages.registerHoverProvider({ language: 'sourcery.keyvalues' }, new this());
	}

	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
		const offset = document.offsetAt(position);
		const node = await KeyValuesCache.nodeAtOffset(document, token, offset);
		const part = KeyValuesCache.nodePartAtOffset(node, offset);

		if (part === KVHover.None) return;
		if (node.type === KVType.Dir && part !== KVHover.Key) return;

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
		return vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcery.keyvalues' }, new this(), kvTokenLegend);
	}
	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const out = await KeyValuesCache.parse(document, token);
		return out.tokens;
	}
}

export class KeyValuesCompletionProvider implements vscode.CompletionItemProvider {
	
	static register() {
		return vscode.languages.registerCompletionItemProvider({ language: 'sourcery.keyvalues' }, new this());
	}
	
	async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | undefined> {
		const offset = document.offsetAt(position);
		const node = await KeyValuesCache.nodeAtOffset(document, token, offset);
		const part = KeyValuesCache.nodePartAtOffset(node, offset);

		if (part === KVHover.None) return;
		if (node.type === KVType.Dir && part !== KVHover.Key) return;

		return [];
	}

	resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
		throw new Error('Method not implemented.');
	}
}
