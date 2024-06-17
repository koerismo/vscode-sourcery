import { Struct, Literal } from 'struxt';

export class ChunkPool {
	pointer: number = 0;
	strings: string[] = [];
	chunks: [number, ((offset: number) => Uint8Array), string][] = [];

	addChunk(callback: (offset: number) => Uint8Array, length: number, name?: string) {
		this.chunks.push([
			length, callback, name ?? this.chunks.length.toString()
		]);
	}

	/** CALL THIS WITHIN THE CHUNK CALLBACK */
	addString(str: string) {
		this.strings.push(str);
		const p = this.pointer;
		this.pointer += str.length + 1;
		return p;
	}

	flush() {
		let ptr = 0;
		const evalled = new Array<Uint8Array>(this.chunks.length);
		
		// Move to end of buffer
		for (let i=0; i<this.chunks.length; i++) {
			ptr += this.chunks[i][0];
		}

		this.pointer = ptr;
		ptr = 0;

		// Fill in chunks
		for (let i=0; i<this.chunks.length; i++) {
			evalled[i] = this.chunks[i][1](ptr);
			if (evalled[i].length !== this.chunks[i][0])
				throw Error(`Length mismatch on chunk ${this.chunks[i][2]}! (${evalled[i].length} !== ${this.chunks[i][0]})`);
			ptr += this.chunks[i][0];
		}

		const out = new Uint8Array(this.pointer);
		ptr = 0;

		// Copy chunks over
		for (let i=0; i<this.chunks.length; i++) {
			evalled[i].set(out, ptr);
			ptr += evalled[i].length;
		}

		// Write strings
		const TE = new TextEncoder();
		for (let i=0; i<this.strings.length; i++) {
			const buf = TE.encode(this.strings[i]+'\0');
			buf.set(out, ptr);
			ptr += buf.length;
		}

		return out;
	}
}

const SCENE_IMAGE_ID = 'VSIF';
const SCENE_IMAGE_VERSION = 2;

// From choreoscene.h
const SCENE_BINARY_TAG = 'bvcd';
const SCENE_BINARY_VERSION = 0x04;
// ------------------

const SceneImageSummary_t = new Struct<{
	msecs: number;
	numSounds: number;
	soundStrings: number[];
}>((P) => {
	P.u32('msecs');
	P.i32('numSounds');
	P.i32('soundStrings', 1);
});

const SceneImageEntry_t = new Struct<{
	crcFilename: number;
	nDataOffset: number;
	nDataLength: number;
	nSceneSummaryOffset: number;
}>((P) => {
	P.u32('crcFilename');
	P.i32('nDataOffset');
	P.i32('nDataLength');
	P.i32('nSceneSummaryOffset');
});

const SceneImageHeader_t = new Struct<{
	nId: number;
	nVersion: number;
	nNumScenes: number;
	nNumStrings: number;
	nSceneEntryOffset: number;
}>((P) => {
	P.str(Literal(SCENE_IMAGE_ID), 4);
	P.i32(Literal(SCENE_IMAGE_VERSION));
	P.i32('nNumScenes');
	P.i32('nNumStrings');
	P.i32('nSceneEntryOffset');
});

// CChoreoScene::SaveToBinaryBuffer (CALLED BY CChoreoScene::SaveBinary)
// https://github.com/mapbase-source/source-sdk-2013/blob/471a840ed98c7206237cb579671a6d6fda9fd4f9/sp/src/game/shared/choreoscene.cpp#L3689-L3753
const CChoreoScene_SaveToBinaryBuffer = new Struct(P => {
	P.str(Literal(SCENE_BINARY_TAG), 4);
	P.i8(Literal(SCENE_BINARY_VERSION));
	P.i32('nTextVersionCRC');

	
});