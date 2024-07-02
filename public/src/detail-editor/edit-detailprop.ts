import { EditNumberElement } from './edit-number.js';
import { DetailKind, DetailOrientation, type DetailProp } from './detail-file.js';
import { setElVisible } from './index.js';
import { Checkbox, type Dropdown } from '@vscode/webview-ui-toolkit';
import { checkV } from './math.js';

const PropShape = {
	tri: 'tri',
	cross: 'cross',
} as const;

export class EditPropElement extends HTMLElement {
	private _data?: DetailProp;

	private category_sprite_common: HTMLElement;
	private category_sprite: HTMLElement;
	private category_shape: HTMLElement;
	private category_shape_tri: HTMLElement;
	private category_model: HTMLElement;

	private input_upright: Checkbox;
	private input_kind: Dropdown;
	private input_width: EditNumberElement;
	private input_height: EditNumberElement;
	private input_randscale: EditNumberElement;
	private input_sway: EditNumberElement;
	private input_angle_min: EditNumberElement;
	private input_angle_max: EditNumberElement;

	private input_spr_orient: Dropdown;

	private input_shape: Dropdown;
	private input_tri_angle: EditNumberElement;
	private input_tri_radius: EditNumberElement;

	static register() {
		customElements.define('edit-detail-prop', this);
	}

	constructor() {
		super();
		this.innerHTML = `
			<label>Kind</label>
			<vscode-dropdown id="settings-kind">
				<vscode-option value="${DetailKind.Sprite}">Sprite</vscode-option>
				<vscode-option value="${DetailKind.Shape}">Shape</vscode-option>
				<vscode-option value="${DetailKind.Model}">Model</vscode-option>
			</vscode-dropdown>

			<label>Spawn Upright</label>
			<vscode-checkbox id="settings-upright"></vscode-checkbox>
			<label>Placement Angle</label>
			<div class="h">
				<input id="settings-angle-min"  is="edit-number" step="0.1" min="0" max="180" optional placeholder="Min">
				<input id="settings-angle-max" is="edit-number" step="0.1" min="0" max="180" optional placeholder="Max">
			</div>

			<label>Orientation</label>
			<vscode-dropdown id="settings-sprite-orient">
				<vscode-option value="0">Flat</vscode-option>
				<vscode-option value="1">Face Camera</vscode-option>
				<vscode-option value="2">Z-Locked Camera</vscode-option>
			</vscode-dropdown>
			
			<div class="content" id="settings-category-sprite-common">
				<label>Sprite</label>
				<div class="h">
					<img onclick="FileManager.openBoundEditor()" id="thumb-sprite" class="edit-icon" />
					<div class="v">
						<vscode-button onclick="FileManager.copySpriteBounds()">Copy</vscode-button>
						<vscode-button onclick="FileManager.pasteSpriteBounds()">Paste</vscode-button>
					</div>
				</div>
				<label>Size</label>
				<div class="h">
					<input id="settings-width"  is="edit-number" step="1" min="0" placeholder="Width">
					<input id="settings-height" is="edit-number" step="1" min="0" placeholder="Height">
				</div>
				<label>Random Scale</label>
				<input id="settings-scale-random" is="edit-number" min="0" max="1" step="0.01" optional>
				<label>Sway</label>
				<input id="settings-sway" is="edit-number" min="0" max="10" step="0.01" optional>
			</div>

			<div class="content" id="settings-category-sprite">
			</div>
			
			<div class="content" id="settings-category-shape">
				<label>Shape</label>
				<vscode-dropdown id="settings-shape">
					<vscode-option value="tri">Triangle</vscode-option>
					<vscode-option value="cross">Cross</vscode-option>
				</vscode-dropdown>
			</div>
			
			<div class="content" id="settings-category-shape-tri">
				<label>Shape Angle</label>
				<input id="settings-tri-angle"  is="edit-number" type="number" min="0" max="180" optional>
				<label>Shape Radius</label>
				<input id="settings-tri-radius" is="edit-number" type="number" step="0.01" optional>
			</div>

			<div class="content" id="settings-category-model">
				<label>Model</label>
				<input id="settings-model" disabled/>
				<vscode-button style="grid-column: span 2;">Select</vscode-button>
			</div>
		`;
		
		// Categories
		this.category_sprite_common = this.querySelector<HTMLElement>('#settings-category-sprite-common')!;
		this.category_sprite = this.querySelector<HTMLElement>('#settings-category-sprite')!;
		this.category_shape = this.querySelector<HTMLElement>('#settings-category-shape')!;
		this.category_shape_tri = this.querySelector<HTMLElement>('#settings-category-shape-tri')!;
		this.category_model = this.querySelector<HTMLElement>('#settings-category-model')!;

		// Common
		this.input_upright = this.querySelector<Checkbox>('#settings-upright')!;
		this.input_kind = this.querySelector<Dropdown>('#settings-kind')!;
		this.input_width = this.querySelector<EditNumberElement>('#settings-width')!;
		this.input_height = this.querySelector<EditNumberElement>('#settings-height')!;
		this.input_randscale = this.querySelector<EditNumberElement>('#settings-scale-random')!;
		this.input_sway = this.querySelector<EditNumberElement>('#settings-sway')!;
		this.input_angle_min = this.querySelector<EditNumberElement>('#settings-angle-min')!;
		this.input_angle_max = this.querySelector<EditNumberElement>('#settings-angle-max')!;

		// Sprite
		this.input_spr_orient = this.querySelector<Dropdown>('#settings-sprite-orient')!;

		// Shape
		this.input_shape = this.querySelector<Dropdown>('#settings-shape')!;
		this.input_tri_angle = this.querySelector<EditNumberElement>('#settings-tri-angle')!;
		this.input_tri_radius = this.querySelector<EditNumberElement>('#settings-tri-radius')!;

		//
		// ==================== INIT ====================
		//

		const input_list = [
			this.input_width, this.input_height,
			this.input_randscale, this.input_sway,
			this.input_angle_min, this.input_angle_max,
			this.input_tri_angle, this.input_tri_radius
		];

		for (const input of input_list) input.addEventListener('update', this.emitUpdate.bind(this));
		for (const input of input_list) input.addEventListener('input', this.emitUpdate.bind(this));

		this.input_kind.addEventListener('input', () => {
			if (!this._data) return;
			this._data.kind = +this.input_kind.value;
			this.updateKind();
			this.emitUpdate();
		});

		this.input_spr_orient.addEventListener('input', () => {
			if (!this._data) return;
			this._data.detailOrientation = +this.input_spr_orient.value;
			this.emitUpdate();
		});

		this.input_shape.addEventListener('input', () => {
			if (!this._data) return;
			this._data.sprite_shape = this.input_shape.value as ('tri'|'cross');
			setElVisible(this.category_shape_tri, +this.input_kind.value === DetailKind.Shape && this.input_shape.value === PropShape.tri);
			this.emitUpdate();
		});

		this.input_upright.addEventListener('change', () => {
			if (!this._data) return;
			this._data.upright = +this.input_upright.checked;
			this.emitUpdate();
		});
	}

