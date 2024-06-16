interface RowFormat {
	title: string;
	property: string;
	width?: string;
	type: 'text'|'int'|'float'|'checkbox';
	min?: number;
	max?: number;
}

interface UpdateEventInit extends CustomEventInit {
	row: number;
	column: number;
	value: any;
}

export class EditTable extends HTMLTableElement {
	_format: RowFormat[] = [];
	_data: Record<string, any>[] = [];
	_selectable: boolean = true;
	_selected_row: number = -1;
	
	static register() {
		customElements.define('edit-table', this, { extends: 'table' });
	}

	constructor() {
		super();
		this.insertBefore(document.createElement('tbody'), this.firstElementChild);
	}
	
	// addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLTableElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: 'update', listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: unknown, listener: unknown, options?: unknown): void {
		// @ts-expect-error shit
		super.addEventListener(type, listener, options);
	}

	setFormat(format: RowFormat[]) {
		this._format = format;
		if (this._data) this.forceUpdate();
	}

	setModel(model: Record<string, any>[]) {
		this._data = model;
		if (this._format) this.forceUpdate();
	}

	setSelectable(selectable: boolean) {
		this._selectable = selectable;
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
		if (type === 'number') return element.value = value;
		if (type === 'checkbox') return element.checked = value;
		throw Error('Unknown type '+type);
	}

	#createCell(format: RowFormat, row_id: number) {
		const row_data = this._data[row_id];
		const cell = document.createElement('td');
		const input = document.createElement('input');
	
		if (format.type === 'float' || format.type === 'int')	{
			input.type = 'number';
			if (format.min !== undefined) input.min = format.min.toString();
			if (format.max !== undefined) input.max = format.max.toString();
			if (format.type === 'int') input.step = '1';
		}
		else {
			input.type = format.type;
		}
	
		this.#setValue(input, row_data[format.property]);
		
		// Emit event on input
		input.addEventListener('input', () => {
			row_data[format.property] = this.#getValue(input);
			this.dispatchEvent(new Event('update'));
		});

		// Blur on enter press
		input.addEventListener('keypress', ev => {
			if (ev.key === 'Enter') input.blur();
		});

		// Validate numbers on blur
		if (input.type === 'number') {
			input.addEventListener('blur', () => {
				let v = +input.value;
				if (format.type === 'int') v = Math.floor(v);
				if (format.min !== undefined) v = Math.max(format.min, v);
				if (format.max !== undefined) v = Math.min(format.max, v);
				input.value = v.toString();
			});
		}

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

	#selectRow(index: number) {
		this.firstElementChild.children[this._selected_row+1].classList.remove('active');
		this.firstElementChild.children[(this._selected_row = index)+1].classList.add('active');
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
		this.firstElementChild.replaceChildren(this.#createHeader());
		for (let i=0; i<this._data.length; i++) {
			this.firstElementChild.appendChild(this.#createRow(i));
		}
	}
}
