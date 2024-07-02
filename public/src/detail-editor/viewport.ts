import * as Three from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { resetViewportDetails, updateViewportDetailUVs, updateViewportDetails } from './viewport-detail.js';
import { Detail } from './detail-file.js';
import { ImageDataLike } from './index.js';

export const URL_ROOT = document.querySelector('head meta[name=root]')!.getAttribute('content')!;

// Setup renderer
const renderer = new Three.WebGLRenderer({ canvas: document.querySelector('#viewport')!, alpha: false, antialias: true });
const bounds = renderer.domElement.getClientRects()[0];
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( bounds.width, bounds.height );
renderer.setAnimationLoop( render );

// Setup camera
const camera = new Three.PerspectiveCamera( 60, bounds.width / bounds.height, 1, 2048 );
const controls = new OrbitControls(camera, renderer.domElement);

// Setup scene
const scene = new Three.Scene();
scene.background = new Three.Color(0x222222);
scene.add(new Three.GridHelper(512, 8));
scene.add(new Three.AmbientLight(0xffffff));

// Load text label
new OBJLoader().load(URL_ROOT+'/public/assets/128x.obj', data => {
	data.scale.multiplyScalar(1.5);
	const d1 = data;
	const d2 = data.clone();
	d1.translateX(65);
	d1.translateZ(60);
	scene.add(d1);
	d2.rotateY(-Math.PI/2);
	d2.translateX(65);
	d2.translateZ(-59);
	scene.add(d2);
});

// Ground texure handles
let groundTex1: Three.DataTexture;
let groundTex2: Three.DataTexture;

const groundMat = new Three.ShaderMaterial({
	vertexShader: `
	void main() {
		gl_Position = projectionMatrix * modelViewMatrix * Vector4(position, 1.0);
	}`,
	fragmentShader: `
	attribute float alpha;
	varying vec4 map;
	varying vec4 map2;

	void main() {
		gl_FragColor = map * alpha + map2 * (1 - alpha); // vec4(1.0, 0.0, 0.0, 1.0);
	}`,
	uniforms: {
		map: { value: null },
		map2: { value: null }
	}
});

const groundGeo = new Three.PlaneGeometry(128, 128, 4, 4).rotateX(-Math.PI/2).toNonIndexed();
groundGeo.setAttribute('alpha', new Three.BufferAttribute(new Float32Array(6 * 4 * 4).fill(Math.random() > 0.5 ? 1 : 0), 1));
const ground = new Three.Mesh(groundGeo, groundMat);
scene.add(ground);

const detailMat = new Three.MeshBasicMaterial({
	side: Three.DoubleSide,
	alphaTest: 0.5,
	alphaToCoverage: true,
});

let _resizeTimeout: any = null;
window.addEventListener('resize', () => {
	if (_resizeTimeout) clearTimeout(_resizeTimeout);
	_resizeTimeout = setTimeout(() => {
		const bounds = renderer.domElement.getClientRects()[0];
		renderer.setSize(bounds.width, bounds.height, false);
		camera.aspect = bounds.width / bounds.height;
		camera.updateProjectionMatrix();
	}, 100);
});

// Initial camera position
camera.position.set(128, 128, 128);
controls.update();

// Detail test
// resetViewportDetails({
// 	density: 200000,
// 	type: 'amogus',
// 	groups: [
// 		{alpha: 0.0, name: 'A', props: [
// 			{ amount: 1.0, kind: DetailKind.Sprite, detailOrientation: DetailOrientation.AllAxes, sway: 0.2, name: 'amogus1', sprite: { x: 0, y: 0, w: 256, h: 256, imageWidth: 256 }, spritesize: { x: 0.5, y: 0.5, w: 16, h: 16 } }
// 		]},
// 		{alpha: 1.0, name: 'B', props: [
// 			{ amount: 1.0, kind: DetailKind.Sprite, detailOrientation: DetailOrientation.AllAxes, sway: 0.2, name: 'amogus2', sprite: { x: 0, y: 0, w: 256, h: 256, imageWidth: 256 }, spritesize: { x: 0.5, y: 0.5, w: 16, h: 16 } }
// 		]}
// 	]
// }, scene, planeGeo, detailMat);

// Render loop
function render(time: number) {
	controls.update();
	updateViewportDetails(camera, time);
	renderer.render(scene, camera);
}

/** Exposed functions for API */

export function setActiveDetail(detail: Detail|undefined) {
	resetViewportDetails(detail, scene, groundGeo, detailMat);
}

export function updateActiveDetailBounds() {
	updateViewportDetailUVs();
}

export function setDetailTexture(texture: ImageDataLike) {
	if (detailMat.map) detailMat.map.dispose();
	detailMat.map = new Three.DataTexture(texture.data, texture.width, texture.height, Three.RGBAFormat, Three.UnsignedByteType);
	detailMat.map.magFilter = Three.LinearFilter;
	detailMat.map.minFilter = Three.LinearFilter;
	detailMat.map.needsUpdate = true;
	detailMat.map.colorSpace = Three.SRGBColorSpace;
	detailMat.needsUpdate = true;
}

export function setGroundTexture(texture: ImageDataLike, texture2?: ImageDataLike) {
	if (groundTex1) groundTex1.dispose();
	if (groundTex2) groundTex2.dispose();

	groundTex1 = new Three.DataTexture(texture.data, texture.width, texture.height, Three.RGBAFormat, Three.UnsignedByteType);
	groundTex1.magFilter = Three.LinearFilter;
	groundTex1.minFilter = Three.LinearFilter;
	groundTex1.needsUpdate = true;
	groundTex1.colorSpace = Three.SRGBColorSpace;
	groundMat.uniforms.map.value = groundTex1;
	
	if (texture2) {
		groundTex2 = new Three.DataTexture(texture2.data, texture2.width, texture2.height, Three.RGBAFormat, Three.UnsignedByteType);
		groundTex2.magFilter = Three.LinearFilter;
		groundTex2.minFilter = Three.LinearFilter;
		groundTex2.needsUpdate = true;
		groundTex2.colorSpace = Three.SRGBColorSpace;
		groundMat.uniforms.map2.value = groundTex2;
	}
	else {
		groundMat.uniforms.map2.value = groundTex1;
	}

	groundMat.needsUpdate = true;
}
