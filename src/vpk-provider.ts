import * as path from 'path';
import * as vscode from 'vscode';
import { VpkSystem } from 'sfs-js';
import { VSCodeSystem } from 'sfs-js/dist/fs.vsc.js';
import { modFilesystem } from './mod-mount';

// function cleanPath(path: string): [string, string, string] {
// 	const m = path.match(RE_PATH);
// 	if (!m) return ['/', path, ''];
// 	if (!m[1].length) m[1] = '/';
// 	return [m[1], m[2], m[3]];
// }

export let vpkFileSystemProvider!: VpkFileSystemProvider;

const vfs = new VSCodeSystem();

export class VpkFileSystemProvider implements vscode.FileSystemProvider {
	cache: Record<string, VpkSystem> = {};
	
	static register() {
		const editor = new this();
		vpkFileSystemProvider = editor;
		return vscode.workspace.registerFileSystemProvider('vpk', editor, { isReadonly: true, isCaseSensitive: false });
	}

	init(uri: vscode.Uri) {
		const vpk_path = this.getVpkPath(uri);
		
		for (const provider of modFilesystem.gfs.providers) {
			if (!(provider instanceof VpkSystem) || provider.getPath('') !== vpk_path) continue;
			console.log('Vpk already loaded by active mod. Reusing!');
			this.cache[vpk_path] = provider;
			return vpk_path;
		}

		this.cache[vpk_path] = new VpkSystem(vfs, vpk_path);
		return vpk_path;
	}

	// Copied from
	// https://github.com/gitkraken/vscode-gitlens/blob/dd1280a6408abd58ea045a838921359964d5ae81/src/git/fsProvider.ts#L38C2-L41C3
	private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	getVpkAndSubPath(uri: vscode.Uri): [VpkSystem, string] {
		const [vpk_path, subpath] = uri.path.split('.vpk');
		if (this.cache[vpk_path+'.vpk'] === undefined) this.init(uri);
		const vpk: VpkSystem = this.cache[vpk_path+'.vpk'];
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
		const file = await vpk.stat(path);
		return file!;
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const [vpk, path] = this.getVpkAndSubPath(uri);
		const out = await vpk.readDirectory(path);

		// console.log(uri.toString(), 'Got', out);
		return out!;
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const [vpk, path] = this.getVpkAndSubPath(uri);
		const out = await vpk.readFile(path);
		if (out === undefined) throw new Error('Failed to read file '+uri.path+'!');
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
