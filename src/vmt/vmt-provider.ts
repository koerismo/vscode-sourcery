import * as vscode from 'vscode';
import { modFilesystem, getPathAutocomplete } from '../mod-mount.js';
import { outConsole } from '../extension.js';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { extname, dirname, basename, join, relative, sep } from 'path';
import * as decodeImage from 'image-decode';
import { Vtf, VFilters, VFlags, VFormats, VImageData, VMipmapProvider, VDataCollection } from 'vtf-js';
import { platform } from 'os';

const RE_SLASH = /(\/|\\)+/g;
const RE_LINE_ONLYKEY = /^\s*("?)([$%][^"\s]+)\1\s*\"?$/;
const RE_LINE_START = /^\s*("?)([$%][^"\s]+)\1\s+(?:"?)([^"\s]*)/;
const RE_LINE = /^\s*("?)([$%][^"\s]+)\1\s+("?)([^"\s]*)\3/;
const RE_MODEL_PATH = /^(?:\/|\\)?props?(_\w+)?(?:\/|\\)/;

const RE_PATH_SPLIT = /(?:\s)(\w\:\\|\/)/g;
function splitPaths(paths: string): string[] {
	return paths.replace(RE_PATH_SPLIT, '\n$1').split('\n');
}

const RE_TEX_ALPHA = /(_a|alpha|mask|_exp|exponent|envmap)\..+$/i;
const RE_TEX_METAL = /(metal|metallic)\..+$/i;
const RE_TEX_ROUGH = /(rough|roughness)\..+$/i;
const RE_TEX_AO = /(ao|occlusion|occ)\..+$/i;

const VTF_CONVERT_OPTIONS = {
	filter: VFilters.Triangle,
};
const VTF_RESIZE_OPTIONS = {
	filter: VFilters.Triangle
};

const IMAGE_EXTS = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.jfif',
	'.webp',
	'.tga',
	'.vtf',
]);

const LINKABLE = new Set([
	'$basetexture',
	'$basetexture2',
	'$bumpmap',
	'$bumpmap2',
	'$mraotexture',
	'$normalmap',
	'$phongexponenttexture',
	'$envmap',
	'$envmapmask',
	'$detail',
	'$lightwarptexture',
	'$parallaxmap',
	'$wrinkle',
	'$stretch',
	'$refracttexture',
	
	'$texture1',
	'$texture2',
	'$texture3',

	'%tooltexture',

	// Subrect shader exclusive?
	'$material',
]);

const POSTFIX = {
	'$basetexture': '_albedo',
	'$basetexture2': '_albedo2',
	'$bumpmap': '_bump',
	'$bumpmap2': '_bump2',
	'$mraotexture': '_mrao',
	'$normalmap': '_nrm',
	'$phongexponenttexture': '_exp',
	'$envmap': '_envmap',
	'$envmapmask': '_envmask',
	'$detail': '_detail',
	'$lightwarptexture': '_lightwarp',
	'$parallaxmap': '_parallax',
	'$wrinkle': '_wrinkle',
	'$stretch': '_stretch',
	'$refracttexture': '_refract',
	
	'$texture1': '_tex1',
	'$texture2': '_tex2',
	'$texture3': '_tex3',

	'%tooltexture': '_preview',

	// Subrect shader exclusive?
	'$material': '',
};

const RT_TEXTURES: vscode.CompletionItem[] = [
	'_rt_PowerOfTwoFB',
	'_rt_Fullscreen',
	'_rt_Camera',
	'_rt_FullFrameDepth',
	'_rt_FullFrameFB',
	'_rt_WaterReflection',
	'_rt_WaterRefraction',
	'_rt_SmallHDR0',
	'_rt_SmallHDR1',
	'_rt_SmallFB0',
	'_rt_SmallFB1',
	'_rt_TeenyFB%d',
].map(x => <vscode.CompletionItem>{ label: x, kind: vscode.CompletionItemKind.Variable, sortText: '\xff'+x });

export enum ActionCodes {
	UNKNOWN,
	FIX_MODEL_PATH,
	UPLOAD_TEXTURE,
}

