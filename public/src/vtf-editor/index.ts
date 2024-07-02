//@ts-nocheck

console.log('Starting up Vtf preview webview...');

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

/** @typedef {{ type: 'update', width: number, height: number, data: Uint8Array } | { type: 'error', message: string }} ViewerUpdate */

/** @param {MessageEvent<ViewerUpdate>} message */
window.onmessage = (message) => {
	const update = message.data;

	if (update.type === 'error') {
		document.body.innerHTML = `<code></code>`;
		document.body.firstChild.innerText = update.message;
	}

	if (update.type === 'update') {
		const image = new ImageData(new Uint8ClampedArray(update.data), update.width, update.height);
		canvas.width = update.width;
		canvas.height = update.height;
		ctx.putImageData(image, 0, 0);
		document.querySelector('#info-version')!.innerText = '7.' + update.version;
		document.querySelector('#info-size')!.innerText = update.width + 'x' + update.height;
		document.querySelector('#info-format')!.innerText = update.format;
		document.querySelector('#info-mipmaps')!.innerText = update.mipmaps;
		document.querySelector('#info-frames')!.innerText = update.frames;
		document.querySelector('#info-faces')!.innerText = update.faces;
		document.querySelector('#info-slices')!.innerText = update.slices;
	}
};

let scale = 1.0;
window.onwheel = (event) => {
	scale *= 1 - event.deltaY * 0.0005;
	if (scale < 0.001) scale = 0.001;
	if (scale > 1000) scale = 1000;
	canvas.style.transform = 'scale('+scale+')';
};
