import * as vscode from 'vscode';
import { KeyValuesCache, KVPart, KVPairRanged, KVSetRanged, kvTokenLegend, KVType } from '../kv/kv-document.js';
import { outConsole } from '../extension.js';
import { getPathAutocomplete } from '../mod-mount.js';

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

interface VmtSchemaParam {
	type: VmtParamType;
	help?: string;
	default?: string;
	cases?: VmtSchemaCase[];
	required?: boolean;
}

interface VmtSchema {
	[param: string]: VmtSchemaParam;
}

function is_truthy(v: string): boolean {
	return !(!v.length || v === 'false' || v === '0');
}

const ShaderNames: Record<string, string> = {
	aftershock: 'Aftershock',
	black: 'Black',
	bloom: 'Bloom',
	core: 'Core',
	decalmodulate: 'DecalModulate',
	depthoffield: 'DepthOfField',
	depthwrite: 'DepthWrite',
	eyeglint: 'EyeGlint',
	eyerefract: 'EyeRefract',
	eyes: 'Eyes',
	introscreenspaceeffect: 'IntroScreenSpaceEffect',
	lightmapped_4wayblend: 'Lightmapped_4WayBlend',
	lightmappedgeneric: 'LightmappedGeneric',
	lightmappedreflective: 'LightmappedReflective',
	modulate: 'Modulate',
	monitorscreen: 'MonitorScreen',
	morphaccumulate: 'MorphAccumulate',
	morphweight: 'MorphWeight',
	motionblur: 'MotionBlur',
	paintblob: 'PaintBlob',
	pbr: 'PBR',
	portal: 'Portal',
	portalrefract: 'PortalRefract',
	portalstaticoverlay: 'PortalStaticOverlay',
	refract: 'Refract',
	screenspace_general: 'Screenspace_General',
	shadow: 'Shadow',
	shadowbuild: 'ShadowBuild',
	shadowmodel: 'ShadowModel',
	shatteredglass: 'ShatteredGlass',
	showz: 'ShowZ',
	sky_hdr: 'Sky_HDR',
	sky_sdr: 'Sky_SDR',
	solidenergy: 'SolidEnergy',
	splinerope: 'SplineRope',
	sprite: 'Sprite',
	spritecard: 'Spritecard',
	teeth: 'Teeth',
	unlitgeneric: 'UnlitGeneric',
	unlittwotexture: 'UnlitTwoTexture',
	vertexlitgeneric: 'VertexLitGeneric',
	videosurface: 'VideoSurface',
	volumeclouds: 'VolumeClouds',
	water: 'Water',
	windowimposter: 'WindowImposter',
	wireframe: 'Wireframe',
	worldimposter: 'WorldImposter',
	worldtwotextureblend: 'WorldTwoTextureBlend',
	worldvertextransition: 'WorldVertexTransition',
	writestencil: 'WriteStencil',
	writez: 'WriteZ',
};

const CompilerParamSchema: VmtSchema = {
	'%tooltexture': { type: 'texture' },
	'%keywords': { type: 'string' },
	'%CompileBlockLOS': { type: 'bool' },
	'%CompileClip': { type: 'bool' },
	'%CompileDetail': { type: 'bool' },
	'%CompileLadder': { type: 'bool' },
	'%CompileNoDraw': { type: 'bool' },
	'%CompileNoLight': { type: 'bool' },
	'%CompileNonSolid': { type: 'bool' },
	'%CompileNPCClip': { type: 'bool' },
	'%CompilePassBullets': { type: 'bool' },
	'%CompileSkip': { type: 'bool' },
	'%CompileSlime': { type: 'bool' },
	'%CompileTeam': { type: 'bool' },
	'%CompileTrigger': { type: 'bool' },
	'%CompileWater': { type: 'bool' },
	'%PlayerClip': { type: 'bool' },
};

export class VmtSchemaHandler {
	static _recordUri?: vscode.Uri;
	static _record?: Record<string, VmtSchema>;

	static register(ctx: vscode.ExtensionContext) {
		this._recordUri = ctx.extensionUri.with({ path: ctx.extensionUri.path+'/public/assets/data/materials-strata.min.json' });
		return new vscode.Disposable(() => {
			if (this._record) delete this._record;
		});
	}