interface VmtDocumentLink extends vscode.DocumentLink {
	key: string;
	value: string;
	value_range: vscode.Range;
}

// function removeFileSuffix(s: string) {
// 	const dotpos = s.lastIndexOf('.');
// 	if (dotpos === -1) return s;
// 	return s.slice(0, dotpos);
// }

function getLineLink(line: string, line_index: number, acceptable: Set<string>, root: vscode.Uri, suffix: string=''): VmtDocumentLink|null {
	const match = line.match(RE_LINE);
	if (!match) return null;
	if (!acceptable.has(match[2].toLowerCase())) return null;

	const char_start = line.length - match[4].length - match[3].length;
	const char_end = line.length - match[3].length;
	const range = new vscode.Range(new vscode.Position(line_index, char_start), new vscode.Position(line_index, char_end));

	let path = (root.path + '/' + match[4]).replace(RE_SLASH, '/');
	if (suffix && !path.endsWith(suffix)) path += suffix;
	const target = root.with({ path });

	return { range, target, key: match[2], value: match[4], value_range: range };
}

export class VmtLinkProvider implements vscode.DocumentLinkProvider<VmtDocumentLink> {
	readonly diagnostics: vscode.DiagnosticCollection;
	private registry!: vscode.Disposable;

	constructor() {
		this.diagnostics = vscode.languages.createDiagnosticCollection('sourcery.vmt');
	}

	static register(): vscode.Disposable {
		const editor = new this();
		editor.registry = vscode.languages.registerDocumentLinkProvider({ language: 'vmt' }, editor);
		return editor;
	}

	dispose() {
		this.diagnostics.dispose();
		this.registry.dispose();
	}
	
	async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<VmtDocumentLink[]> {
		const text = document.getText();
		const lines = text.split('\n');
		const links: VmtDocumentLink[] = [];
		const config = vscode.workspace.getConfiguration('sourcery.vmt', document.uri);
		
		const diagnostics: vscode.Diagnostic[] = [];
		this.diagnostics.clear();
		const root: vscode.Uri = vscode.Uri.from({ scheme: 'mod', path: '/materials' });

		for (let i=0; i<lines.length; i++) {
			const line = lines[i];
			const link = getLineLink(line, i, LINKABLE, root, '.vtf');
		
			if (link) {
				if (link.value === 'env_cubemap') continue;
				if (link.value.startsWith('_rt_')) continue;

				if (config.get('modelPath')) {
					let link_match: RegExpMatchArray|null;
					if (link_match = link.value.match(RE_MODEL_PATH)) diagnostics.push({
						severity: vscode.DiagnosticSeverity.Warning,
						message: `Did you mean "models/props${link_match[1]}/"?`,
						range: link.value_range,
						code: ActionCodes.FIX_MODEL_PATH
					});
				}

				if (!await modFilesystem.gfs.stat(link.target!.path.toLowerCase())) {
					if (config.get('notFound')) diagnostics.push({
						severity: vscode.DiagnosticSeverity.Warning,
						message: `Texture could not be found within game!`,
						range: link.value_range
					});
					continue;
				}

				links.push(link);
			}
		}

		this.diagnostics.set(document.uri, diagnostics);
		return links;
	}
}

export class VmtAutocompleteProvider implements vscode.CompletionItemProvider {
	static register(context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.languages.registerCompletionItemProvider({ language: 'vmt' }, new this(), '/', '"');
	}

	async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
		const line = document.getText(new vscode.Range( position.with({ character: 0 }), position ));
		
		const inside_quote = line.match(RE_LINE_START);
		if (!inside_quote) return [];
		if (!LINKABLE.has(inside_quote[2].toLowerCase())) return [];
		const current_path = inside_quote[3];

		const items = await getPathAutocomplete(current_path, 'materials/');
		const filtered = items.filter(x => {
			const is_file = x.kind === vscode.CompletionItemKind.File;
			const is_vtf = (<string>x.label).endsWith('.vtf');
			if (is_file) x.insertText = (<string>x.label).slice(0, -4);
			return !is_file || is_vtf;
		});

