export enum DetailOrientation {
	None,
	AllAxes,
	ZAxis,
}

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
	// Prop
	amount: number;
	upright?: boolean;
	minangle?: number;
	maxangle?: number;
	
	// Sprite
	sprite: { x: number, y: number, w: number, h: number };
	spritesize: { u: number, v: number, w: number, h: number };
	spriterandomscale?: number;
	detailOrientation?: DetailOrientation;
	
	// Shapes
	sprite_shape?: 'tri'|'cross';
	sway: number;
	shape_angle: number; // tri only
	shape_size: number; // tri only

	// Models
	model?: string;
}
