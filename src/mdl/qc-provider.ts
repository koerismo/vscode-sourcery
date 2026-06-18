// @ts-nocheck

import * as vscode from 'vscode';

import { tokenize, ParseErrors, ParseOptions, ParseErrorsMap } from '../kv/kv-tokenizer.js';
import { ParserCache } from '../parser-cache.js';

const QC_TOKEN_ERRORS = vscode.languages.createDiagnosticCollection('qc-tokens');
const QC_CMD_ERRORS = vscode.languages.createDiagnosticCollection('qc-cmds');

const enum QcTokenType {
	Invalid = -1,
	BOpen,
	BClose,
	String,
	Word,
	Command,
}

interface QcToken {
	type: QcTokenType;
	text?: string;
	quoted?: boolean;
	start: number;
	end: number;
}

class QcTokenCache extends ParserCache<QcToken[]>() {
	async _parse(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<QcToken[]> {
		const doc = document.getText();
		const out: QcToken[] = [];
		const errors: vscode.Diagnostic[] = [];

		tokenize(doc, {
			on_token: function (start: number, end: number, quoted: boolean): void {
				const text = doc.slice(start, end);
				const type = quoted ? QcTokenType.String : (doc[start] === '$' ? QcTokenType.Command : QcTokenType.Word);
				out.push({ text, type, start, end, quoted });
			},
			on_enter: function (start: number): void {
				out.push({ type: QcTokenType.BOpen, start, end: start+1 });
			},
			on_exit: function (start: number): void {
				out.push({ type: QcTokenType.BClose, start, end: start+1 });
			},
			on_error: function (start: number, end: number, err: ParseErrors): void {
				const [severity, message] = ParseErrorsMap[err];
				errors.push({
					code: err,
					range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
					severity, message
				});
			},
			on_comment: function (start: number, end: number, ml: boolean): void {},

			escapes: false,
			multilines: false,
			state_cancel: false
		});

		QC_TOKEN_ERRORS.set(document.uri, errors);
		return out;
	}
}

const qcError_NoToken = Error('Expected a token, but got EOF or next command!');
const qcError_OnlyString = Error('Expected a string token!');
const qcError_OnlyInt = Error('Expected an integer token!');
const qcError_OnlyFloat = Error('Expected a float token!');

class QcTokenReader {
	i = 0;

	constructor(private readonly tokens: QcToken[]) {}

	next(err: Error=qcError_NoToken): QcToken {
		if (this.i >= this.tokens.length) throw err;
		return this.tokens[this.i++];
	}

	peek(): QcToken {
		return this.tokens[this.i+1];
	}

	string(err: string='Expected a string!'): string {
		const t = this.next();
		if (t.type !== QcTokenType.String && t.type !== QcTokenType.Word) throw Error(err, { cause: qcError_OnlyString });
		return t.text!;
	}

	_num(err: string, cause: Error, parseNumber: (s: string) => number) {
		const t = this.next();
		if (t.quoted) throw Error(err, { cause });
		const p = parseNumber(t.text!);
		if (isNaN(p)) throw Error(err, { cause });
		return p;
	}

	int(err: string='Expected an integer!'): number {
		return this._num(err, qcError_OnlyInt, parseInt);
	}

	float(err: string='Expected a float!'): number {
		return this._num(err, qcError_OnlyFloat, parseFloat);
	}

	bracket() {

	}
}

class QcTokenParser {
	i = 0;
	tokenMap: QcToken[];

	constructor(private readonly tokens: QcToken[]) {
		this.tokenMap = new Array(this.tokens.length);
	}

	skip_to_next_command() {
		while (true) {
			if (this.tokens[this.i]?.type === QcTokenType.Command) return;
			this.i++;
		}
	}

	has_next(): boolean {
		const t = this.tokens[this.i+1];
		return t && t.type !== QcTokenType.Command;
	}

	peek(): QcToken {
		return this.tokens[this.i+1];
	}

	any(err: Error=qcError_NoToken): QcToken {
		if (this.i >= this.tokens.length) throw err;
		return this.tokens[this.i++];
	}

	_param(name: string, desc: string): QcToken {
		const token = this.any();
		if (token.type === QcTokenType.Command) throw qcError_NoToken;
		return token;
	}

	_param_num(name: string, desc: string) {
		const out = this._param(name, desc);
	}

	param_string(name: string, desc: string): string {

	}

	param_path(name: string, desc: string): string {

	}

	param_int(name: string, desc: string): number {

	}

	param_float(name: string, desc: string): number {

	}
}

function command_sequence(t: QcTokenParser) {
	t.param_string('name', 'The name of the action.');
	t.param_path('path', 'The smd/dmx/fbx filepath.');
	const bracket_or_keyword = t.any();

}

function parse_qclang(text: string) {

}

export class QcCompletionProvider implements vscode.CompletionItemProvider {
	static register() {
		return vscode.languages.registerCompletionItemProvider({ language: 'qc' }, new this());
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
		throw new Error('Method not implemented.');
	}

	resolveCompletionItem?(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
		throw new Error('Method not implemented.');
	}
}