		if (!current_path) return filtered.concat(RT_TEXTURES);
		return filtered;
	}
}

export class VmtCodeActionProvider implements vscode.CodeActionProvider {
	static register(context: vscode.ExtensionContext) {
		return vscode.languages.registerCodeActionsProvider({ language: 'vmt' }, new this());
	}
	
	provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		const diagnostics = context.diagnostics;
		const out = new Array<vscode.CodeAction>();
		for (const d of diagnostics) {
			if (d.code === ActionCodes.FIX_MODEL_PATH) {
				const edit = new vscode.WorkspaceEdit();
				const initial = new vscode.Range(d.range.start, d.range.start);
				edit.replace(document.uri, initial, 'models/');
				out.push({
					title: "Prepend 'models/' to path",
					kind: vscode.CodeActionKind.QuickFix,
					edit: edit
				});
			}
		}
		return out;
	}
}

async function askToDowngrade(skip: boolean=false) {
	if (skip) return true;
	const response = await vscode.window.showWarningMessage('Vtf may not be compatible with current game! Downgrade?', 'Yes', 'No');
	return response === 'Yes';
}

function generateToolTexture(textures: VImageData[]) {
	if (textures.length === 1) return textures[0].convert(<typeof Uint8Array><unknown>Uint8ClampedArray);
	
	const width = textures[0].width;
	const height = textures[0].height;
	for (let i=1; i<textures.length; i++) {
		if (textures[i].width !== width || textures[i].height !== height) {
			outConsole.error('Dimensions between provided textures do not match!');
			return null;
		}
		textures[i] = textures[i].convert(Uint8Array);
	}
	
	const angleSlope = -1; // -0.5; // X/Y
	const yMid = height / 2;
	const xMid = width / 2;

	const texAtPos = (x: number, y: number) => {
		return +((y-yMid)*angleSlope + xMid < x);
	};

	// Clamp the array, so if we NICE resize it then we won't get artifacts
	const data = new Uint8ClampedArray(width * height * 4);
	const out = new VImageData(<Uint8Array><unknown>data, width, height);

	let p = 0;
	for (let i=0; i<data.length; i+=4) {
		const x = p % width;
		const y = ((p - x) / width);
		const tex = textures[texAtPos(x, y)].data;
		data[i] = tex[i];
		data[i+1] = tex[i+1];
		data[i+2] = tex[i+2];
		data[i+3] = tex[i+3];
		p++;
	}

	return out;
}

function resizeIfNeeded<T extends VImageData>(texture: T, max_size: number): T {
	if (texture.width <= max_size && texture.height <= max_size) return texture;
	const scale_factor = max_size / Math.max(texture.width, texture.height);
	const new_width = texture.width * scale_factor;
	const new_height = texture.height * scale_factor;
	return texture.resize(new_width, new_height, VTF_RESIZE_OPTIONS) as T;
}

