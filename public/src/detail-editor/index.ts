import { Checkbox, Dropdown, provideVSCodeDesignSystem, vsCodeButton, vsCodeCheckbox, vsCodeDropdown, vsCodeOption } from '@vscode/webview-ui-toolkit';
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeCheckbox(), vsCodeDropdown(), vsCodeOption());

import { Detail, DetailFile, DetailGroup, DetailMessage, DetailProp } from './detail-file.js';
import { EditTable } from './edit-table.js';
import { EditNumber } from './edit-number.js';

declare function acquireVsCodeApi(): { postMessage(message: any): void };
const vscode = acquireVsCodeApi();

/* ================================ ELEMENT SETUP ================================ */

console.log('Starting up detail editor webview...');
EditTable.register();
EditNumber.register();

const type_table = document.querySelector<EditTable>('#table-types');
type_table.setFormat([
	{ title: 'Name',    property: 'texture', type: 'text',   width: '100%' },
	{ title: 'Density', property: 'density', type: 'float',  width: 'auto', min: 0, max: 1_000_000 },
]);
 
const group_table = document.querySelector<EditTable>('#table-groups');
group_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Alpha',   property: 'alpha',   type: 'float',  width: 'auto', min: 0, max: 1 },
]);

const prop_table = document.querySelector<EditTable>('#table-props');
prop_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Amount',  property: 'amount',  type: 'float',  width: 'auto', min: 0, max: 1 },
]);

const settings = {
	panel: document.querySelector<HTMLDivElement>('#settings-panel')!,
	input_kind: document.querySelector<Dropdown>('#settings-kind')!,
	input_upright: document.querySelector<Checkbox>('#settings-upright')!,
	input_scale_random: document.querySelector<EditNumber>('#settings-shape')!,
	input_sway: document.querySelector<EditNumber>('#settings-shape')!,
	input_width: document.querySelector<EditNumber>('#settings-width')!,
	input_height: document.querySelector<EditNumber>('#settings-height')!,
	category_sprite: document.querySelector<HTMLDivElement>('#settings-category-sprite')!,
	category_shape: document.querySelector<HTMLDivElement>('#settings-category-shape')!,
	category_model: document.querySelector<HTMLDivElement>('#settings-category-model')!,
};

/* ================================ MANAGER ================================ */

function setElVisible(el: HTMLElement, visible: boolean) {
	el.style.display = visible ? '' : 'none';
}

declare global {
    interface Window {
		FileManager: typeof FileManager;
    }
}

class FileManager {
	static file: DetailFile;

	static setupSettings() {
		this.updateSettings();
		settings.input_kind.addEventListener('input', () => {
			this.updateSettings();
			// const 
			// this.file
			// 	.details[type_table.selectedIndex]
			// 	.groups[group_table.selectedIndex]
			// 	.props[prop_table.selectedIndex].
		});
	}

	static updateSettings() {
		const category = settings.input_kind.value as 'sprite'|'shape'|'model';
		setElVisible(settings.category_model, category === 'model');
		setElVisible(settings.category_shape, category === 'shape');
		setElVisible(settings.category_sprite, category === 'sprite');
	}

	static addType() {
		const new_entry: Detail = {
			texture: 'Untitled',
			density: 1000.0,
			groups: [],
		};
		this.file.details.push(new_entry);
		type_table.forceUpdate();
		type_table.selectedIndex = this.file.details.length - 1;
	}

	static removeType() {
		const to_remove = type_table.selectedIndex;
		this.file.details.splice(to_remove, 1);
		type_table.deselect();
		type_table.forceUpdate();
	}

	static addGroup() {
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

	static removeGroup() {
		if (group_table.disabled) return;
		const to_remove = group_table.selectedIndex;
		this.file.details[type_table.selectedIndex].groups.splice(to_remove, 1);
		group_table.deselect();
		group_table.forceUpdate();
	}

	static addModel() {
		if (prop_table.disabled) return;
		const new_entry: DetailProp = {
			name: 'Untitled',
			amount: 0,
			sprite: '',
			spritesize: '',
			sway: 0,
			shape_angle: 0,
			shape_size: 0
		};
		const current_group = this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex];
		current_group.props.push(new_entry);
		prop_table.forceUpdate();
		prop_table.selectedIndex = current_group.props.length - 1;
	}

	static removeModel() {
		if (prop_table.disabled) return;
		const to_remove = prop_table.selectedIndex;
		this.file.details[type_table.selectedIndex].groups[group_table.selectedIndex].props.splice(to_remove, 1);
		prop_table.deselect();
		prop_table.forceUpdate();
	}

	static setup() {
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

onmessage = (event: MessageEvent<DetailMessage>) => {
	const mtype = event.data.type;
	const error = event.data.error!;
	const file = event.data.data!;

	if (error) {
		document.body.innerText = error;
		return;
	}

	if (mtype === 'load') {
		console.log('Loading file...');
		FileManager.load(file);
		return;
	}

	if (mtype === 'save') {
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