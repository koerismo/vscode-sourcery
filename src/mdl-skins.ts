import { ViewBuffer } from 'stupid-buffer';
import { readFileSync } from 'fs';

export interface MdlInfo {
	texturedirs: string[];
	textures: string[];
	skins: number[][];
	name: string;
}

export function readInfo(buffer: Uint8Array): MdlInfo {
	const view = new ViewBuffer(buffer);
	view.set_endian(true);
	view.pointer = 12;
	const name = view.read_str(64).trimEnd();
	view.pointer = 204;

	// Read all of this shit
	const texture_count = view.read_i32();
	const texture_offset = view.read_i32();
	if (texture_count > 1024) throw Error('something has gone very wrong!!');
	//
	const texturedir_count = view.read_i32();
	const texturedir_offset = view.read_i32();
	//
	const skinref_count = view.read_i32();
	const skinfamily_count = view.read_i32();
	const skinref_offset = view.read_i32();
	
	let restore_offset: number;
	view.pointer = texture_offset;

	// Read textures
	const textures = new Array(texture_count);
	for (let i=0; i<texture_count; i++) {
		// Read offset from entry
		restore_offset = view.pointer;
		const name_offset = view.read_i32();

		// Read name from elsewhere in file
		view.pointer += name_offset - 4;
		textures[i] = view.read_str();

		// Return to end of texture entry
		view.pointer = restore_offset + 64;
	}

	view.pointer = texturedir_offset;

	const texturedirs = new Array(texturedir_count);
	for (let i=0; i<texturedir_count; i++) {
		// Read offset from entry
		restore_offset = view.pointer;
		const name_offset = view.read_i32();

		// Read name from elsewhere in file
		view.pointer += name_offset - 4;
		texturedirs[i] = view.read_str();

		// Return to end of texture entry
		view.pointer = restore_offset + 4;
	}

	view.pointer = skinref_offset;

	const skins = new Array(skinfamily_count);
	for (let i=0; i<skinfamily_count; i++) {
		skins[i] = new Array(skinref_count);

		for (let k=0; k<skinref_count; k++) {
			skins[i][k] = view.read_u16();
		}
	}

	return {
		texturedirs,
		textures,
		skins,
		name,
	};
}

export function writeInfo(info: MdlInfo, buffer: Uint8Array) {
	const view = new ViewBuffer(buffer);
}

// const mdl = new Uint8Array(readFileSync('/Users/jadon/Library/Application Support/Steam/steamapps/common/Portal 2 Community Edition/p2ce/models/player.mdl').buffer);
// readInfo(mdl);