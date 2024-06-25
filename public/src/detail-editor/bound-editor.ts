import { EditNumberElement } from './edit-number.js';
import { type ImageDataLike, makeThumb } from './index.js';

export const enum BoundDragType {
	None,
	Origin,
	All,
	TopLeft,
	BottomRight,
};

export interface Origin {
	x: number;
	y: number;
}

export interface Bound {
	x: number;
	y: number;
	w: number;
	h: number;
}

function clamp(v: number, a: number, b: number) {
	return (v >= b ? b : (v <= a ? a : v));
}

function checkV(v: number|undefined, def: number, min?: number, max?: number) {
	v ??= def;
	if (isNaN(v)) v = def;
	if (min !== undefined) v = Math.max(min, v);
	if (max !== undefined) v = Math.min(max, v);
	return v;
}

export class BoundEditorElement extends HTMLElement {
	static register() {
		customElements.define('bound-editor', this);
	}

	public image?: ImageDataLike;
	public thumbSrc?: string;
	public bGhosts: Bound[] = [];
	public bOriginal?: Bound;
	public bTarget?: Bound;
	public oOriginal?: Origin;
	public oTarget?: Origin;

	public active = false;
	public drag = BoundDragType.None;
	public snap = 1;
	
	private els!: {
		header: HTMLDivElement,
		imageContainer: HTMLDivElement,
		image: HTMLImageElement,
		ghostContainer: HTMLDivElement,
		boxContainer: HTMLDivElement,
		box: HTMLDivElement,
		origin: HTMLDivElement,
	};

	constructor() {
		super();
		this.innerHTML = `
			<div id="bound-header">
				<vscode-button>Cancel</vscode-button>
				<div>
					<label>Snap</label>
					<input is="edit-number" />
				</div>
				<vscode-button>Accept</vscode-button>
			</div>
			<main>
				<div id="bound-image">
					<img draggable="false">
					<div id="bound-ghost-layer"></div>
					<div id="bound-box-layer">
						<span id="bound-box"></span>
						<span id="bound-origin"></span>
					</div>
				</div>
			</main>
		`;

		this.els = {
			header: this.querySelector<HTMLDivElement>('#bound-header')!,
			imageContainer: this.querySelector<HTMLDivElement>('#bound-image')!,
			image: this.querySelector<HTMLImageElement>('#bound-image > img')!,
			ghostContainer: this.querySelector<HTMLDivElement>('#bound-ghost-layer')!,
			boxContainer: this.querySelector<HTMLDivElement>('#bound-box-layer')!,
			box: this.querySelector<HTMLDivElement>('#bound-box-layer > span#bound-box')!,
			origin: this.querySelector<HTMLDivElement>('#bound-box-layer > span#bound-origin')!,
		};

		const snapField = this.querySelector<EditNumberElement>('#bound-header > div > input')!;
		snapField.setModel(this, 'snap');
		// snapField.addEventListener('update', () => {
		// 	this.classList.toggle('bigsnap', this.snap >= 4);
		// });
		snapField.min = '1';
		snapField.max = '32';
		snapField.step = '1';

		// Register listener for aspect ratio changes. css makes me want to hurt people.
		window.addEventListener('resize', this.fixAspectRatio.bind(this));

		window.addEventListener('keydown', event => {
			if (!this.active) return;
			if (event.key === 'Escape') this._onCancel();
		});

		window.addEventListener('mousedown', event => {
			if (!this.active) return;
			this._onDragStart(event);
		});
		
		window.addEventListener('mouseup', event => {
			if (!this.active || !this.drag) return;
			this._onDragEnd(event);
		});

		this.addEventListener('mousemove', event => {
			if (!this.active || !this.drag) return;
			this._onDrag(event);
		});

		this.els.header.children[0].addEventListener('click', this._onCancel.bind(this));
		this.els.header.children[2].addEventListener('click', this._onAccept.bind(this));
	}

	private _onCancel() {
		if (!this.bTarget) return this.closeEditor();
		Object.assign(this.bTarget!, this.bOriginal);
		Object.assign(this.oTarget!, this.oOriginal);
		this.closeEditor();
	}

