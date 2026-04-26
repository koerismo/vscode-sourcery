import * as vscode from 'vscode';
import { outConsole } from '../extension.js';

import { keyValuesCache, KVPart, KVPairRanged, KVSetRanged, kvTokenLegend, KVType } from '../kv/kv-document.js';
import { getPathAutocomplete, modFilesystem } from '../mod-mount.js';
import { BuiltinTextures, CompilerParamSchema, ShaderNames, ShaderPriority } from './vmt-enums.js';

// #region Types

export interface VmtSchemaCase {
	if?: string;
	xif?: string;
	has?: string;
	xhas?: string;

	warn?: string;
	error?: string;
	info?: string;
	disable?: string;
}

export type VmtParamType = 'int' | 'float' | 'color' | 'bool' | 'texture' | 'string' | 'vec2' | 'vec3' | 'vec4' | 'matrix' | 'fourcc' | 'material';

export interface VmtSchemaParam {
	type: VmtParamType;
	help?: string;
	default?: string;
	cases?: VmtSchemaCase[];
	required?: boolean;
}

export interface VmtSchema {
	[param: string]: VmtSchemaParam;
}

interface TypeLinkInfo {
	root: string;
	ext: string;
	qualifier?: string;
}

// #region Shared

const RE_MODEL_PATH = /^(?:\/|\\)?props?(_\w+)?(?:\/|\\)/;
const RE_SLASH = /[\\\/]+/g;

const SCHEMA_ERRORS = vscode.languages.createDiagnosticCollection('vmt-schema');
const LINK_ERRORS = vscode.languages.createDiagnosticCollection('vmt-links');

export const enum VmtActionCodes {
	Invalid = -1,
	None,
	FixModelPath,
}

function isTruthy(v: string): boolean {
	return !(!v.length || v === 'false' || v === '0');
}

/** For the given type, figure out how to search for relevant files. */
function getTypeLinkInfo(type: VmtParamType): TypeLinkInfo | undefined {
	switch (type) {
		case 'material': return { root: 'materials/', ext: '.vmt' };
		case 'texture': return { root: 'materials/', ext: '.vtf' };
		default: return;
	}
}

const RE_NEEDS_QUOTES = /[\s\n]/;
function needsQuotes(x: string) {
	return RE_NEEDS_QUOTES.test(x);
}

// #region Providers

export class VmtSchemaHandler {
	static _shaderRecordUri?: vscode.Uri;
	static _shaderRecord?: Record<string, VmtSchema>;

	static register(ctx: vscode.ExtensionContext) {
		this._shaderRecordUri = ctx.extensionUri.with({ path: ctx.extensionUri.path+'/schemas/vmt/materials-strata.min.json' });
		return new vscode.Disposable(() => {
			if (this._shaderRecord) delete this._shaderRecord;
		});
	}

	static async _loadSchemaMap(): Promise<Record<string, VmtSchema>> {
		if (!this._shaderRecord) {
			const startTime = performance.now();
			if (!this._shaderRecordUri) throw Error('VmtSchemaHandler not initialized!');
			try {
				const data = await vscode.workspace.fs.readFile(this._shaderRecordUri);
				const text = new TextDecoder('utf-8').decode(data);
				this._shaderRecord = JSON.parse(text);
				const endTime = performance.now();
				outConsole.log(`Finished loading shader schemas in ${Math.round(endTime - startTime)}ms!`);
			}
			catch (e) {
				outConsole.error(`Failed to load Vmt schemas!`, e);
			}
		}
		return this._shaderRecord!;
	}
	
	static _loadPromise: Promise<Record<string, VmtSchema>>;
	static async _tryLoadSchemaMap(): Promise<Record<string, VmtSchema>> {
		this._loadPromise ??= this._loadSchemaMap();
		return this._loadPromise;
	}

	static getCompilerSchema(): VmtSchema {
		return CompilerParamSchema;
	}

	static async getSchema(shader: string): Promise<VmtSchema | undefined> {
		const record = await this._tryLoadSchemaMap();
		shader = shader.toLowerCase();
		if (shader in record) return Object.assign({}, record[shader], CompilerParamSchema);
		return;
	}

	static getShaderList(): string[] {
		return Object.values(ShaderNames);
		// const record = await this._tryLoadSchemaMap();
		// return Object.keys(record).map(x => ShaderNames[x]);
	}

	static getQuickShaderList(): string[] {
		return Object.keys(ShaderPriority).map(key => ShaderNames[key]);
	}
}

