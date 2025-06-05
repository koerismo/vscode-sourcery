import * as vscode from 'vscode';
import { KeyValuesCache, KVHover, KVPairRanged, KVSetRanged, kvTokenLegend, KVType } from '../kv/kv-document.js';
import { outConsole } from '../extension.js';

interface VmtSchemaCase {
	if?: string;
	xif?: string;
	has?: string;
	xhas?: string;

	warn?: string;
	error?: string;
	info?: string;
	disable?: string;
}

type VmtParamType = 'int' | 'float' | 'color' | 'bool' | 'texture' | 'string' | 'vec2' | 'vec3' | 'vec4' | 'matrix' | 'fourcc' | 'material';

interface VmtSchemaProperty {
	type: VmtParamType;
	help?: string;
	default?: string;
	cases?: VmtSchemaCase[];
	required?: boolean;
}

interface VmtSchema {
	[param: string]: VmtSchemaProperty;
}

// function schema_initial_value(prop: VmtSchemaProperty, value: string): string[] | undefined {
// 	switch (prop.type) {
// 		case 'int': return ['1'];
// 		case 'float': return ['1.0'];
// 		case 'bool': return ['true', 'false'];
// 		case 'material':
// 		case 'texture': return ['"/"'];
// 		case 'string':	return ['""'];
// 		case 'vec2':
// 		case 'vec3':
// 		case 'vec4': return ['"[]"'];
// 		case 'color': return ['"[1.0 1.0 1.0]"'];
// 		case 'matrix': return ['"center .5 .5 scale 1 1 rotate 0 translate 0 0"'];
// 		default: return;
// 	}
// 	throw Error(`VmtSchema: Unexpected prop type "${prop.type}"!`);
// }

function is_truthy(v: string): boolean {
	return !(!v.length || v === 'false' || v === '0');
}

const testSchema: VmtSchema = {
	"$basetexture":				{ "type": "texture", "help": "This is the basetexture.", "default": "amogus/sus" },
	"$bumpmap":					{ "type": "texture", "help": "The bumpmap!", "cases": [{ "if": "$treesway", "warn": "$treesway will not work with bumpmaps!" }] },
	"$color":					{ "type": "color" },
	"$phong":					{ "type": "int", "cases": [{ "xif": "$bumpmap", "warn": "$phong will not work without a bumpmap!" }] },
	"$phongexponent":			{ "type": "int" },
	"$phongexponenttexture":	{ "type": "texture", "cases": [{ "if": "$phongexponent", "warn": "$phongexponent overrides this parameter!" }] },
	"$treesway":				{ "type": "bool" }
};

export class VmtSchemaHandler {
	static _recordUri?: vscode.Uri;
	static _record?: Record<string, VmtSchema>;

	static register(ctx: vscode.ExtensionContext) {
		this._recordUri = ctx.extensionUri.with({ path: ctx.extensionUri.path+'/public/assets/data/materials.dump.min.json' });
		outConsole.log('Using schema path ', this._recordUri.fsPath);
		return new vscode.Disposable(() => {
			if (this._record) delete this._record;
		});
	}

	static async _loadSchemaMap() {
		if (!this._record) {
			const startTime = performance.now();
			if (!this._recordUri) throw Error('VmtSchemaHandler not initialized!');
			const data = await vscode.workspace.fs.readFile(this._recordUri);
			const text = new TextDecoder('utf-8').decode(data);
			this._record = JSON.parse(text);
			const endTime = performance.now();
			outConsole.log(`Finished loading shader schemas in ${Math.round(endTime - startTime)}ms!`);
		}
		return this._record!;
	}

	static async getSchema(shader: string): Promise<VmtSchema | undefined> {
		const record = await this._loadSchemaMap();
		shader = shader.toLowerCase();
		if (shader in record) return record[shader];
		return;
	}
}

const SCHEMA_ERRORS = vscode.languages.createDiagnosticCollection('vmt-schema');

export class VmtSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	static register() {
		return vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcery.vmt' }, new this(), kvTokenLegend);
	}
	
	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const data = await KeyValuesCache.parse(document, token);

		const shader_kvs = data.tree.children[0];
		const shader_name = shader_kvs.key;

		// TODO: Schema validation should be done async!
		const schema = await VmtSchemaHandler.getSchema(shader_name);

		if (schema && shader_kvs.type === KVType.Dir) {
			this.validate_schema(document, shader_kvs, schema);
		}
		
		return data.tokens;
	}

	validate_schema_case(prop: VmtSchemaCase, key_map: Record<string, KVSetRanged | KVPairRanged>): boolean {
		const prop_if = (prop.if ?? prop.xif);
		const prop_has = (prop.has ?? prop.xhas);
		const prop_invert = ('xif' in prop || 'xhas' in prop);

		if (prop_if === undefined && prop_has === undefined) return false;
		const target = key_map[prop_if ?? prop_has!];
		
		let truthy = false;
		if (target) {
			if (prop_if) truthy = target.type === KVType.Pair ? is_truthy(target.value) : true;
			else if (prop_has) truthy = target !== undefined;
		}

		if (prop_invert) truthy = !truthy;
		return truthy;
	}

	validate_schema_type(prop: VmtSchemaProperty, value: string): boolean {
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
		let node = await KeyValuesCache.nodeAtOffset(document, token, offset);
		const part = KeyValuesCache.nodePartAtOffset(node, offset);
		
		const node_root = await KeyValuesCache.parse(document, token);
		const node_shader = node_root.tree.children[0];

		if (!node_shader) return;
		if (part !== KVHover.Key)
			return;

		const schema = await VmtSchemaHandler.getSchema(node_shader.key);
		if (!schema) return;

		const key = node.key.toLowerCase();
		if (key in schema) {
			const prop = schema[key];
			const contents = [];
			if (prop.help) contents.push('**'+key+'** - ' + prop.help);
			if (prop.default) contents.push('**Default** - '+prop.default);
			return { contents };
		}
	}
}