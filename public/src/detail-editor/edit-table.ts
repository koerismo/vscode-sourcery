import { type EditNumberElement } from './edit-number.js';

interface RowFormat {
	title: string;
	property: string;
	width?: string;
	type: 'text'|'int'|'float'|'checkbox';
	min?: number;
	max?: number;
}

export class EditTableElement extends HTMLTableElement {
	private _format: RowFormat[] = [];
	private _sortKey: string|null = null;
	private _data: Record<string, any>[] = [];
	private _disabled: boolean = false;
	private _selected_row: number = -2;
	private _is_selected: boolean = false;

	set disabled(v: boolean) {
		if (v) {
			this.setAttribute('disabled', '');
			this.#selectRowNoSet(-2, -2);
		}
		else {
			this.removeAttribute('disabled');
			this.#selectRowNoSet(-2, this._selected_row);
		}
		this._disabled = v;
	}

	get disabled() {
		return this._disabled;
	}

	get selectedIndex() {
		return this._selected_row;
	}
	
	get isSelected() {
		return this._is_selected;
	}

	set selectedIndex(v: number) {
		this.#selectRow(v);
	}

	deselect() {
		this.#selectRow(-2);
	}
	
	static register() {
		customElements.define('edit-table', this, { extends: 'table' });
	}

	constructor() {
		super();
		this.insertBefore(document.createElement('tbody'), this.firstElementChild);
	}
	
	// addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLTableElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: 'update'|'select'|'deselect', listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: unknown, listener: unknown, options?: unknown): void {
		// @ts-expect-error shit
		super.addEventListener(type, listener, options);
	}

	setFormat(format: RowFormat[], sortKey: string|null=null) {
		this._format = format;
		this._sortKey = sortKey;
		if (this._data) this.forceUpdate();
	}

	setModel(model: Record<string, any>[]) {
		this._data = model;
		if (this._format) this.forceUpdate();
	}

	#sort() {
		const sortKey = this._sortKey;
		if (!sortKey) return;
		this._data.sort((a, b) => a[sortKey] - b[sortKey]);
	}

	#getValue(element: HTMLInputElement) {
		const type = element.type;
		if (type === 'text') return element.value;
		if (type === 'number') return +element.value;
		if (type === 'checkbox') return element.checked;
		throw Error('Unknown type '+type);
	}

	#setValue(element: HTMLInputElement, value: any) {
		const type = element.type;
		if (type === 'text') return element.value = value;
		if (type === 'number') return (<EditNumberElement>element).setValue(value);
		if (type === 'checkbox') return element.checked = value;
		throw Error('Unknown type '+type);
	}

	#createCell(format: RowFormat, row_id: number) {
		const row_data = this._data[row_id];
		const cell = document.createElement('td');
		let input: HTMLInputElement;
	
		if (format.type === 'float' || format.type === 'int')	{
			input = document.createElement('input' , { is: 'edit-number' });
			if (format.min !== undefined) input.min = format.min.toString();
			if (format.max !== undefined) input.max = format.max.toString();
			if (format.type === 'int') input.step = '1';
		}
		else {
			input = document.createElement('input');
			input.type = format.type;
		}
	
		this.#setValue(input, row_data[format.property]);
		
		let isModified = false;

		// Emit event on input
		input.addEventListener('input', () => {
			isModified = true;
			row_data[format.property] = this.#getValue(input);
			this.dispatchEvent(new Event('update'));
		});

		// Force re-sort on update
		input.addEventListener('blur', () => {
			if (isModified && this._sortKey) this.forceUpdate();
			isModified = false;
		});

		// Blur on enter press
		input.addEventListener('keypress', ev => {
			if (ev.key === 'Enter') input.blur();
		});

		cell.appendChild(input);
		return cell;
	}

	#createRow(row_id: number) {
		const row = document.createElement('tr');
		row.addEventListener('click', () => this.#selectRow(row_id));
		for (const col of this._format) {
			row.appendChild(this.#createCell(col, row_id));
		}
		return row;
	}

	#selectRowNoSet(prev: number, index: number) {
		this._is_selected = (index > -1);
		const firstChild = this.firstElementChild!;
		if (prev >= 0 && firstChild.children.length > prev+1)
			firstChild.children[prev+1].classList.remove('active');
		if (index >= 0 && firstChild.children.length > index+1)
			firstChild.children[index+1].classList.add('active');
	}

	#selectRow(index: number) {
		this._is_selected = (index > -1);
		const firstChild = this.firstElementChild!;
		if (this._selected_row >= 0 && firstChild.children.length > this._selected_row+1)
			firstChild.children[this._selected_row+1].classList.remove('active');
		if (index >= 0 && firstChild.children.length > index+1) {
			firstChild.children[(this._selected_row = index)+1].classList.add('active');
			this.dispatchEvent(new Event('select'));
		}
		else {
			this.dispatchEvent(new Event('deselect'));
		}
	}

	#createHeader() {
		const row = document.createElement('tr');
		row.classList.add('header');
		for (const col of this._format) {
			const th = document.createElement('th');
			th.innerText = col.title;
			th.style.width = col.width ?? 'auto';
			row.appendChild(th);
		}
		return row;
	}
	
	forceUpdate() {
		if (!this._format || !this._data) return false;
		this.#sort();

		const firstChild = this.firstElementChild!;
		firstChild.replaceChildren(this.#createHeader());
		for (let i=0; i<this._data.length; i++) {
			firstChild.appendChild(this.#createRow(i));
		}
		this.#selectRow(this._selected_row);
	}
}
