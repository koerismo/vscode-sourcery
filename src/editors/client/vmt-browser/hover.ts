export class HoverManager extends HTMLElement {
	box: HTMLDivElement;
	text: HTMLSpanElement;
	pad = 0.1;

	constructor() {
		super();
		this.box = document.createElement('div');
		this.text = document.createElement('span');
		this.replaceChildren(this.box, this.text);
	}

	set(options: { x: number; y: number; w: number; h: number; text: string; }) {
		this.box.style.left = options.x + 'px';
		this.box.style.top = options.y + 'px';
		this.box.style.width = options.w + 'px';
		this.box.style.height = options.h + 'px';
		this.text.style.left = options.x + 'px';
		this.text.style.top = (options.y + options.h + this.pad) + 'px';
		this.text.textContent = options.text;
	}
}

customElements.define('hover-manager', HoverManager);
