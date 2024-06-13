import * as vscode from 'vscode';
import { modFilesystem, getPathAutocomplete } from './mod-mount.js';

const RE_SLASH = /(\/|\\)+/g;
const RE_LINE_START = /^\s*("?)(\$[^"\s]+)\1\s+(?:"?)([^"\s]*)/;
const RE_LINE = /^\s*("?)(\$[^"\s]+)\1\s+("?)([^"\s]*)\3/;
const RE_MODEL_PATH = /^(?:\/|\\)?props?(_\w+)?(?:\/|\\)/;

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

	// Subrect shader exclusive?
	'$material',
]);

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

	let path = root.path + '/' + match[4].replace(RE_SLASH, '/');
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
		editor.registry = vscode.languages.registerDocumentLinkProvider({ pattern: '**/*.vmt' }, editor);
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
			if (!line.includes('$')) continue;
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

				if (!await modFilesystem.gfs.stat(link.target!.path)) {
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