	private _onAccept() {
		this.closeEditor();
	}

	private _onDragStart(event: MouseEvent) {
		const PAD = 10;

		if (this.oTarget) {
			const obox = this.els.origin.getClientRects()[0];
			const originDist = (obox.left + obox.width/2 - event.pageX)**2 + (obox.top + obox.height/2  - event.pageY)**2;
			if (originDist < PAD**2) {
				this.drag = BoundDragType.Origin;
				return;
			}
		}

		const bbox = this.els.box.getClientRects()[0];
		const leftDist   = Math.abs(bbox.left   - event.pageX);
		const rightDist  = Math.abs(bbox.right  - event.pageX);
		const TopDist    = Math.abs(bbox.top    - event.pageY);
		const BottomDist = Math.abs(bbox.bottom - event.pageY);
		let type = BoundDragType.All;
		if (leftDist < PAD || TopDist < PAD) type = BoundDragType.TopLeft;
		if (rightDist < PAD || BottomDist < PAD) type = BoundDragType.BottomRight;
		this.drag = type;
	}

	private _onDrag(event: MouseEvent) {
		if (!this.bTarget || !this.image) return;

		let xDiff = event.movementX / 1.5;
		let yDiff = event.movementY / 1.5;
		if (event.shiftKey) {
			xDiff /= 4;
			yDiff /= 4;
		}

		if (this.oTarget && this.drag === BoundDragType.Origin) {
			if (this.bTarget.w) this.oTarget.x += xDiff / this.bTarget.w;
			if (this.bTarget.h) this.oTarget.y -= yDiff / this.bTarget.h;
			this.updateActive();
			return;
		}

		switch (this.drag) {
			case BoundDragType.All:
				this.bTarget.x = clamp(this.bTarget.x + xDiff, 0, this.image.width - this.bTarget.w);
				this.bTarget.y = clamp(this.bTarget.y + yDiff, 0, this.image.height - this.bTarget.h);
				break;
			case BoundDragType.BottomRight:
				this.bTarget.w = clamp(this.bTarget.w + xDiff, 0, this.image.width - this.bTarget.x);
				this.bTarget.h = clamp(this.bTarget.h + yDiff, 0, this.image.height - this.bTarget.y);
				break;
			case BoundDragType.TopLeft:
				const oldX = this.bTarget.x, oldY = this.bTarget.y;
				this.bTarget.x = clamp(this.bTarget.x + xDiff, 0, this.image.width - this.bTarget.w);
				this.bTarget.y = clamp(this.bTarget.y + yDiff, 0, this.image.height - this.bTarget.h);
				this.bTarget.w -= this.bTarget.x - oldX;
				this.bTarget.h -= this.bTarget.y - oldY;
				break;
		}

		this.bTarget.x = clamp(this.bTarget.x, 0, this.image.width);
		this.bTarget.y = clamp(this.bTarget.y, 0, this.image.height);
		this.bTarget.w = clamp(this.bTarget.w, 0, this.image.width - this.bTarget.x);
		this.bTarget.h = clamp(this.bTarget.h, 0, this.image.height - this.bTarget.y);
		this.dispatchEvent(new Event('update'));
		this.updateActive();
	}

	private _onDragEnd(event: MouseEvent) {
		if (!this.bTarget) return;
		const snap = this.snap;
		this.bTarget.x = Math.round(this.bTarget.x / snap) * snap;
		this.bTarget.y = Math.round(this.bTarget.y / snap) * snap;
		this.bTarget.w = Math.round(this.bTarget.w / snap) * snap;
		this.bTarget.h = Math.round(this.bTarget.h / snap) * snap;
		this.drag = BoundDragType.None;
		this.dispatchEvent(new Event('updateend'));
		this.updateActive();
	}

	public fixAspectRatio() {
		if (!this.image) return;
		const container_bb = this.els.imageContainer.parentElement!.getClientRects()[0];
		const container_aspect = container_bb.height / container_bb.width;
		const image_aspect = this.image.height / this.image.width;
		this.classList.toggle('fit-with-height', container_aspect > image_aspect);
	}

