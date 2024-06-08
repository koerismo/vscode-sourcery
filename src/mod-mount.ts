import * as vscode from 'vscode';
import { GameSystem } from 'sfs-js';
import { VSCodeSystem } from 'sfs-js/dist/fs.vsc.js';
import { workspace, Uri, FileStat, FileType, Disposable } from 'vscode';

function getWorkspaceUri() {
	if (!workspace.workspaceFolders?.length) return undefined; // throw new Error('No active workspace!');
	return workspace.workspaceFolders[0].uri;
}

export let modFilesystem!: ModFilesystemProvider;
export class ModFilesystemProvider implements vscode.FileSystemProvider {
	vfs!: VSCodeSystem;
	gfs!: GameSystem;
	
	static register() {
		const editor = new this();
		modFilesystem = editor;
		return vscode.workspace.registerFileSystemProvider('mod', editor, { isReadonly: true, isCaseSensitive: false });
	}

	isReady() {
		return this.gfs.initialized;
	}
	
	constructor() {
		const root = getWorkspaceUri();
		if (!root) return;

		this.vfs = new VSCodeSystem();
		this.gfs = new GameSystem(this.vfs, root.path);
		this.gfs.validate().then(x => {
			if (!x) return;
			vscode.window.showInformationMessage(`${this.gfs.name} initialized!`);
		});
	}

	private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): Disposable {
		throw Error('Method not implemented.');
	}

	async stat(uri: Uri): Promise<FileStat> {
		return (await this.gfs.stat(uri.path.toLowerCase()))!;
	}

	async readDirectory(uri: Uri): Promise<[string, FileType][]> {
		return (await this.gfs.readDirectory(uri.path.toLowerCase()))!;
	}

	async findFile(uri: Uri|string, qualifier?: string): Promise<string|undefined> {
		if (typeof uri !== 'string') uri = uri.path; 
		return this.gfs.getPath(uri.toLowerCase(), qualifier);
	}

	async findFileUri(uri: Uri|string, qualifier?: string): Promise<Uri|undefined> {
		if (typeof uri !== 'string') uri = uri.path; 
		const path = await this.gfs.getPath(uri.toLowerCase(), qualifier);
		if (path === undefined) return undefined;
		return Uri.from({ path, scheme: path.includes('.vpk') ? 'vpk' : 'file' });
	}

	createDirectory(uri: Uri): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	async readFile(uri: Uri): Promise<Uint8Array> {
		return (await this.gfs.readFile(uri.path.toLowerCase()))!;
	}

	writeFile(uri: Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	delete(uri: Uri, options: { readonly recursive: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	rename(oldUri: Uri, newUri: Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	copy?(source: Uri, destination: Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}
}