export class VmtSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	static register() {
		return vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcery.vmt' }, new this(), kvTokenLegend);
	}

	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const parsed = await keyValuesCache.parse(document, token);

		if (parsed.tree.children.length) {
			const shader_kvs = parsed.tree.children[0];
			const shader_name = shader_kvs.key;
	
			// TODO: Schema validation should be done async!
			const schema = await VmtSchemaHandler.getSchema(shader_name);
	
			if (schema && shader_kvs.type === KVType.Dir) {
				this.validate_schema(document, shader_kvs, schema);
			}
		}
		else {
			SCHEMA_ERRORS.delete(document.uri);
		}
		
		return parsed.tokens;
	}

	validate_schema_case(prop: VmtSchemaCase, key_map: Record<string, KVSetRanged | KVPairRanged>): boolean {
		const prop_if = (prop.if ?? prop.xif);
		const prop_has = (prop.has ?? prop.xhas);
		const prop_invert = ('xif' in prop || 'xhas' in prop);

		if (prop_if === undefined && prop_has === undefined) return false;
		const target = key_map[prop_if ?? prop_has!];
		
		let truthy = false;
		if (target) {
			if (prop_if) truthy = target.type === KVType.Pair ? isTruthy(target.value) : true;
			else if (prop_has) truthy = target !== undefined;
		}

		if (prop_invert) truthy = !truthy;
		return truthy;
	}

	validate_schema_type(prop: VmtSchemaParam, value: string): boolean {
		switch (prop.type) {
			case 'int':
			case 'float':
				return !isNaN(+value);
			case 'bool':
				return (value === 'true' || value === 'false' || value === '1' || value === '0');
			case 'vec2':
			case 'vec3':
			case 'vec4':
			case 'color': {
				const is_array = 
					(value[0] === '[' && value[value.length-1] === ']') ||
					(value[0] === '{' && value[value.length-1] === '}');
				
				if (is_array) {
					const parts = value.slice(1, -1).split(/\s+/g);
					for (let i=0; i<parts.length; i++) {
						if (isNaN(+parts[i])) return false;
					}
					return true;
				}
				return !isNaN(+value);
			}
			default:
				return true;
		}
	}

	validate_schema(document: vscode.TextDocument, shader_kvs: KVSetRanged, schema: VmtSchema) {
		const key_map: Record<string, KVSetRanged | KVPairRanged> = {};
		const errors: vscode.Diagnostic[] = [];
		
		for (const child of shader_kvs.children)
			key_map[child.key] = child;
		
		for (const key in schema) {
			const prop = schema[key];

			// Check if missing
			if (!(key in key_map)) {
				if (prop.required) errors.push({
					message: `Expected key ${key} to be present!`,
					severity: vscode.DiagnosticSeverity.Warning,
					range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0))
				});
				continue;

			}

			const kv = key_map[key];
			
			// Check if value can be parsed
			if (kv.type === KVType.Dir) {
				if (prop.type) errors.push({
					message: `Expected ${prop.type} value for parameter ${kv.key}!`,
					range: new vscode.Range(document.positionAt(kv.content_start), document.positionAt(kv.content_start+1)),
					severity: vscode.DiagnosticSeverity.Warning
				});
				continue;
			}
			
			if (!this.validate_schema_type(prop, kv.value)) {
				errors.push({
					message: `Failed to interpret "${kv.value}" as ${prop.type}!`,
					range: new vscode.Range(document.positionAt(kv.value_start), document.positionAt(kv.value_end)),
					severity: vscode.DiagnosticSeverity.Warning
				});
			}

			// Check if any cases match, then do their actions.
			if (prop.cases)
			for (const c of prop.cases) {
				if (!this.validate_schema_case(c, key_map)) continue;
				let severity: vscode.DiagnosticSeverity, message: string;
				if (c.info) severity = vscode.DiagnosticSeverity.Information, message = c.info;
				else if (c.warn) severity = vscode.DiagnosticSeverity.Warning, message = c.warn;
				else if (c.error) severity = vscode.DiagnosticSeverity.Error, message = c.error;
				else continue;
				errors.push({
					message, severity,
					range: new vscode.Range(document.positionAt(kv.key_start), document.positionAt(kv.query_end || kv.value_end))
				});
			}
		}

		SCHEMA_ERRORS.set(document.uri, errors);
		return errors;
	}
}

