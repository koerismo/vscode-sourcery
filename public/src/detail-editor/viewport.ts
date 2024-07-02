import * as Three from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { resetViewportDetails, updateViewportDetails } from './viewport-detail.js';
import { Detail, DetailKind, DetailOrientation } from './detail-file.js';
import { ImageDataLike } from './index.js';

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

const planeMat = new Three.MeshBasicMaterial();
const planeGeo = new Three.PlaneGeometry(128, 128, 4, 4).rotateX(-Math.PI/2);
const plane = new Three.Mesh(planeGeo, planeMat);
scene.add(plane);

const detailMat = new Three.MeshBasicMaterial({
	side: Three.DoubleSide,
	alphaTest: 0.5,
	alphaToCoverage: true,
});

window.addEventListener('resize', () => {
	const bounds = renderer.domElement.getClientRects()[0];
	renderer.setSize(bounds.width, bounds.height, false);
	camera.aspect = bounds.width / bounds.height;
	camera.updateProjectionMatrix();
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

export function setActiveDetail(detail: Detail|undefined) {
	resetViewportDetails(detail, scene, planeGeo, detailMat);
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

export function setGroundTexture(texture: ImageDataLike) {
	if (planeMat.map) planeMat.map.dispose();
	planeMat.map = new Three.DataTexture(texture.data, texture.width, texture.height, Three.RGBAFormat, Three.UnsignedByteType);
	planeMat.map.magFilter = Three.LinearFilter;
	planeMat.map.minFilter = Three.LinearFilter;
	planeMat.map.needsUpdate = true;
	planeMat.map.colorSpace = Three.SRGBColorSpace;
	planeMat.needsUpdate = true;
}
