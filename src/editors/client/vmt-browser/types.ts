export type ImageDataLike = {
	width: number;
	height: number;
	data: Uint8Array;
}

export type MatEntry = {
	name: string;
}

export type ServerMessage = {
	type: 'indexed';
	pageSize: number;
	pageCount: number;
	items: string[];
} | {
	type: 'loaded';
	page: number;
	tints: Uint32Array;
	thumbs: (ImageDataLike | undefined)[];
} | {
	type: 'unloaded';
	page: number;
};

export type ClientMessage = {
	type: 'index';
} | {
	type: 'load';
	page: number;
} | {
	type: 'unload';
	page: number;
};