async function convertToVtf(path: string, idealVersion: 1|2|3|4|5|6, idealFormat: VFormats, idealFormatAlpha: VFormats, requireDecode: boolean, requireEncode: boolean, skipDGAsk?: boolean): Promise<{ vtf: Vtf|null, out: ArrayBuffer|null }>;
async function convertToVtf(path: string, idealVersion: 1|2|3|4|5|6, idealFormat: VFormats, idealFormatAlpha: VFormats, requireDecode: true, requireEncode: true, skipDGAsk?: boolean): Promise<{ vtf: Vtf, out: ArrayBuffer }>;
async function convertToVtf(path: string, idealVersion: 1|2|3|4|5|6, idealFormat: VFormats, idealFormatAlpha: VFormats, requireDecode: boolean, requireEncode: true, skipDGAsk?: boolean): Promise<{ vtf: Vtf|null, out: ArrayBuffer }>;
async function convertToVtf(path: string, idealVersion: 1|2|3|4|5|6, idealFormat: VFormats, idealFormatAlpha: VFormats, requireDecode: true, requireEncode: boolean, skipDGAsk?: boolean): Promise<{ vtf: Vtf, out: ArrayBuffer|null }>;
async function convertToVtf(path: string, idealVersion: 1|2|3|4|5|6, idealFormat: VFormats, idealFormatAlpha: VFormats, requireDecode: boolean=false, requireEncode: boolean=false, skipDGAsk: boolean=false): Promise<{ vtf: Vtf|null, out: ArrayBuffer|null }> {
	const buffer = (await readFile(path)).buffer;
	const ext = extname(path);
	
	let vtf: Vtf|null = null;
	let vtfout: ArrayBuffer|null = null;
	
	if (ext === '.vtf') {
		vtf = Vtf.decode(buffer, false, true);
		if (vtf.version <= idealVersion || !(await askToDowngrade(skipDGAsk))) vtfout = buffer;
		else {
			vtf.version = idealVersion;
			if (requireEncode) vtfout = vtf.encode();
		}
	}

	else {
		// TODO: This decoder is currently a BAD bottleneck on perf. What do??
		const image = decodeImage(buffer);
		let has_alpha = false;
		for (let i=3; i<image.data.length; i+=4) {
			if (image.data[i] === 255) continue;
			has_alpha = true;
			break;
		}
		const vcollection = new VMipmapProvider([[[new VImageData(image.data, image.width, image.height)]]], VTF_CONVERT_OPTIONS);
		vtf = new Vtf(vcollection, {
			version: idealVersion,
			compression: idealVersion === 6 ? 5 : 0,
			format: has_alpha ? idealFormatAlpha : idealFormat,
			flags: has_alpha ? VFlags.EightBitAlpha : 0
		});
		if (requireEncode) vtfout = vtf.encode();
	}

	return { vtf, out: vtfout };
}

export class VmtChangeListener {
	static register(context: vscode.ExtensionContext) {
		// const changeListener = vscode.workspace.onDidChangeTextDocument(this.handleDocumentUpdate.bind(this));
		// return new vscode.Disposable(() => {
		// 	changeListener.dispose();
		// });
		return vscode.workspace.onDidChangeTextDocument(this.handleDocumentUpdate.bind(this));
	}

