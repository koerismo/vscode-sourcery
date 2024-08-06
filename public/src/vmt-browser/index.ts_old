//@ts-nocheck

console.log('Starting up Vmt browser webview...');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

/**
 * 
 * @param {ViewerUpdate['data']} vtf 
 * @param {number} i 
 */
function drawVtfToImage(vtf, i) {
	const arr = new Uint8ClampedArray(vtf.data, 0, vtf.width * vtf.height * 4);
	const image = new ImageData(arr, vtf.width, vtf.height);
	canvas.width = vtf.width;
	canvas.height = vtf.height;
	ctx.putImageData(image, 0, 0);
	document.body.children[i].src = canvas.toDataURL();
}

/** @typedef {{ type: 'data'|'setup', data: { data: Uint8Array, width: number, height: number }, index: number, count: number }} ViewerUpdate */
/** @param {MessageEvent<ViewerUpdate>} message */
window.onmessage = (message) => {
	const update = message.data;

	if (update.type === 'setup') {
		document.body.innerHTML = '';
		console.log('Adding images of count', update.count);
		for (let i=0; i<update.count; i++) {
			const img = document.createElement('img');
			document.body.appendChild(img);
		}
	}

	if (update.type === 'update') {
		drawVtfToImage(update.data, update.index);
	}
};
