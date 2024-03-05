console.log('Hello from the webview!');

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

/** @typedef {{ type: 'update', width: number, height: number, data: Uint8Array } | { type: 'error', message: string }} ViewerUpdate */

/** @param {MessageEvent<ViewerUpdate>} message */
window.onmessage = (message) => {
	const update = message.data;

	if (update.type === 'error') {
		document.body.innerText = message;
	}

	if (update.type === 'update') {
		const image = new ImageData(new Uint8ClampedArray(update.data), update.width, update.height);
		canvas.width = update.width;
		canvas.height = update.height;
		ctx.putImageData(image, 0, 0);
	}
};
