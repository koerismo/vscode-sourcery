//@ts-nocheck

console.log('Starting up Mdl browser webview...');

/** @typedef {{ texturedirs: string[], textures: string[], skins: number[][], name: string }} MdlInfo */
/** @typedef {{ type: 'update'|'error', data: MdlInfo, error: string }} ViewerUpdate */
/** @param {MessageEvent<ViewerUpdate>} message */
window.onmessage = (message) => {
	const update = message.data;
	const info = update.data;

	if (update.type === 'update') {
		document.body.innerHTML = `
			<h3>Name:</h3>
			<div>
			<input class="input" id="name" />
			</div>
			<h3>Textures:</h3>
			<ul id="textures"></ul>
			<h3>Searchpaths:</h3>
			<ul id="texturedirs"></ul>
			`;
			// <h3>Skins</h3>
			// <ul id="skins"></ul>
		
		document.querySelector('#name').value = info.name;

		for (let i=0; i<info.textures.length; i++) {
			const li = document.createElement('li');
			li.innerText = info.textures[i];
			document.querySelector('#textures').appendChild(li);
		}
		for (let i=0; i<info.texturedirs.length; i++) {
			const li = document.createElement('li');
			li.innerText = info.texturedirs[i];
			document.querySelector('#texturedirs').appendChild(li);
		}
	}

	if (update.type === 'error') {
		document.body.innerText = update.error;
	}
};
