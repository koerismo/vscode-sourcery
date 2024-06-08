import * as vscode from 'vscode';

const RE_SLASH = /(\/|\\)+/g;
const RE_LINE = /^\s*("?)(\$[^"]+)\1\s+("?)([^"]+)\3/;
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
	
	'$texture1',
	'$texture2',
	'$texture3',

	// Subrect shader exclusive?
	'$material',
]);

interface VmtDocumentLink extends vscode.DocumentLink {
	key: string;
	value: string;
	value_range: vscode.Range;
}

function getLineLink(line: string, line_index: number, acceptable: Set<string>, root: vscode.Uri, suffix: string=''): VmtDocumentLink|null {
	const match = line.match(RE_LINE);
	if (!match) return null;
	if (!acceptable.has(match[2].toLowerCase())) return null;

	const char_start = line.length - match[3].length * 2 - match[4].length;
	const char_end = line.length - match[3].length - 1;
	const range = new vscode.Range(new vscode.Position(line_index, char_start), new vscode.Position(line_index, char_end));

	let path = root.path + '/' + match[4].replace(RE_SLASH, '/');
	if (suffix && !path.endsWith(suffix)) path += suffix;
	const target = root.with({ path });

	return { range, target, key: match[2], value: match[4], value_range: range };
}

export class VmtLinkProvider implements vscode.DocumentLinkProvider {
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
	
	provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
		const text = document.getText();
		const lines = text.split('\n');
		const links: vscode.DocumentLink[] = [];
		
		const diagnostics: vscode.Diagnostic[] = [];
		this.diagnostics.clear();

		// if (document.uri.scheme !== 'vpk') return null;
		const root: vscode.Uri = vscode.Uri.from({ scheme: 'mod', path: '/materials' });
		// if (document.uri.scheme === 'vpk') root = document.uri.with({ path: document.uri.path.split('.vpk', 1)[0]+'.vpk/materials' });
		// else root = vscode.Uri.from({ scheme: 'game', path: '/' });

		for (let i=0; i<lines.length; i++) {
			const line = lines[i];
			if (!line.includes('$')) continue;
			const link = getLineLink(line, i, LINKABLE, root, '.vtf');
		
			if (link) {
				if (link.value === 'env_cubemap') continue;

				let link_match: RegExpMatchArray|null;
				if (link_match = link.value.match(RE_MODEL_PATH)) diagnostics.push({
					severity: vscode.DiagnosticSeverity.Warning,
					message: `Did you mean "models/props${link_match[1]}/"?`,
					range: link.value_range,
				});

				links.push(link);
			}
		}

		this.diagnostics.set(document.uri, diagnostics);
		return links;
	}
}
