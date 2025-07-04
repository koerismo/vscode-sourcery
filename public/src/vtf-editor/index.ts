import type { VImageData, VPixelArray } from 'vtf-js';

console.log('Starting up Vtf preview webview...');

let image: ImageData|null = null;
let image_no_alpha: ImageData|null = null;
let image_alpha: ImageData|null = null;

type ViewerUpdate = {
	type: 'update';
	width: number;
	height: number;
	data: ArrayBufferLike;
	dataType: 'Uint8Array' | 'Uint16Array' | 'Float32Array';

	format: string;
	version: number;
	mipmaps: number;
	frames: number;
	faces: number;
	slices: number;
} | {
	type: 'error';
	message: string;
};

// function makeImageData(image: VImageData, rgb: boolean, alpha: boolean, hdr: boolean, exposure: number) {
// 	const out = new Uint8ClampedArray(image.data.length);
// 	for (let i=0; i<out.length; i+=4) {
// 		out[i]   = image.data[i],
// 		out[i+1] = image.data[i+1],
// 		out[i+2] = image.data[i+2],
// 		out[i+3] = image.data[i+2];
// 	}
// 	return new ImageData(out, image.width, image.height);
// }

function removeAlpha(image: ImageData): ImageData {
	const out = new Uint8ClampedArray(image.data.length);
	for (let i=0; i<out.length; i+=4) {
		out[i]   = image.data[i],
		out[i+1] = image.data[i+1],
		out[i+2] = image.data[i+2],
		out[i+3] = 255;
	}
	return new ImageData(out, image.width, image.height);
}

function onlyAlpha(image: ImageData): ImageData {
	const out = new Uint8ClampedArray(image.data.length);
	for (let i=0; i<out.length; i+=4) {
		out[i]   = image.data[i+3],
		out[i+1] = image.data[i+3],
		out[i+2] = image.data[i+3],
		out[i+3] = 255;
	}
	return new ImageData(out, image.width, image.height);
}

class ViewManager {
	static canvas: HTMLCanvasElement = document.querySelector('canvas')!;
	static ctx: CanvasRenderingContext2D = this.canvas.getContext('2d')!;
	static button_color: HTMLButtonElement = document.querySelector('button.rgb')!;
	static button_alpha: HTMLButtonElement = document.querySelector('button.a')!;
	static using_color: boolean = true;
	static using_alpha: boolean = true;

	static image: ImageData;
	static imageA?: ImageData;
	static imageRGB?: ImageData;

	static {
		this.button_color.addEventListener('click', () => this.toggleColor());
		this.button_alpha.addEventListener('click', () => this.toggleAlpha());

		let scale = 1.0;
		window.addEventListener('wheel', (event) => {
			scale *= 1 - event.deltaY * 0.0005;
			if (scale < 0.001) scale = 0.001;
			if (scale > 1000) scale = 1000;
			this.canvas.style.transform = 'scale('+scale+')';
		});

	}

	static setImage(image: ImageData): void {
		this.image = image;
		this.imageA = undefined;
		this.imageRGB = undefined;
		this.toggleAlpha(true, false);
		this.toggleColor(true, false);
		this.updateImage();
	}

	static toggleColor(force?: boolean, doUpdate=true): void {
		if (this.using_color && !this.using_alpha) return this.toggleAlpha(true);
		this.using_color = force ?? !this.using_color;
		this.button_color.classList.toggle('off', !this.using_color);
		if (doUpdate) this.updateImage();
	}

	static toggleAlpha(force?: boolean, doUpdate=true): void {
		if (this.using_alpha && !this.using_color) return this.toggleColor(true);
		this.using_alpha = force ?? !this.using_alpha;
		this.button_alpha.classList.toggle('off', !this.using_alpha);
		if (doUpdate) this.updateImage();
	}

	static updateImage(): void {
		let img: ImageData;
		if (this.using_color && this.using_alpha) img = this.image;
		else if (this.using_alpha) img = this.imageA ?? (this.imageA = onlyAlpha(this.image));
		else if (this.using_color) img = this.imageRGB ?? (this.imageRGB = removeAlpha(this.image));
		else throw Error('whoops');
		this.canvas.width = img.width;
		this.canvas.height = img.height;
		this.ctx.putImageData(img, 0, 0);
	}
}

function multiplyData(x: VPixelArray, amount: number) {
	for (let i=0; i<x.length; i++)
		x[i] *= amount;
}

window.onmessage = (message: MessageEvent<ViewerUpdate>) => {
	const update = message.data;

	if (update.type === 'error') {
		document.body.innerHTML = `<code></code>`;
		(<HTMLElement>document.body.firstChild).innerText = update.message;
	}

	if (update.type === 'update') {
		let dataSource: ArrayBufferLike | Uint16Array | Float32Array = update.data;
		switch (update.dataType) {
			case 'Uint8Array': break;
			case 'Uint16Array': { dataSource = new Uint16Array(update.data); break; }
			case 'Float32Array': { dataSource = new Float32Array(update.data); multiplyData(dataSource, 255); break; }
		}

		image = new ImageData(new Uint8ClampedArray(<ArrayBuffer>dataSource), update.width, update.height);
		ViewManager.setImage(image);
		document.querySelector<HTMLElement>('#info-version')!.innerText = '7.' + update.version;
		document.querySelector<HTMLElement>('#info-size')!.innerText = update.width + 'x' + update.height;
		document.querySelector<HTMLElement>('#info-format')!.innerText = update.format;
		document.querySelector<HTMLElement>('#info-mipmaps')!.innerText = update.mipmaps.toString();
		document.querySelector<HTMLElement>('#info-frames')!.innerText = update.frames.toString();
		document.querySelector<HTMLElement>('#info-faces')!.innerText = update.faces.toString();
		document.querySelector<HTMLElement>('#info-slices')!.innerText = update.slices.toString();
	}
};
