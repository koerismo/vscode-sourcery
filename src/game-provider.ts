import * as vscode from 'vscode';
import { parse, KeyV, KeyVSet } from 'fast-vdf';

export let gameFileSystemProvider!: GameFileSystemProvider;

export interface GameMounts {
	filecache: Record<string, vscode.Uri>;				// File --> Uri redirects
	mountcache: Record<string, number>;					// Mount path --> index redirects
	mountlist: { vpk: boolean, uri: vscode.Uri }[];		// Mount list
}

const RE_SLASH = /(\/|\\)+/g; // TODO: Move this to shared module? duplicates!
const RE_PATH_STEAM = /(.*Steam\/)/;
const RE_PATH_GAMEINFO = /\w+(\/|\\)+gameinfo\.txt/;
const RE_SP_GAMEINFO = /\|gameinfo_path\||\|all_source_engine_paths\|/;

function parseSearchPath(root: vscode.Uri, path: string) {
	path = path.replace(RE_SP_GAMEINFO, '');
	const uri = vscode.Uri.joinPath(root, path);
	return uri;
}

function getWorkspaceUri() {
	if (!vscode.workspace.workspaceFolders?.length) throw new Error('No active workspace!');
	return vscode.workspace.workspaceFolders[0].uri;
}

// function findAppManifestPath(path: string, appid: string): string|null {
// 	const match = path.replace(RE_SLASH, '/').match(RE_PATH_STEAM);
// 	if (!match) return null;
// 	return match![1] + `steamapps/appmanifest_${appid}.acf`;
// }

// function findAppPath(path: string, name: string): string {
// 	const match = path.replace(RE_SLASH, '/').match(RE_PATH_STEAM);
// 	if (!match) throw new Error('Failed to match app path!');
// 	return match![1] + `steamapps/common/${name}/`;
// }

export class GameFileSystemProvider implements vscode.FileSystemProvider {
	gamecache: Record<string, GameMounts|null> = {};
	// steamcache: Record<string, vscode.Uri|null> = {};

	static register() {
		const editor = new this();
		gameFileSystemProvider = editor;
		return vscode.workspace.registerFileSystemProvider('game', editor, { isReadonly: true, isCaseSensitive: false });
	}

	// async findAppById(appid: string): Promise<vscode.Uri|null> {
	// 	if (appid in this.steamcache) return this.steamcache[appid];
	// 	const uri = getWorkspaceUri();
	// 	const path = findAppManifestPath(uri.path, appid);
	// 	if (!path) return null;
	// 	const manifest_path = uri.with({ path });

	// 	let text: string;
	// 	try { text = new TextDecoder().decode(await vscode.workspace.fs.readFile( manifest_path )); }
	// 	catch { return null; }

	// 	const root = parse(text, { escapes: false, multilines: false, types: false });
	// 	const app_info = root.dir('AppState');
	// 	console.log('Found game', app_info.value('name'), 'from appid', appid);

	// 	const app_uri = uri.with({ path: findAppPath(uri.path, app_info.value('installdir') as string) });
	// 	this.steamcache[appid] = app_uri;
	// 	return app_uri;
	// }

	/** Forcefully checks for a gameinfo in/above the provided Uri. */
	async initGame(workspace_uri: vscode.Uri): Promise<GameMounts|null> {
		// Find gameinfo
		const own_uri = vscode.Uri.joinPath(workspace_uri, 'gameinfo.txt');
		const parent_uri = vscode.Uri.joinPath(workspace_uri, '../gameinfo.txt');
		let uri: vscode.Uri|null = null;
		if      ((await vscode.workspace.fs.stat(own_uri)).type === vscode.FileType.File) uri = own_uri;
		else if ((await vscode.workspace.fs.stat(parent_uri)).type === vscode.FileType.File) uri = parent_uri;
		if (uri === null) {
			// Cache that we didn't find a gameinfo so we don't waste processing power on non-source repos.
			this.gamecache[workspace_uri.path] = null;
			return null;
		}
		
		// Read document
		const game_uri = uri.with({ path: uri.path.replace(RE_PATH_GAMEINFO, '') });
		const document = await vscode.workspace.openTextDocument(uri);
		const text = document.getText();
		
		// Set up mount cache
		const game: GameMounts = { mountlist: [], mountcache: {}, filecache: {} };

		try {
			const root = parse(text, { escapes: false, multilines: false, types: false });
			const spaths = root.dir('GameInfo').dir('FileSystem').dir('SearchPaths');
			
			// Iterate through searchpaths
			for (const path of spaths.all()) {
				if (!(path instanceof KeyV)) throw new Error('Unexpected directory inside SearchPaths!');
				let cleaned = parseSearchPath(game_uri, path.value as string);
				const is_vpk = cleaned.path.endsWith('.vpk');
				if (is_vpk) {
					cleaned = cleaned.with({
						scheme: 'vpk',
						path: cleaned.path.replace('.vpk', '_dir.vpk')
					});
				}
				game.mountlist.push({ vpk: is_vpk, uri: cleaned });
				console.info('Added searchpath:', is_vpk ? 'vpk' : 'folder', cleaned.toString());
			}
		}
		catch(e) {
			console.error(e);
			vscode.window.showWarningMessage('Failed to parse gameinfo.txt!');
			return null;
		}

		console.log('Initialized game!');
		this.gamecache[workspace_uri.path] = game;
		return game;
	}

	/** Checks the cache, and then the system, for a gameinfo in/above the workspace root. */
	async getGame(): Promise<GameMounts|null> {
		const root_uri = getWorkspaceUri();
		if (root_uri.path in this.gamecache) return this.gamecache[root_uri.path];
		return await this.initGame(root_uri);
	}

	/** Finds the original location of a file. */
	async locateFile(game: GameMounts, uri: vscode.Uri): Promise<vscode.Uri|null> {
		const path = uri.path.toLowerCase();
		if (path in game.filecache) return game.filecache[path];
		
		for (const mount of game.mountlist) {
			const relative_uri = vscode.Uri.joinPath(mount.uri, path);
			try {
				if ((await vscode.workspace.fs.stat(relative_uri)).type !== vscode.FileType.File) continue;
			}
			catch {
				continue;
			}
			
			game.filecache[path] = relative_uri;
			return relative_uri;
		}

		return null;
	}
	
	// Copied from
	// https://github.com/gitkraken/vscode-gitlens/blob/dd1280a6408abd58ea045a838921359964d5ae81/src/git/fsProvider.ts#L38C2-L41C3
	private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}
	
	watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
		throw new Error('Method not implemented.');
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const game = await this.getGame();
		if (!game) throw new vscode.FileSystemError('Directory does not exist!');
		const new_uri = await this.locateFile(game, uri);
		if (!new_uri) throw new vscode.FileSystemError('Directory does not exist!');
		return vscode.workspace.fs.stat(new_uri);
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const game = await this.getGame();
		if (!game) throw new vscode.FileSystemError('Directory does not exist!');
		const new_uri = await this.locateFile(game, uri);
		if (!new_uri) throw new vscode.FileSystemError('Directory does not exist!');
		return vscode.workspace.fs.readDirectory(new_uri);
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const game = await this.getGame();
		if (!game) throw new vscode.FileSystemError('File does not exist!');
		const new_uri = await this.locateFile(game, uri);
		if (!new_uri) throw new vscode.FileSystemError('File does not exist!');
		return vscode.workspace.fs.readFile(new_uri);
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
