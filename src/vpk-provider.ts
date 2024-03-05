import * as path from 'path';
import * as vscode from 'vscode';
import { VpkReader, VpkFileInfo } from './vpk-io';

// function cleanPath(path: string): [string, string, string] {
// 	const m = path.match(RE_PATH);
// 	if (!m) return ['/', path, ''];
// 	if (!m[1].length) m[1] = '/';
// 	return [m[1], m[2], m[3]];
// }

export let vpkFileSystemProvider!: VpkFileSystemProvider;

export class VpkFileSystemProvider implements vscode.FileSystemProvider {
	cache: Record<string, VpkReader> = {};
	
	static register() {
		const editor = new this();
		vpkFileSystemProvider = editor;
		return vscode.workspace.registerFileSystemProvider('vpk', editor, { isReadonly: true, isCaseSensitive: false });
	}

	init(uri: vscode.Uri) {
		const vpk_path = this.getVpkPath(uri); //vscode.workspace.name ?? 'Untitled (Workspace)';
		const vpk_uri = uri.with({ path: vpk_path, scheme: 'file' });
		
		console.log(`Initiating VPK "${vpk_path}"...`);
		this.cache[vpk_path] = new VpkReader(vpk_uri);
		return vpk_path;
	}

	// Copied from
	// https://github.com/gitkraken/vscode-gitlens/blob/dd1280a6408abd58ea045a838921359964d5ae81/src/git/fsProvider.ts#L38C2-L41C3
	private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	getVpkAndSubPath(uri: vscode.Uri): [VpkReader, string] {
		const [vpk_path, subpath] = uri.path.split('.vpk');
		if (this.cache[vpk_path+'.vpk'] === undefined) this.init(uri);
		const vpk: VpkReader = this.cache[vpk_path+'.vpk'];
		return [vpk, subpath.startsWith('/') ? subpath : '/'+subpath];
	}

	getVpkPath(uri: vscode.Uri) {
		return uri.path.split('.vpk')[0]+'.vpk';
	}

	getVpk(uri: vscode.Uri) {
		const vpk_path = this.getVpkPath(uri);
		if (this.cache[vpk_path] === undefined) this.init(uri);
		return this.cache[vpk_path];
	}

	watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
		throw new Error('Method not implemented.');
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const [vpk, path] = this.getVpkAndSubPath(uri);
		const file = await vpk.getFileInfo(path);
		return { 
			ctime: 0,
			mtime: 0,
			size: 100,
			type: file ? vscode.FileType.File : vscode.FileType.Directory,
		};
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const [vpk, path] = this.getVpkAndSubPath(uri);
		const out = await vpk.readDirectory(path);

		// console.log(uri.toString(), 'Got', out);
		return out;
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const [vpk, path] = this.getVpkAndSubPath(uri);
		const out = await vpk.readFile(path);
		if (out === null) throw new Error('Failed to read file '+uri.path+'!');
		return out;
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	delete(uri: vscode.Uri, options: { readonly recursive: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	copy?(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}
}