export class VmtHoverProvider implements vscode.HoverProvider {
	static register() {
		return vscode.languages.registerHoverProvider({ language: 'sourcery.vmt' }, new this());
	}

	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
		const offset = document.offsetAt(position);
		const node = await keyValuesCache.nodeAtOffset(document, token, offset);
		const part = keyValuesCache.nodePartAtOffset(node, offset);

		const parsed = await keyValuesCache.parse(document, token);
		const shader_node = parsed.tree.children[0];

		if (!shader_node) return;
		if (part !== KVPart.Key)
			return;

		const schema = await VmtSchemaHandler.getSchema(shader_node.key);
		if (!schema) return;

		const key = node.key.toLowerCase();
		if (key in schema) {
			const prop = schema[key];
			const defaultText = prop.default ? (' = "' + prop.default + '"') : '';
			const contents = ['```plaintext\n' + key + ': ' + prop.type + defaultText + '\n```'];
			if (prop.help) contents.push(prop.help);
			return { contents };
		}
	}
}


export class VmtCompletionProvider implements vscode.CompletionItemProvider, vscode.InlineCompletionItemProvider {
	static register() {
		const self = new this();
		const ext = vscode.languages.registerCompletionItemProvider({ language: 'sourcery.vmt' }, self, '$', '%', '"', '/', '[');
		const inl = vscode.languages.registerInlineCompletionItemProvider({ language: 'sourcery.vmt' }, self);
		return new vscode.Disposable(() => {
			ext.dispose();
			inl.dispose();
		});
	}

	async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[] | undefined> {
		const word = document.getWordRangeAtPosition(position);
		if (!word) return;

		const node_root = await keyValuesCache.parse(document, token);
		const node_shader = node_root.tree.children[0];

		if (document.offsetAt(word.start) == 0) {
			const shaderList = VmtSchemaHandler.getQuickShaderList();
			return shaderList.map<vscode.InlineCompletionItem>(x => {
				return ({
					label: x,
					insertText: x,
					range: new vscode.Range(document.positionAt(node_shader.key_start), document.positionAt(node_shader.key_end)),
				});
			});
		}

		return [];
	}

	async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | undefined> {
		const offset = document.offsetAt(position);
		const node = await keyValuesCache.nodeAtCursor(document, token, offset);
		const part = keyValuesCache.nodePartAtCursor(node, offset);
		
		const node_root = await keyValuesCache.parse(document, token);
		const node_shader = node_root.tree.children[0];

		if (node === node_shader && part === KVPart.Key && context.triggerCharacter === '"') {
			const shaderList = VmtSchemaHandler.getShaderList();
			const completions: vscode.CompletionItem[] = shaderList.map(x => ({ label: x }));
			return completions;
		}

		const isPatchShader = node_shader.key.toLowerCase() === 'patch';

		if (node_shader.type !== KVType.Dir) return;
		if (node.type !== KVType.Pair) return;
	
		if (isPatchShader) {
			if (node.parent === node_shader && part === KVPart.Key) {
				return [{ label: 'include' }, { label: 'insert' }, { label: 'append' }];
			}
			if (node.parent.parent !== node_shader) return;
		} else {
			if (node.parent !== node_shader || (isPatchShader && node.key)) return;
		}

		const schema = await VmtSchemaHandler.getSchema(node_shader.key);
		if (!schema) return;

		if (part === KVPart.Key) {
			if (context.triggerCharacter === '/') return [];
			const completions: vscode.CompletionItem[] = [];
			for (const key in schema) {
				if (!key.startsWith(node.key)) continue;

				// Create initial text replacement.
				const param = schema[key];
				const shouldSlice = !!context.triggerCharacter && node.key.startsWith(context.triggerCharacter);
				const snippet = new vscode.SnippetString();
				snippet.appendText(shouldSlice ? key.slice(1) : key);
				
				// Add default as placeholder
				if (param.default) {
					const quoted = needsQuotes(param.default);
					snippet.appendText(' ');
					snippet.appendPlaceholder(quoted ? '"'+param.default+'"' : param.default);
				}
				completions.push({ label: key, insertText: snippet, detail: schema[key].help });
			}
			return completions;
		}
		
		if (part === KVPart.Value) {
			const param = schema[node.key];
			if (!param) return;
			const linkInfo = getTypeLinkInfo(param.type);
			if (linkInfo) {
				const completions = await this.getPathCompletions(node.value, linkInfo.root, linkInfo.ext, linkInfo.qualifier);
				if (param.type === 'texture' && !node.value) Array.prototype.push.apply(completions, BuiltinTextures);
				return completions;
			}
			return [{ label: param.default! }];
		}
		
		if (part === KVPart.Query) {
			const completions: vscode.CompletionItem[] = [
				'$WIN32',
				'$X360',
				'$DECK'
			].map(label => ({ label }));
			return completions;
		}
	}

