import '../../../node_modules/@vscode/codicons/dist/codicon.css';
import './viewport.js';
import * as Viewport from './viewport.js';

import { provideVSCodeDesignSystem, vsCodeButton, vsCodeCheckbox, vsCodeDropdown, vsCodeOption } from '@vscode/webview-ui-toolkit';
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeCheckbox(), vsCodeDropdown(), vsCodeOption());

import { Detail, DetailFile, DetailGroup, DetailKind, DetailMessage, DetailOrientation, DetailProp } from './detail-file.js';
import { EditTableElement } from './edit-table.js';
import { EditNumberElement } from './edit-number.js';
import { EditPropElement } from './edit-detailprop.js';

import { Bound, BoundEditorElement } from './bound-editor.js';

export interface ImageDataLike {
	width: number;
	height: number;
	data: Uint8Array;
}

// declare function acquireVsCodeApi(): { postMessage(message: any): void };
const vscode = acquireVsCodeApi();

/* ================================ ELEMENT SETUP ================================ */

console.log('Starting up detail editor webview...');
EditTableElement.register();
EditNumberElement.register();
BoundEditorElement.register();
EditPropElement.register();

const type_table = document.querySelector<EditTableElement>('#table-types')!;
type_table.setFormat([
	{ title: 'Name',    property: 'type',    type: 'text',   width: '100%' },
	{ title: 'Density', property: 'density', type: 'float',  width: 'auto', min: 0, max: 1_000_000 },
]);
 
const group_table = document.querySelector<EditTableElement>('#table-groups')!;
group_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Alpha',   property: 'alpha',   type: 'float',  width: 'auto', min: 0, max: 1 },
]);

const prop_table = document.querySelector<EditTableElement>('#table-props')!;
prop_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Amount',  property: 'amount',  type: 'float',  width: 'auto', min: 0, max: 1 },
]);

const prop_panel = document.querySelector<HTMLElement>('#panel-settings')!;
const bound_editor = document.querySelector<BoundEditorElement>('bound-editor')!;
const prop_editor = document.querySelector<EditPropElement>('edit-detail-prop')!;

/* ================================ MANAGER ================================ */

export function setElVisible(el: HTMLElement, visible: boolean) {
	el.style.display = visible ? '' : 'none';
}

export function makeThumb(imdata: ImageDataLike) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = imdata.width;
    canvas.height = imdata.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(imdata.data.buffer), imdata.width), 0, 0);
    return canvas.toDataURL();
}

export function encodeBound(bound: Bound, width: number) {
	const {x, y, w, h} = bound;
	return [x, y, w, h, width].join(' ');
}

export function decodeBound(bstr: string): Bound | null {
	const values = bstr.split(' ', 5).map(x => +x);
	if (values.length !== 5) return null;
	if (!Object.values(values).every(x => !isNaN(x))) return null;
	const [x, y, w, h, _] = values;
	return {x, y, w, h};
}

export function makeDefaultProp(inherit: Partial<DetailProp>={}): DetailProp {
	return {
		name: 'Untitled',
		kind: DetailKind.Sprite,
		amount: 1.0,
		sprite: { x: 0, y: 0, w: 0, h: 0, imageWidth: 0 },
		spritesize: { x: 0.5, y: 0.5, w: 16, h: 16 },
		sprite_shape: 'cross',
		detailOrientation: DetailOrientation.None,
		...inherit
	};
}

export function ensurePropIsValid(prop: Partial<DetailProp>): DetailProp {
	prop.name ??= 'Untitled';
	prop.kind ??= DetailKind.Sprite;
	prop.amount ??= 1.0;
	prop.sprite ??= { x: 0, y: 0, w: 0, h: 0, imageWidth: 0 };
	prop.spritesize ??= { x: 0.5, y: 0.5, w: 16, h: 16 };
	prop.sprite_shape ??= 'cross';
	prop.detailOrientation ??= DetailOrientation.None;

	return prop as DetailProp;
}

declare global {
    interface Window {
		FileManager: typeof FileManager;
    }
}

class FileManager {
	static file: DetailFile;
	static saved: boolean = true;
	static groundThumb: HTMLImageElement = document.querySelector('#thumb-ground')!;
	static textureThumb: HTMLImageElement = document.querySelector('#thumb-texture')!;
	static spriteThumb: HTMLImageElement = document.querySelector('#thumb-sprite')!;

