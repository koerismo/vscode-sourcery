export enum DetailOrientation {
	None,
	AllAxes,
	ZAxis,
}

export enum DetailKind {
	Sprite,
	Shape,
	Model,
}

export interface DetailSpriteBound {
	x: number;
	y: number;
	w: number;
	h: number;
	imageWidth: number;
}

export interface DetailSpriteSize {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type DetailMessage = {
	type: 'load'|'save'|'ready';
	data?: DetailFile;
	error?: string;
} | {
	type: 'ask';
	kind: 'material'|'model';
	data: [string, { width: number, height: number, data: Uint8Array }]|null;
	error?: string;
};

export interface DetailFile {
	details: Detail[];
}

export interface Detail {
	texture: string;
	density: number;
	groups: DetailGroup[];
}

export interface DetailGroup {
	name: string;
	alpha: number;
	props: DetailProp[];
}

export interface DetailProp {
	name: string;

	// Prop
	amount: number;
	upright?: number;
	minangle?: number;
	maxangle?: number;
	
	// Sprite
	sprite: DetailSpriteBound;
	spritesize: DetailSpriteSize;
	spriterandomscale?: number;
	detailOrientation?: DetailOrientation;
	
	// Shapes
	sprite_shape?: 'tri'|'cross';
	sway?: number;
	shape_angle?: number; // tri only
	shape_size?: number; // tri only

	// Models
	model?: string;
}