	static async handleDocumentUpdate(event: vscode.TextDocumentChangeEvent) {
			if (!modFilesystem.isReady()) return; // Ignore if no game is active

			if (!event.document.uri.path.endsWith('.vmt')) return;
			if (event.reason === 1 || event.reason === 2) return; // Ignore undo/redo event
			if (event.contentChanges.length !== 1) return; // Something weird is happening that isn't a text insert
			const config = vscode.workspace.getConfiguration('sourcery.vmt', event.document.uri);
			if (!config.get('convertOnPaste')) return; // This feature is disabled.
			
			// On text insert
			const change = event.contentChanges[0];
			if (change.text.length <= 3) return;
			if (change.text[0] !== sep && change.text[2] !== sep) return;

			// Get key
			const linerange = new vscode.Range(change.range.start.with({ character: 0 }), change.range.start);
			const linematch = event.document.getText(linerange).match(RE_LINE_ONLYKEY);
			if (!linematch) return;
			const key = linematch[2] as (keyof typeof POSTFIX);
			if (!(key in POSTFIX)) return;
			outConsole.log('Using key', key, 'for conversion.');
			
			// Special case: Allow any # of textures for tooltextures.
			const is_tooltexture = key === '%tooltexture';

			// Get new Vtf path
			const dir = dirname(event.document.uri.path);
			let new_path = join( dir, basename(event.document.uri.path, '.vmt') + POSTFIX[key] + '.vtf');
			if (platform() === 'win32' && new_path.startsWith('\\')) new_path = new_path.slice(1);
			const new_name = relative(join(modFilesystem.gfs.modroot, 'materials'), new_path.slice(0, -4)).replaceAll('\\', '/');

			if (!config.get('convertOnPasteOverwrite') && existsSync(new_path)) return outConsole.log('Ignoring paste. File already exists with the same name!');

			// Extract paths
			const paths_lines_split = change.text.split('\n');
			const paths_split = change.text.includes('\n') ? paths_lines_split : splitPaths(change.text);
			if (paths_split.length > 3 && !is_tooltexture) return;

			let path_color = paths_split[0];
			let path_alpha = paths_split[1];
			let paths_mrao: [string, string, string] | null = null;

			// Make sure that the paths are ordered correctly
			if (is_tooltexture) {
				// Do nothing :3
			}
			else if (paths_split.length === 2) {
				const is_0_alpha = RE_TEX_ALPHA.test(paths_split[0]);
				if (is_0_alpha) {
					path_color = paths_split[1];
					path_alpha = paths_split[0];
				}
			}
			else if (paths_split.length === 3) {
				// Match MRAO textures to their proper slots.
				let failcount = 0;
				let tex_m:  string|null = null;
				let tex_r:  string|null = null;
				let tex_ao: string|null = null;
				for (const p of paths_split) {
					if (!tex_m && RE_TEX_METAL.test(p)) tex_m = p;
					else if (!tex_r && RE_TEX_ROUGH.test(p)) tex_r = p;
					else if (!tex_ao && RE_TEX_AO.test(p)) tex_ao = p;
					else {
						failcount++;
						if (!tex_m) tex_m = p;
						else if (!tex_r) tex_r = p;
						else tex_ao = p;
					}
				}
				if (failcount < 2)
					paths_mrao = [tex_m!, tex_r!, tex_ao!];
			}

			// Are we gonna have to do extra work?
			const using_alpha = paths_split.length === 2 && !!path_alpha;
			const using_mrao = key === '$mraotexture' && !!paths_mrao;

			if (paths_split.length > 1 && !using_alpha && !using_mrao) return outConsole.log('Failed to match textures to any format!');

			// Match ideal format
			let ideal_format: VFormats;
			let ideal_format_alpha: VFormats;
			switch (key) {
				case '$bumpmap':
				case '$bumpmap2':
				case '$mraotexture':
					ideal_format = VFormats.BGR888;
					ideal_format_alpha = VFormats.BGRA8888;
					break;
				default:
					ideal_format = VFormats.DXT1;
					ideal_format_alpha = VFormats.DXT5;
					break;
			}

			// Match ideal vtf version
			let ideal_version: 1|2|3|4|5|6;
			switch (modFilesystem.gfs?.appid) {
				case '440000':
				case '669270':
					ideal_version = 6;
					break;
				case '620':
				case '730':
					ideal_version = 5;
					break;
				default:
					ideal_version = 3;
			}

			// Analyze inputs
			const ext = extname(path_color).toLowerCase();
			if (!IMAGE_EXTS.has(ext)) return outConsole.log('VMT: Ignoring unsupported extension');
			if (!existsSync(path_color)) return;
			if (path_alpha) {
				const ext_alpha = extname(path_alpha).toLowerCase();
				if (!IMAGE_EXTS.has(ext_alpha)) return outConsole.log('VMT: Ignoring unsupported alpha extension');
				if (!existsSync(path_alpha)) return;
			}
			
			// ======== PROCESS IMAGE(S) ==========

			const max_size: number = config.get('convertOnPasteResize') ?? 0;

			let vtf: Vtf;
			let vtf_out: ArrayBuffer;
			if (is_tooltexture) {
				const vtfs = await Promise.all(paths_split.map(x => convertToVtf(x, ideal_version, ideal_format, ideal_format, true, false, true)));
				let vimage = generateToolTexture(vtfs.map(x => x.vtf.data.getImage(0, 0, 0, 0)));
				if (!vimage) return;
				
				const max_size_tt: number = config.get('convertOnPasteResizeTooltexture') ?? 0;
				if (max_size_tt !== 0) {
					vimage = resizeIfNeeded(vimage, max_size_tt);
				}
				
				const vcollection = new VDataCollection([[[[vimage]]]]);
				vtf = new Vtf(vcollection, {
					format: ideal_format,
					version: ideal_version,
					compression: ideal_version === 6 ? 6 : 0,
				});

				vtf_out = vtf.encode();
			}
			else if (using_alpha) {
				outConsole.log('Attempting to merge alpha textures...');
				const converted_color = await convertToVtf(path_color, ideal_version, ideal_format, ideal_format_alpha, true, false, true);
				const converted_alpha = await convertToVtf(path_alpha, ideal_version, ideal_format, ideal_format_alpha, true, false, true);
				let im_color = converted_color.vtf.data.getImage(0, 0, 0, 0);
				const im_alpha = converted_alpha.vtf.data.getImage(0, 0, 0, 0);
				if (im_color.width !== im_alpha.width || im_color.height !== im_alpha.height) {
					vscode.window.showErrorMessage('Failed to merge textures! The pasted textures must be the same size to merge.');
					return;
				}
				
				// Copy alpha over
				for (let i=0; i<im_color.data.length; i+=4) {
					im_color.data[i+3] = im_alpha.data[i];
				}

				// Resize if necessary
				if (max_size !== 0) {
					im_color = resizeIfNeeded(im_color, max_size);
				}
				
				const vcollection = new VMipmapProvider([[[im_color]]], VTF_CONVERT_OPTIONS);
				vtf = new Vtf(vcollection, converted_color.vtf);
				vtf.format = ideal_format_alpha;
				vtf_out = vtf.encode();
			}
			else if (using_mrao) {
				outConsole.log('Attempting to merge MRAO textures...');
				const converted = await Promise.all([
					await convertToVtf(paths_mrao![0], ideal_version, ideal_format, ideal_format_alpha, true, false, true),
					await convertToVtf(paths_mrao![1], ideal_version, ideal_format, ideal_format_alpha, true, false, true),
					await convertToVtf(paths_mrao![2], ideal_version, ideal_format, ideal_format_alpha, true, false, true),
				]);

				// Test for equal dimensions
				const images = converted.map(x => x.vtf.data.getImage(0,0,0,0));
				let target = images[0];
				if (target.width !== images[1].width || target.width !== images[2].width || target.height !== images[1].height || target.height !== images[2].height) {
					vscode.window.showErrorMessage('Failed to merge textures! The pasted textures must be the same size to merge.');
					return;
				}

				// Copy mrao over
				for (let i=0; i<target.data.length; i+=4) {
					target.data[i+1] = images[1].data[i];
					target.data[i+2] = images[2].data[i];
				}

				// Resize if necessary
				if (max_size !== 0) {
					target = resizeIfNeeded(target, max_size);
				}

				// Encode
				const vcollection = new VMipmapProvider([[[target]]], VTF_CONVERT_OPTIONS);
				vtf = new Vtf(vcollection, converted[0].vtf);
				vtf.format = ideal_format;
				vtf_out = vtf.encode();
			}
			else {
				const conv_color = await convertToVtf(path_color, ideal_version, ideal_format, ideal_format_alpha, true, true);
				vtf = conv_color.vtf;
				vtf_out = conv_color.out;
			}

			outConsole.log('Finished!');

			// =====================================

			// This stupid fucking bit determines the range that was pasted into the document.
			const target_line = change.range.start.line + paths_lines_split.length - 1;
			let target_char = paths_lines_split[paths_lines_split.length-1].length;
			if (target_line === change.range.start.line) target_char += change.range.end.character;
			const paste_range = change.range.with(change.range.start, new vscode.Position(target_line, target_char));

			if (is_tooltexture) vscode.window.showInformationMessage('Updated %tooltexture texture automagically!');
			else if (using_alpha) vscode.window.showInformationMessage('Updated alpha-masked texture automagically!');
			else if (using_mrao) vscode.window.showInformationMessage('Updated MRAO texture automagically!');
			else vscode.window.showInformationMessage('Updated texture automagically!');
			
			// Write file
			outConsole.log(`Vtf information: version=${vtf.version}, format=${VFormats[vtf.format]}, compression=${vtf.compression}`);
			outConsole.log('Saving Vtf to', new_path);
			vscode.workspace.fs.writeFile(vscode.Uri.file(new_path), new Uint8Array(vtf_out));
			vscode.window.activeTextEditor?.edit(editor => {
				editor.replace(paste_range, new_name);
			});
	}
}