	public closeEditor() {
		this.classList.remove('active');
		this.active = false;
		this.dispatchEvent(new Event('close'));
	}

	public getCroppedImage(bound: Bound|undefined=this.bTarget, image: ImageDataLike|undefined=this.image): ImageDataLike | null {
		if (!bound || !image) return null;
		if (bound.w <= 0 || bound.h <= 0) return null;

		const width = Math.round(bound.w), height = Math.round(bound.h);
		const left = Math.round(bound.x), top = Math.round(bound.y);
		const data = new Uint8Array(bound.w * bound.h * 4);

		for (let y=0; y<height; y++) {
			for (let x=0; x<width; x++) {
				const srcIndex = ((x + left) + (y + top) * image.width) * 4;
				const destIndex = (x + y * width) * 4;
				data[destIndex]   = image.data[srcIndex],
				data[destIndex+1] = image.data[srcIndex+1],
				data[destIndex+2] = image.data[srcIndex+2],
				data[destIndex+3] = image.data[srcIndex+3];
			}
		}

		return { width, height, data };
	}

	public setImage(image: ImageDataLike) {
		this.image = image;
		this.els.image.src = this.thumbSrc = makeThumb(image);
		this.els.imageContainer.style.aspectRatio = `${image.width} / ${image.height}`;
		this.updateGhosts();
		this.updateActive();
	}

	public setGhosts(ghosts: Bound[]) {
		this.bGhosts = ghosts;
		this.updateGhosts();
	}
	
	public updateGhosts() {
		if (!this.image) return;
		this.els.ghostContainer.replaceChildren();
		for (let i=0; i<this.bGhosts.length; i++) {
			const ghost = this.bGhosts[i];
			if (ghost === this.bTarget) continue;
			const ghostEl = document.createElement('span');
			ghostEl.style.left = (ghost.x / this.image.width * 100) + '%';
			ghostEl.style.top = (ghost.y / this.image.height * 100) + '%';
			ghostEl.style.width = (ghost.w / this.image.width * 100) + '%';
			ghostEl.style.height = (ghost.h / this.image.height * 100) + '%';
			this.els.ghostContainer.appendChild(ghostEl);
		}
	}

	public updateActive() {
		if (!this.bTarget || !this.image) return;
		const box = this.els.box, bb = this.bTarget, snap = this.snap;
		box.style.left = ((Math.round(bb.x / snap) * snap / this.image.width * 100)) + '%';
		box.style.top = (Math.round(bb.y / snap) * snap / this.image.height * 100) + '%';
		box.style.width = (Math.round(bb.w / snap) * snap / this.image.width * 100) + '%';
		box.style.height = (Math.round(bb.h / snap) * snap / this.image.height * 100) + '%';

		if (this.oTarget) {
			const origin = this.els.origin, ob = this.oTarget;
			const ox = bb.x + bb.w * ob.x, oy = bb.y + bb.h * (1 - ob.y);
			origin.style.left = (ox / this.image.width * 100) + '%';
			origin.style.top = (oy / this.image.height * 100) + '%';
		}
	}

	public async editBounds(target: Partial<Bound>, origin?: Origin) {
		if (!this.image) return false;

		target.x = checkV(target.x, 0, 0, this.image.width);
		target.y = checkV(target.y, 0, 0, this.image.height);
		target.w = checkV(target.w, this.image.width, 0, this.image.width);
		target.h = checkV(target.h, this.image.height, 0, this.image.height);

		if (origin) {
			origin.x = checkV(origin.x, 0.5, 0, 1);
			origin.y = checkV(origin.y, 0.5, 0, 1);
		}

		this.bTarget = target as Bound;
		this.oTarget = origin;
		this.bOriginal = Object.assign({}, target as Bound);

		// Enable editor
		this.classList.add('active');
		this.active = true;
		this.updateGhosts();
		this.updateActive();
		this.fixAspectRatio();

		// Update origin visibility
		this.els.origin.style.display = origin ? '' : 'none';

		return true;
	}
}
