import * as vscode from 'vscode';
import { workspace, Uri, FileStat, FileType, Disposable } from 'vscode';
import { GameSystem, ReadableFileSystem, SteamCache } from 'sfs-js';
import { NodeSystem } from 'sfs-js/dist/fs.node.js';

import { GetStringRegKey } from '@vscode/windows-registry';
import { platform as getPlatform } from 'os';
import { join, normalize, resolve } from 'path/posix';
import { outConsole } from './extension.js';

export async function getPathAutocomplete(path: string, prefix: string): Promise<vscode.CompletionItem[]> {
	path = normalize(join('/'+prefix, path));
	if (!modFilesystem.isReady()) return [];
	const dir = await modFilesystem.readDirectory(Uri.file(path));
	const out = new Array<vscode.CompletionItem>(dir.length);
	for (let i=0; i<dir.length; i++) {
		const d = dir[i];
		out[i] = {
			label: d[0],
			kind: d[1] === FileType.Directory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File
		};
	}
	return out;
}

export function getWorkspaceUri() {
	if (!workspace.workspaceFolders?.length) return undefined; // throw new Error('No active workspace!');
	return workspace.workspaceFolders[0].uri;
}

function findSteamCache(fs: ReadableFileSystem): SteamCache {
	let steam_path: string;
	switch (getPlatform()) {
		case 'win32':
			steam_path = normalize(
				// https://github.com/itselectroz/steam-path/blob/master/src/win32.ts#L6-L11
				GetStringRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath') ??
				GetStringRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\Valve\\Steam', 'InstallPath') ??
				GetStringRegKey('HKEY_CURRENT_USER',  'SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath') ??
				GetStringRegKey('HKEY_CURRENT_USER',  'SOFTWARE\\Valve\\Steam', 'InstallPath') ??
				'C:/Program Files (x86)/Steam'
			).replaceAll('\\', '/') + '/';
			break;

		case 'darwin':
			steam_path = join(process.env.HOME!, '/Library/Application Support/Steam/');
			break;
		default:
			steam_path = join(process.env.HOME!, '/.steam/steam/');
	}

	outConsole.log('Using Steam path', "'"+steam_path+"'");
	return SteamCache.get(fs, steam_path);
}

export let modFilesystem!: ModFilesystemProvider;
export class ModFilesystemProvider implements vscode.FileSystemProvider {
	vfs!: ReadableFileSystem;
	gfs!: GameSystem;
	
	static register() {
		const editor = new this();
		modFilesystem = editor;
		return vscode.workspace.registerFileSystemProvider('mod', editor, { isReadonly: true, isCaseSensitive: false });
	}

	isReady() {
		return !!(this.gfs?.initialized);
	}
	
	constructor() {
		const workspace_uri = getWorkspaceUri();
		if (!workspace_uri) return;

		const custom_root = vscode.workspace.getConfiguration('sourcery.game').get<string>('modPath');
		const root = custom_root ? vscode.Uri.file(resolve(workspace_uri.path, custom_root)) : workspace_uri;

		(async () => {
			try {
				// Check if gameinfo exists. vscode's api throws if it doesn't find it, so we skip the whole init.
				await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, 'gameinfo.txt'));
	
				this.vfs = new NodeSystem();
				const steam_cache = findSteamCache(this.vfs);
				this.gfs = new GameSystem(this.vfs, root.fsPath.replaceAll('\\', '/'), steam_cache);
				this.gfs.validate().then(x => {
					if (!x) return;
					vscode.window.showInformationMessage(`${this.gfs.name} initialized!`);
				});
			}
			catch {
				outConsole.log('No gameinfo found at ', root.fsPath);
			}
		})();
	}

	private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): Disposable {
		throw Error('Method not implemented.');
	}

	async stat(uri: Uri): Promise<FileStat> {
		const out = await this.gfs.stat(uri.path.toLowerCase());
		if (out === undefined) throw new vscode.FileSystemError(`Failed to stat Mod file ${uri.path}!`);
		return out;
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
		const out = await this.gfs.readFile(uri.path.toLowerCase());
		if (out === undefined) throw new vscode.FileSystemError(`Failed to read Mod file ${uri.path}!`);
		return out;
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
