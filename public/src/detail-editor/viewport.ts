import * as Three from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { resetViewportDetails, updateViewportDetails } from './viewport-detail.js';
import { Detail, DetailKind, DetailOrientation } from './detail-file.js';
import { ImageDataLike } from './index.js';

// Setup renderer
const renderer = new Three.WebGLRenderer({ canvas: document.querySelector('#viewport')! });
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

const planeGeo = new Three.PlaneGeometry(128, 128, 4, 4).rotateX(-Math.PI/2);
const plane = new Three.Mesh(planeGeo, new Three.MeshBasicMaterial({ color: 0x888888 }));
scene.add(plane);

const detailMat = new Three.MeshBasicMaterial({});

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
	detailMat.side = Three.DoubleSide;
	detailMat.map = new Three.DataTexture(texture.data, texture.width, texture.height, Three.RGBAFormat, Three.UnsignedByteType);
	detailMat.map.flipY = true;
	detailMat.alphaToCoverage = true;
	detailMat.alphaTest = 0.5;
	detailMat.map.magFilter = Three.LinearFilter;
	detailMat.map.minFilter = Three.LinearFilter;
	
	detailMat.map.needsUpdate = true;
	detailMat.needsUpdate = true;
}

export function setGroundTexture(texture: ImageDataLike) {
	// amogus
}