	static getCurrentType(): Detail|null {
		if (!type_table.isSelected || type_table.disabled) return null;
		return this.file.details[type_table.selectedIndex] ?? null;
	}

	static getCurrentGroup() {
		return this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex];
	}

	static getCurrentProp(): DetailProp|null {
		if (!group_table.isSelected || !prop_table.isSelected) return null;
		return this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex].props[prop_table.selectedIndex];
	}
	
	/* ================ LIST PANELS ================ */

	static setupSettings() {
		this.updateSettings();
	}

	static updateSettings() {
		const prop = this.getCurrentProp();
		prop_editor.classList.toggle('disabled', prop === null);
		if (prop) prop_editor.setModel(prop);
	}

	public static addType() {
		const new_entry: Detail = {
			type: 'Untitled',
			density: 1000.0,
			groups: [],
		};
		this.file.details.push(new_entry);
		type_table.forceUpdate();
		type_table.selectedIndex = this.file.details.length - 1;
	}

	public static removeType() {
		const to_remove = type_table.selectedIndex;
		this.file.details.splice(to_remove, 1);
		type_table.deselect();
		type_table.forceUpdate();
	}

	public static addGroup() {
		if (group_table.disabled) return;
		const new_entry: DetailGroup = {
			name: 'Untitled',
			alpha: 1.0,
			props: [],
		};
		const current_type = this.file.details[type_table.selectedIndex];
		current_type.groups.push(new_entry);
		group_table.forceUpdate();
		group_table.selectedIndex = current_type.groups.length - 1;
	}

	public static removeGroup() {
		if (group_table.disabled) return;
		const to_remove = group_table.selectedIndex;
		this.file.details[type_table.selectedIndex].groups.splice(to_remove, 1);
		group_table.deselect();
		group_table.forceUpdate();
	}

	public static addModel() {
		if (prop_table.disabled) return;
		const new_entry: DetailProp = makeDefaultProp();
		const current_group = this.getCurrentGroup();
		current_group.props.push(new_entry);
		prop_table.forceUpdate();
		prop_table.selectedIndex = current_group.props.length - 1;
	}

	public static removeModel() {
		if (prop_table.disabled) return;
		const to_remove = prop_table.selectedIndex;
		this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex].props.splice(to_remove, 1);
		prop_table.deselect();
		prop_table.forceUpdate();
	}

	/* ================ CLICKABLE THUMBS ================ */

	public static async askToSetSpriteMat() {
		const resp = await askForTexture();
		if (!resp) return console.log('User cancelled');
		const [path, tex] = resp;

		bound_editor.setImage(tex);
		Viewport.setDetailTexture(tex);
		this.textureThumb.src = bound_editor.thumbSrc!;
	}

	public static async askToSetGroundMat() {
	}

	/* ================ BOUNDS ================ */

	public static openBoundEditor() {
		// Update ghosts
		const all_prop_bounds = this.file.details.flatMap(detail => detail.groups.flatMap(group => group.props.flatMap(prop => prop.sprite)));
		bound_editor.setGhosts(all_prop_bounds);

		const current_prop = this.getCurrentProp();
		if (!current_prop || !bound_editor.image) return;

		// If this is first-time setup, reset the bounds.
		if (!current_prop.sprite.imageWidth) {
			current_prop.sprite.x = 0;
			current_prop.sprite.y = 0;
			current_prop.sprite.w = bound_editor.image.width;
			current_prop.sprite.h = bound_editor.image.height;
			current_prop.sprite.imageWidth = bound_editor.image.width;
		}
		
		// Attempt to start up the bounds editor
		bound_editor.editBounds(current_prop.sprite, current_prop.spritesize);
	}

	public static updateSpriteThumb() {
		const current_prop = this.getCurrentProp();
		if (!current_prop) return this.spriteThumb.src = '';
		const cropped = bound_editor.getCroppedImage(current_prop.sprite);
		if (!cropped)  this.spriteThumb.src = '';
		else           this.spriteThumb.src = makeThumb(cropped);
	}

	public static async copySpriteBounds() {
		const bounds = this.getCurrentProp()?.sprite;
		if (!bounds || !bound_editor.image) return;
		await navigator.clipboard.writeText(encodeBound(bounds, bound_editor.image.width));
	}

	public static async pasteSpriteBounds() {
		const bounds = this.getCurrentProp()?.sprite;
		if (!bounds) return;

		const bstr = await navigator.clipboard.readText();
		try {
			const decoded = decodeBound(bstr);
			if (!decoded) return;
			bounds.x = decoded.x,
			bounds.y = decoded.y,
			bounds.w = decoded.w,
			bounds.h = decoded.h;
		}
		catch(e) {
			console.error(e);
		}

		this.updateSpriteThumb();
	}

	/* ================ INTERNAL ================ */

	static setup() {
		//TODO: THIS IS A HACK!!!! REPLACE THIS WHEN THE VIEWPORT IS IMPLEMENTED!
		//ON FIRST ASK, THE HOST WILL RESPOND WITH THE DEFAULT TEXTURE.
		this.askToSetSpriteMat();

		document.body.addEventListener('input', this.markDirty.bind(this));
		document.body.addEventListener('change', this.markDirty.bind(this));

		// On type change, reset groups and models
		type_table.addEventListener('select', () => {
			// Reset groups
			group_table.disabled = false;
			group_table.setModel(this.file.details[type_table.selectedIndex].groups);
			group_table.deselect();

			// model_table.disabled = true;
			// model_table.setModel([]);
			// model_table.deselect();

			// Update viewport preview
			this.updateViewport();
		});

		type_table.addEventListener('deselect', () => {
			// Disable groups
			group_table.disabled = true;
			group_table.setModel([]);
			group_table.deselect();
		});

		group_table.addEventListener('select', () => {
			// Reset models
			prop_table.disabled = false;
			prop_table.setModel(this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex].props);
			prop_table.deselect();
		});

		group_table.addEventListener('deselect', () => {
			// Disable models
			prop_table.disabled = true;
			prop_table.setModel([]);
			prop_table.deselect();
		});

		prop_table.addEventListener('select', () => {
			// Validate the prop
			ensurePropIsValid(this.getCurrentProp()!);

			// Update sprite thumb
			this.updateSpriteThumb();
			
			// Reset settings
			prop_panel.classList.remove('disabled');
			this.updateSettings();
		});

		prop_table.addEventListener('deselect', () => {
			// Disable settings
			prop_panel.classList.add('disabled');
		});

		prop_editor.addEventListener('update', () => {
			this.updateViewport();
		});

		// Set up initial types table
		type_table.setModel(this.file.details);
		group_table.disabled = true;
		prop_table.disabled = true;
		prop_panel.classList.add('disabled');

		// Hook icon update to bound editor close event
		bound_editor.addEventListener('close', () => {
			this.updateSpriteThumb();
		});

		// Initialize settings menu
		this.setupSettings();
	}

	static load(file: DetailFile) {
		this.file = file;
		this.setup();
	}

	static save() {
		this.saved = true;
		return this.file;
	}

	static markDirty() {
		if (!this.saved) return;
		this.saved = false;
		vscode.postMessage(<DetailMessage>{ type: 'markDirty' });
	}

	static _updateViewportTimeout: any | null = null;
	static updateViewport() {
		if (this._updateViewportTimeout) clearTimeout(this._updateViewportTimeout);
		this._updateViewportTimeout = setTimeout(() => {
			Viewport.setActiveDetail(this.getCurrentType() ?? undefined);
		}, 50);
	}
}

window.FileManager = FileManager;

/* ================================ IO HANDLE ================================ */

async function askForTexture(): Promise<[string, { width: number, height: number, data: Uint8Array }]|null> {
	return new Promise(resolve => {
		let cb = (event: MessageEvent<DetailMessage>) => {
			if (event.data.type !== 'ask') return;
			window.removeEventListener('message', cb);
			if (event.data.error) throw Error(event.data.error);
			resolve(event.data.data);
		};
		window.addEventListener('message', cb);
		vscode.postMessage(<DetailMessage>{
			type: 'ask',
			kind: 'material',
		});
	});
}

onmessage = (event: MessageEvent<DetailMessage>) => {
	const message = event.data;

	if (message.error) {
		document.body.innerText = message.error;
		return;
	}

	if (message.type === 'load') {
		console.log('Loading file...');
		FileManager.load(message.data!);
		return;
	}

	if (message.type === 'save') {
		console.log('Sending...');
		vscode.postMessage({
			type: 'save',
			data: FileManager.save(),
		});
		return;
	}
};

vscode.postMessage(<DetailMessage>{
	type: 'ready'
});