	updateKind() {
		if (!this._data) return;
		const kind_type: DetailKind = +this.input_kind.value;
		setElVisible(this.category_sprite_common, kind_type !== DetailKind.Model);
		setElVisible(this.category_sprite, kind_type === DetailKind.Sprite);
		setElVisible(this.category_shape, kind_type === DetailKind.Shape);
		setElVisible(this.category_shape_tri, kind_type === DetailKind.Shape && this.input_shape.value === PropShape.tri);
		setElVisible(this.category_model, kind_type === DetailKind.Model);
	}

	_emitUpdateTimeout: any = null;
	emitUpdate() {
		if (this._emitUpdateTimeout) clearTimeout(this._emitUpdateTimeout);
		setTimeout(() => {
			this.dispatchEvent(new Event('update'));
		}, 10);
	}

	setModel(model?: DetailProp) {
		this._data = model;
		if (!this._data) return;
		this.validateModel();
		
		this.input_width.setModel(this._data.spritesize, 'w');
		this.input_height.setModel(this._data.spritesize, 'h');
		this.input_randscale.setModel(this._data, 'spriterandomscale');
		this.input_sway.setModel(this._data, 'sway');
		this.input_angle_min.setModel(this._data, 'minangle');
		this.input_angle_max.setModel(this._data, 'maxangle');

		this.input_tri_angle.setModel(this._data, 'shape_angle');
		this.input_tri_radius.setModel(this._data, 'shape_size');

		this.input_kind.value = this._data.kind.toString();
		this.input_spr_orient.value = (this._data.detailOrientation ?? 0).toString();
		this.input_shape.value = this._data.sprite_shape ?? 'cross';
		this.input_upright.checked = !!(this._data.upright ?? false);

		// Update UI section visibility
		this.updateKind();
	}

	validateModel() {
		if (!this._data) return;
		this._data.detailOrientation = checkV(this._data.detailOrientation, 0);
		this._data.spriterandomscale = checkV(this._data.spriterandomscale, 0, 0, 1);
		this._data.sway = checkV(this._data.sway, 0, 0);
		this._data.shape_angle = checkV(this._data.shape_angle, 0, 0, 180);
		this._data.shape_size = checkV(this._data.shape_size, 0);
	}
}
