export class EditNumberElement extends HTMLInputElement {
	_data?: Record<string, any>;
	_key?: string;
	
	static register() {
		customElements.define('edit-number', this, { extends: 'input' });
	}

	setValue(v: number) {
		this.value = this._formatValue(v);
		if (this._data && this._key) this._data[this._key] = v;
	}
	
	_formatValue(v: number) {
		if (this.step) v = Math.floor(v / +this.step) * +this.step;
		if (this.min) v = Math.max(v, +this.min);
		if (this.max) v = Math.min(v, +this.max);

		// Ensure that we have a decimal point if this is a float input.
		const as_string = v.toString();
		const has_decimal = as_string.includes('.');
		return (this.step || has_decimal) ? as_string : v.toFixed(1);
	}

	constructor() {
		super();
		this.type = 'number';

		// Correct value on update.
		this.addEventListener('blur', () => {
			const nValue = +this.value;
			this.setValue(nValue);
			this.dispatchEvent(new CustomEvent('update', { detail: +this.value }));
		});
	}
	
	addEventListener(type: 'update', listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: unknown, listener: unknown, options?: unknown): void {
		// @ts-expect-error shit
		super.addEventListener(type, listener, options);
	}

	setModel(data: Record<string, any>, key: string) {
		this._data = data;
		this._key = key;
		this.forceUpdate();
	}

	forceUpdate() {
		if (!this._data || !this._key) return false;
		this.value = this._data[this._key];
	}
}
