console.log('Starting up Vmt preview webview...');

const SIZE = 1.4;

import * as Three from './three.module.min.js';
// import * as Three from 'three';

const phongConfig = {
	enable: false,
	scale: 1.0,
	mask: undefined,
	exponent: undefined,
};

/** @type {HTMLCanvasElement} */
const canvas = document.querySelector('canvas');
const renderer = new Three.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
// const camera = new Three.OrthographicCamera(-SIZE, SIZE, SIZE, -SIZE, 0.1, 10);
const camera = new Three.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 10);
camera.position.set(-3, 0, 0);
camera.lookAt(0, 0, 0);

const scene = new Three.Scene();
scene.background = await new Three.TextureLoader().loadAsync(import.meta.url.replace('index.js', 'background.jpg'));
scene.background.colorSpace = Three.SRGBColorSpace;
scene.background.mapping = Three.EquirectangularReflectionMapping;
scene.backgroundBlurriness = 0.2;

const envmap = new Three.Texture(scene.background);
envmap.mapping = Three.EquirectangularReflectionMapping;

const SUN_OFFSET = 50 * Math.PI / 180;
const sun = new Three.DirectionalLight(0xE6ECED, 1.0);
sun.position.set(1, 0.5, 0);
sun.lookAt(0, 0, 0);
scene.add(new Three.AmbientLight(0x4F83BA, 1.7));
scene.add(sun);

const geometry = new Three.SphereGeometry(1.0, 16, 16);
const material = new Three.MeshPhongMaterial({
	envMap: scene.background,
	reflectivity: 0.0,
	combine: Three.AddOperation,
});
const mesh = new Three.Mesh(geometry, material);
scene.add(mesh);

// Resize update callback
function updateSize() {
	const aspect = window.innerWidth / window.innerHeight;
	// camera.top    = SIZE * aspect;
	// camera.bottom = -SIZE * aspect;
	camera.aspect = aspect;
	camera.updateProjectionMatrix();
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.render(scene, camera);
}

// Material update callback
function updateMaterial() {
	material.needsUpdate = true;
	renderer.render(scene, camera);
}

/**
 * @param {ViewerUpdate} update
 * @param {{ flip_g: boolean, no_alpha: boolean }} options
 */
function loadImage(update, options) {
	if (options) {
		const length = update.data.length;
		for (let i=0; i<length; i+=4) {
			if (options.flip_g) update.data[i+1] = 255 - update.data[i+1];
			if (options.no_alpha) update.data[i+3] = 255;
		}
	}
	const tex = new Three.DataTexture(update.data, update.width, update.height);
	tex.colorSpace = update.srgb ? Three.SRGBColorSpace : Three.LinearSRGBColorSpace;
	if (update.nearest) tex.magFilter = Three.NearestFilter;
	tex.needsUpdate = true;
	return tex;
}

/** @typedef {{ type: 'update', field: string, width: number, height: number, data: Uint8Array, srgb: boolean, nearest: boolean }} FieldUpdate */
/** @typedef {{ translucent: 0|1|2, envmap: boolean, envmapTint: number, phong: boolean, phongAmount: number, tint: number, phongTint: number, phongExponent: number|ImageData }} Config */
/** @typedef {({ type: 'update' } & FieldUpdate) | ({ type: 'config' } & Config) | { type: 'error', message: string }} ViewerUpdate */
/** @param {MessageEvent<ViewerUpdate>} message */
window.onmessage = (message) => {
	const update = message.data;
	// console.log('Received update', update.type, update.field);

	if (update.type === 'error') {
		document.body.innerText = message;
	}

	else if (update.type === 'update') {
		switch (update.field) {
			case 'basetexture':
				material.map = loadImage(update);
				break;
			case 'bumpmap':
				material.normalMap = loadImage(update, { flip_g: true, no_alpha: true });
				break;
			case 'specularmap':
				material.specularMap = loadImage(update);
				break;
		}
	}

	else if (update.type === 'config') {
		material.color = new Three.Color(update.tint);

		// Alpha
		material.transparent = update.translucent === 2;
		material.alphaTest = (update.translucent === 1) * 0.5;

		// Reflectivity
		material.reflectivity = +update.envmap * update.envmapTint;
		material.normalScale = new Three.Vector2(update.bumpScale, update.bumpScale);

		// Phong
		if (update.phong) {
			material.specular = new Three.Color(update.phongTint.r, update.phongTint.g, update.phongTint.b);
			if (typeof update.phongExponent === 'number')	material.shininess = update.phongExponent;
			else											material.specularMap = loadImage(update.phongExponent);
		}
		else {
			material.specular = new Three.Color(0x000000);
		}
	}

	updateMaterial();
};

// Re-render on resize
window.addEventListener('resize', () => updateSize());
window.addEventListener('mousemove', (event) => {
	if (!event.buttons) return;
	scene.backgroundRotation.y += event.movementX * 0.02;
	const r = scene.backgroundRotation.y;
	material.envMapRotation.y = r;
	sun.position.set(Math.cos(-r + SUN_OFFSET), 0.5, Math.sin(-r + SUN_OFFSET));
	sun.lookAt(0, 0, 0);
	renderer.render(scene, camera);
});

// Initial update
updateSize();
updateMaterial();
