import { Uri, FileType, workspace } from 'vscode';

const SIGNATURE = 0x55aa1234;
const VER_MIN = 1;
const VER_MAX = 2;
const LE = true;
const INDEX_INLINE = 0x7fff;

// const RE_PATH = /\/?(.*\/)?(.+)(\..+)/;

const SLASH = '/';

export interface VpkFileInfo {
	crc: number;
	preloadBytes: number;
	archiveIndex: number;
	offset: number;
	length: number;
}

enum VpkReaderVersion {
	INVALID = -1,
	NONE = 0,
	V1 = 1,
	V2 = 2,
}

// interface VpkTree {
// 	[extension: string]: {
// 		[path: string]: {
// 			[filename: string]: VpkFileInfo;
// 		}
// 	}
// }

export class VpkReader {
	uri: Uri;
	version: VpkReaderVersion = VpkReaderVersion.NONE;
	files: Record<string, VpkFileInfo> = {}; // { '/amogus.txt': { archiveIndex: 0, crc: 0, length: 0, offset: 0, preloadBytes: 0 }};
	cache: Record<number, Uint8Array> = {};

	constructor(path: Uri) {
		this.uri = path;
	}

	private getArchiveUri(index: number): Uri {
		const root_path = this.uri.path.replace('_dir.vpk', '_');
		const number_string = ('00' + index).slice(-3);
		return this.uri.with({ path: root_path+number_string+'.vpk' });
	}

	async getArchiveData(index: number) {
		if (index in this.cache) return this.cache[index];

		const archive_uri = this.getArchiveUri(index);
		const archive_data = new Uint8Array(await workspace.fs.readFile(archive_uri));
		if (!archive_data || !archive_data.length) return null;
		this.cache[index] = archive_data;
		return archive_data;
	}

	async readHeader() {
		const bytes = await workspace.fs.readFile(this.uri);
		const view = new DataView(bytes.buffer);

		// In case an error is thrown, leave us on invalid.
		this.version = VpkReaderVersion.INVALID;

		if (view.getUint32(0, LE) !== SIGNATURE) throw new Error('Invalid vpk signature!');
		
		const version = view.getUint32(4, LE);
		if (version < VER_MIN || version > VER_MAX) throw new Error(`Invalid vpk version! (${version})`);
		const SIZE_HEADER = version === 2 ? 28 : 12;
		this.version = version;

		const treeSize = view.getUint32(8, LE);

		if (version === 2) {
			const fileDataSize = view.getUint32(12, LE);
			const archiveMD5Size = view.getUint32(16, LE);
			const otherMD5Size = view.getUint32(20, LE);
			const signatureSectionSize = view.getUint32(24, LE);
		}

		const TD = new TextDecoder();
		let i = SIZE_HEADER;
		
		// The following was adapted from the pseudocode present on the VDC page.
		// https://developer.valvesoftware.com/wiki/VPK_(file_format)

		function readString(): string {
			const start = i;
			const end = bytes.indexOf(0x00, start);
			if (end === -1) {
				throw new Error('Failed to terminate string!');
			}
			i = end+1;
			return TD.decode(bytes.slice(start, end));
		}

		// struct VPKDirectoryEntry
		function readFileInfo(): VpkFileInfo {
			const crc          =  view.getUint32(i,    LE);
			const preloadBytes =  view.getUint16(i+4,  LE);
			const archiveIndex =  view.getUint16(i+6,  LE);
			const entryOffset  =  view.getUint32(i+8,  LE);
			const entryLength  =  view.getUint32(i+12, LE);
			i += 16 + 2;
			i += preloadBytes;

			return {
				crc,
				preloadBytes,
				archiveIndex,
				offset: entryOffset,
				length: entryLength
			};
		}

		// Read tree
		while (true) {
			const extension = readString();
			if (!extension.length) break;
			// console.log('EXTENSION:', `"${extension}"`);

			while (true) {
				let path = readString();
				if (!path.length) break;
				if (path === ' ') path = '';
				// console.log('PATH:', `"${path}"`);

				while (true) {
					const filename = readString();
					if (!filename.length) break;
					// console.log('FILE:', `"${filename}"`);
					

					let fullpath = (path+'/'+filename+'.'+extension).trim();
					if (!fullpath.startsWith('/')) fullpath = '/' + fullpath;
					this.files[fullpath] = readFileInfo();
				}
			}
		}

		// console.log('Parsed vpk! Got', this.files, 'and version', this.version);
	}

	async getFileInfo(path: string): Promise<VpkFileInfo|null> {
		if (this.version === VpkReaderVersion.NONE) await this.readHeader();
		if (this.version === VpkReaderVersion.INVALID) return null;
		if (path in this.files) return this.files[path];
		return null;
	}

	async readFile(path: string): Promise<Uint8Array|null> {
		if (this.version === VpkReaderVersion.NONE) await this.readHeader();
		if (this.version === VpkReaderVersion.INVALID) return null;
		
		// console.log('Trying to read file', path);
		const info = await this.getFileInfo(path);
		if (!info) return null;

		const archive_data = await this.getArchiveData(info.archiveIndex);
		if (!archive_data) return null;

		const data = archive_data.slice(info.offset, info.offset+info.length);
		return data;
	}

	async readDirectory(path: string): Promise<[string, FileType][]> {
		if (this.version === VpkReaderVersion.NONE) await this.readHeader();
		if (this.version === VpkReaderVersion.INVALID) return [];

		const out: [string, FileType][] = [];
		const included: Record<string, true> = {};

		for (const file in this.files) {
			if (!file.startsWith(path)) continue;
			const slash_pos = file.indexOf(SLASH, path.length+1);
			const is_dir = slash_pos !== -1;
			
			if (is_dir) {
				const dirname = file.slice(0, slash_pos);
				if (dirname === path) continue;
				if (dirname in included) continue;
				included[dirname] = true;
				out.push([dirname, FileType.Directory]);
			}
			else {
				out.push([file, FileType.File]);
			}


			// if (file.startsWith(path)) {
			// 	const is_dir = file.indexOf(SLASH, path.length) !== -1;
			// 	const type = is_dir ? FileType.Directory : FileType.File;
			// 	out.push([file, type]);
			// }
		}

		return out;
	}
}