	async getPathCompletions(prefix: string, root: string, extension: string, qualifier?: string): Promise<vscode.CompletionItem[]> {
		const items = await getPathAutocomplete(prefix, root, qualifier);
		const filtered = items.filter(x => {
			const is_file = x.kind === vscode.CompletionItemKind.File;
			const is_type = (<string>x.label).endsWith(extension);
			if (is_file) x.insertText = (<string>x.label).slice(0, -extension.length);
			return !is_file || is_type;
		});
		return filtered;
	}
}

export class VmtLinkProvider implements vscode.DocumentLinkProvider {
	static register() {
		const inst = new this();
		const linkProvider = vscode.languages.registerDocumentLinkProvider({ language: 'sourcery.vmt' }, inst);
		const onDocClose = vscode.workspace.onDidCloseTextDocument(inst.onDidCloseTextDocument);

		return new vscode.Disposable(() => {
			linkProvider.dispose();
			onDocClose.dispose();
		});
	}

	onDidCloseTextDocument(document: vscode.TextDocument) {
		LINK_ERRORS.set(document.uri, undefined);
	}
	
	async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentLink[] | undefined> {
		const parsed = await keyValuesCache.parse(document, token);
		const config = vscode.workspace.getConfiguration('sourcery.vmt');

		const shader_node = parsed.tree.children[0];
		if (!shader_node || shader_node.type !== KVType.Dir) return;

		const schema = await VmtSchemaHandler.getSchema(shader_node.key);
		if (!schema) return;

		const errors: vscode.Diagnostic[] = [];
		const links: vscode.DocumentLink[] = [];

		for (const node of shader_node.children) {
			if (node.type !== KVType.Pair) continue;
			const param = schema[node.key.toLowerCase()];
			if (!param) continue;

			if (node.value === 'env_cubemap') continue;
			if (node.value.startsWith('_rt_')) continue;

			const linkInfo = getTypeLinkInfo(param.type);
			if (!linkInfo) continue;
			const range = new vscode.Range(document.positionAt(node.value_start), document.positionAt(node.value_end));
			const uri = this.uriFromValuePath(linkInfo, node.value);

			// Failed to find file?
			if (!await modFilesystem.gfs.stat(uri.path)) {
				if (config.get('warnModelPath')) {
					let link_match: RegExpMatchArray|null;
					if (link_match = node.value.match(RE_MODEL_PATH)) errors.push({
						severity: vscode.DiagnosticSeverity.Warning,
						message: `Did you mean "models/props${link_match[1]}/"?`,
						range, code: VmtActionCodes.FixModelPath
					});
				}

				if (config.get('warnNotFound')) errors.push({
					severity: vscode.DiagnosticSeverity.Warning,
					message: `Texture could not be found within game!`,
					range
				});
				continue;
			}

			links.push({ range, target: uri });
		}

		LINK_ERRORS.set(document.uri, errors);
		return links;
	}

	uriFromValuePath(linkInfo: TypeLinkInfo, value: string) {
		if (!value.endsWith(linkInfo.ext)) value += linkInfo.ext;
		value = linkInfo.root + value;
		value = value.replaceAll(/[\\\/]+/g, '/');
		return vscode.Uri.from({ scheme: 'mod', path: value });
	}
}

export class VmtCodeActionProvider implements vscode.CodeActionProvider {
	static register() {
		return vscode.languages.registerCodeActionsProvider({ language: 'sourcery.vmt' }, new this());
	}
	provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): (vscode.CodeAction | vscode.Command)[] {
		const actions = new Array<vscode.CodeAction>();
		for (const d of context.diagnostics) {
			if (d.code === VmtActionCodes.FixModelPath) {
				const edit = new vscode.WorkspaceEdit();
				const initial = new vscode.Range(d.range.start, d.range.start);
				edit.replace(document.uri, initial, 'models/');
				actions.push({
					title: "Prepend 'models/' to path",
					kind: vscode.CodeActionKind.QuickFix,
					edit: edit
				});
			}
		}
		return actions;
	}
}