	static async _loadSchemaMap(): Promise<Record<string, VmtSchema>> {
		if (!this._record) {
			const startTime = performance.now();
			if (!this._recordUri) throw Error('VmtSchemaHandler not initialized!');
			try {
				const data = await vscode.workspace.fs.readFile(this._recordUri);
				const text = new TextDecoder('utf-8').decode(data);
				this._record = JSON.parse(text);
				const endTime = performance.now();
				outConsole.log(`Finished loading shader schemas in ${Math.round(endTime - startTime)}ms!`);
			}
			catch (e) {
				outConsole.error(`Failed to load Vmt schemas!`, e);
			}
		}
		return this._record!;
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

	static async getShaderList(): Promise<string[]> {
		const record = await this._tryLoadSchemaMap();
		return Object.keys(record).map(x => ShaderNames[x]);
	}
}

const SCHEMA_ERRORS = vscode.languages.createDiagnosticCollection('vmt-schema');

export class VmtSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	static register() {
		return vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcery.vmt' }, new this(), kvTokenLegend);
	}
	
	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const parsed = await KeyValuesCache.parse(document, token);

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
			if (prop_if) truthy = target.type === KVType.Pair ? is_truthy(target.value) : true;
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
		const node = await KeyValuesCache.nodeAtOffset(document, token, offset);
		const part = KeyValuesCache.nodePartAtOffset(node, offset);

		const parsed = await KeyValuesCache.parse(document, token);
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

export class VmtCompletionProvider implements vscode.CompletionItemProvider {
	static register() {
		return vscode.languages.registerCompletionItemProvider({ language: 'sourcery.vmt' }, new this(), '$', '%', '"', '/', '[');
	}

	async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | undefined> {
		const offset = document.offsetAt(position);
		const node = await KeyValuesCache.nodeAtOffset(document, token, offset);
		const part = KeyValuesCache.nodePartAtCursor(node, offset);
		
		const node_root = await KeyValuesCache.parse(document, token);
		const node_shader = node_root.tree.children[0];

		if (node === node_shader && part === KVPart.Key) {
			const shaderList = await VmtSchemaHandler.getShaderList();
			const completions: vscode.CompletionItem[] = shaderList.map(x => ({ label: x }));
			return completions;
		}

		if (node_shader.type !== KVType.Dir) return;
		if (node.type !== KVType.Pair) return;

		const schema = await VmtSchemaHandler.getSchema(node_shader.key);
		if (!schema) return;

		if (part === KVPart.Key) {
			const completions: vscode.CompletionItem[] = [];
			for (const key in schema) {
				if (!key.startsWith(node.key)) continue;
				const slice1 = !!context.triggerCharacter && node.key.startsWith(context.triggerCharacter);
				completions.push({ label: key, insertText: (slice1 ? key.slice(1) : key), detail: schema[key].help });
			}
			return completions;
		}
		
		if (part === KVPart.Value) {
			const param = schema[node.key];
			if (!param) return;
			if (param.type === 'texture' || param.type === 'material') {
				return this.getPathCompletions(node.value);
			}
			return [{ label: param.default! }];
		}
		
		if (part === KVPart.Query) {
			const completions: vscode.CompletionItem[] = [
				'$WIN32',
				'$X360',
				'$DECK'
			].map(x => ({ label: x }));
			return completions;
		}
	}

	async getPathCompletions(prefix: string, root: string='materials/', extension: string='.vtf'): Promise<vscode.CompletionItem[]> {
		const items = await getPathAutocomplete(prefix, root);
		const filtered = items.filter(x => {
			const is_file = x.kind === vscode.CompletionItemKind.File;
			const is_vtf = (<string>x.label).endsWith(extension);
			if (is_file) x.insertText = (<string>x.label).slice(0, -4);
			return !is_file || is_vtf;
		});
		return filtered;
	}
}

export class VmtLinkProvider implements vscode.DocumentLinkProvider {
	async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentLink[] | undefined> {
		const links: vscode.DocumentLink[] = [];
		
		const parsed = await KeyValuesCache.parse(document, token);
		
		const shader_node = parsed.tree.children[0];
		if (!shader_node || shader_node.type !== KVType.Dir) return;
		const schema = await VmtSchemaHandler.getSchema(shader_node.key);
		if (!schema) return;

		for (const child of shader_node.children) {
			if (child.type !== KVType.Pair) continue;
			if (child.key in schema) {

			}
		}

		return links;
	}
}