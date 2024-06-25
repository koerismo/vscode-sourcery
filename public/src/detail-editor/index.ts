import { Checkbox, Dropdown, provideVSCodeDesignSystem, vsCodeButton, vsCodeCheckbox, vsCodeDropdown, vsCodeOption } from '@vscode/webview-ui-toolkit';
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeCheckbox(), vsCodeDropdown(), vsCodeOption());

import { Detail, DetailFile, DetailGroup, DetailMessage, DetailProp } from './detail-file.js';
import { EditTableElement } from './edit-table.js';
import { EditNumberElement } from './edit-number.js';

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

const type_table = document.querySelector<EditTableElement>('#table-types');
type_table.setFormat([
	{ title: 'Name',    property: 'texture', type: 'text',   width: '100%' },
	{ title: 'Density', property: 'density', type: 'float',  width: 'auto', min: 0, max: 1_000_000 },
]);
 
const group_table = document.querySelector<EditTableElement>('#table-groups');
group_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Alpha',   property: 'alpha',   type: 'float',  width: 'auto', min: 0, max: 1 },
]);

const prop_table = document.querySelector<EditTableElement>('#table-props');
prop_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Amount',  property: 'amount',  type: 'float',  width: 'auto', min: 0, max: 1 },
]);

const bound_editor = document.querySelector<BoundEditorElement>('bound-editor');

const settings = {
	panel: document.querySelector<HTMLDivElement>('#settings-panel')!,
	input_kind: document.querySelector<Dropdown>('#settings-kind')!,
	input_upright: document.querySelector<Checkbox>('#settings-upright')!,
	input_scale_random: document.querySelector<EditNumberElement>('#settings-shape')!,
	input_sway: document.querySelector<EditNumberElement>('#settings-shape')!,
	input_width: document.querySelector<EditNumberElement>('#settings-width')!,
	input_height: document.querySelector<EditNumberElement>('#settings-height')!,
	category_sprite: document.querySelector<HTMLDivElement>('#settings-category-sprite')!,
	category_shape: document.querySelector<HTMLDivElement>('#settings-category-shape')!,
	category_model: document.querySelector<HTMLDivElement>('#settings-category-model')!,
};

/* ================================ MANAGER ================================ */

function setElVisible(el: HTMLElement, visible: boolean) {
	el.style.display = visible ? '' : 'none';
}

export function makeThumb(imdata: ImageDataLike) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imdata.width;
    canvas.height = imdata.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(imdata.data.buffer), imdata.width), 0, 0);
    return canvas.toDataURL();
}

export function encodeBound(bound: Bound, width: number) {
	const {x, y, w, h} = bound;
	return [x, y, w, h, width].join(' ');
}

export function decodeBound(bstr: string) {
	const [x, y, w, h, _] = bstr.split(' ', 5).map(x => +x);
	return {x, y, w, h};
}

declare global {
    interface Window {
		FileManager: typeof FileManager;
    }
}

class FileManager {
	static file: DetailFile;
	static groundThumb: HTMLImageElement = document.querySelector('#thumb-ground');
	static textureThumb: HTMLImageElement = document.querySelector('#thumb-texture');
	static spriteThumb: HTMLImageElement = document.querySelector('#thumb-sprite');

	static getCurrentGroup() {
		return this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex];
	}

	static getCurrentProp() {
		return this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex].props[prop_table.selectedIndex];
	}
	
	/* ================ LIST PANELS ================ */

	static setupSettings() {
		this.updateSettings();
		settings.input_kind.addEventListener('input', () => {
			this.updateSettings();
		});
	}

	static updateSettings() {
		const category = settings.input_kind.value as 'sprite'|'shape'|'model';
		setElVisible(settings.category_model, category === 'model');
		setElVisible(settings.category_shape, category === 'shape');
		setElVisible(settings.category_sprite, category === 'sprite');
	}

	public static addType() {
		const new_entry: Detail = {
			texture: 'Untitled',
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
		const new_entry: DetailProp = {
			name: 'Untitled',
			amount: 0,
			sprite: { x: 0, y: 0, w: 0, h: 0, imageWidth: 0 },
			spritesize: { x: 0, y: 0, w: 0, h: 0 },
			sway: 0,
			shape_angle: 0,
			shape_size: 0
		};
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
		this.textureThumb.src = bound_editor.thumbSrc;
	}

	public static async askToSetGroundMat() {
	}

	/* ================ BOUNDS ================ */

	public static openBoundEditor() {
		// Update ghosts
		const all_prop_bounds = this.file.details.flatMap(detail => detail.groups.flatMap(group => group.props.flatMap(prop => prop.sprite)));
		bound_editor.setGhosts(all_prop_bounds);

		const current_prop = this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex].props[prop_table.selectedIndex];
		bound_editor.editBounds(current_prop.sprite, current_prop.spritesize);
	}

	public static updateSpriteThumb() {
		this.spriteThumb.src = makeThumb(bound_editor.getCroppedImage());
	}

	public static async copySpriteBounds() {
		const bounds = this.getCurrentProp().sprite;
		await navigator.clipboard.writeText(encodeBound(bounds, bound_editor.image.width));
		this.updateSpriteThumb();
	}

	public static async pasteSpriteBounds() {
		const bounds = this.getCurrentProp().sprite;
		const bstr = await navigator.clipboard.readText();
		try {
			const decoded = decodeBound(bstr);
			if (!Object.values(decoded).every(x => !isNaN(x))) return;
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

		// On type change, reset groups and models
		type_table.addEventListener('select', () => {
			// Reset groups
			group_table.disabled = false;
			group_table.setModel(this.file.details[type_table.selectedIndex].groups);
			group_table.deselect();

			// model_table.disabled = true;
			// model_table.setModel([]);
			// model_table.deselect();
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
			// Update sprite thumb
			const current_prop = this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex].props[prop_table.selectedIndex];
			this.spriteThumb.src = makeThumb(bound_editor.getCroppedImage(current_prop.sprite));
			
			// Reset settings
			settings.panel.classList.remove('disabled');
			this.updateSettings();
		});

		prop_table.addEventListener('deselect', () => {
			// Disable settings
			settings.panel.classList.add('disabled');
		});

		// Set up initial types table
		type_table.setModel(this.file.details);
		group_table.disabled = true;
		prop_table.disabled = true;
		settings.panel.classList.add('disabled');

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
		return this.file;
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
	// const mtype = event.data.type;
	// const error = event.data.error!;
	// const file = event.data.data!;

	if (message.error) {
		document.body.innerText = message.error;
		return;
	}

	if (message.type === 'load') {
		console.log('Loading file...');
		FileManager.load(message.data);
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

vscode.postMessage({
	type: 'ready'
});