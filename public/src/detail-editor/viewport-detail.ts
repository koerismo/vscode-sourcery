// import '@jstpierre/noclip.website';
// const newScene = new window.Scene.GenericSourceSceneDesc('background01', 'Background 01');
// window.noclip.init(document.querySelector<HTMLElement>('#viewport')!);
// setTimeout(() => {
// 	window.noclip._loadSceneDesc(window.Scene.sceneGroup, newScene);
// }, 1000);
// console.log('NOCLIP SHOULD BE LOADED NOW!');

import { Detail, DetailFile, DetailGroup, DetailKind, DetailOrientation, DetailProp } from './detail-file.js';
import { BoxGeometry, BufferAttribute, BufferGeometry, Camera, Euler, InstancedMesh, Material, Matrix, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, SphereGeometry, Vec2, Vector2, Vector3 } from 'three';
import { seededRandom } from 'three/src/math/MathUtils.js';

export interface EmittedProp {
	model: DetailProp;
	pos: Vector3;
	angles: Euler;
	scale: number;
}

export interface EmittedPropTarget {
	sprites: EmittedProp[];
	models: EmittedProp[];
}

// export interface DetailInstanceRecord {
// 	origin: Vector3;
// 	angles: Euler;
// 	orient: DetailOrientation;
// 	sway: number;
// 	scale: number;
// }

export type MeshDetailsMap = Map<InstancedMesh, EmittedProp[]>;

// #region Sprite Gen

let initial_rng_index = 0;
let rng_index = 0;

function resetRandom() {
	rng_index = initial_rng_index;
}

function random() {
	return seededRandom(rng_index++);
}

function noopRandom() {
	rng_index++;
}

function plane_getDetailUVs(prop: DetailProp): [Vector2, Vector2] {
	const x = prop.sprite.x,
	      y = prop.sprite.y,
	      flWidth = prop.sprite.w,
	      flHeight = prop.sprite.h,
	      flTextureSize = prop.sprite.imageWidth;

	const uv1 = new Vector2(
		(x + .5) / flTextureSize,
		(y + .5) / flTextureSize,
	);
	const uv2 = new Vector2(
		(x + flWidth - .5) / flTextureSize,
		(y + flHeight - .5) / flTextureSize,
	);

	return [uv1, uv2];
}

function plane_getDetailSize(prop: DetailProp): [Vector2, Vector2] {
	const x = prop.spritesize.x,
	      y = prop.spritesize.y,
	      flWidth = prop.spritesize.w,
	      flHeight = prop.spritesize.h;

	const ox = flWidth * x;
	const oy = flHeight * y;
	const pos1 = new Vector2(-ox, flHeight - oy);
	const pos2 = new Vector2(flWidth - ox, -oy);
	return [pos1, pos2];
}

function makePlaneGeo(uv: [Vector2, Vector2], size: [Vector2, Vector2]) {
	const geo1 = new BufferGeometry();
	const verts = new Float32Array([
		size[0].x, size[0].y, 0,
		size[0].x, size[1].y, 0,
		size[1].x, size[1].y, 0,
		size[0].x, size[0].y, 0,
		size[1].x, size[1].y, 0,
		size[1].x, size[0].y, 0,
	]);
	const uvs = new Float32Array([
		uv[0].x, uv[0].y,
		uv[0].x, uv[1].y,
		uv[1].x, uv[1].y,
		uv[0].x, uv[0].y,
		uv[1].x, uv[1].y,
		uv[1].x, uv[0].y,
	]);

	geo1.setAttribute('position', new BufferAttribute(verts, 3));
	geo1.setAttribute('uv', new BufferAttribute(uvs, 2));
	return geo1;
}

function makeSpritePropGeo(prop: DetailProp): BufferGeometry {
	if (prop.kind === DetailKind.Model) {
		return new SphereGeometry(4, 8, 8);
	}

	const plane_uv = plane_getDetailUVs(prop);
	const plane_size = plane_getDetailSize(prop);
	let plane = makePlaneGeo(plane_uv, plane_size);

	if (prop.kind === DetailKind.Sprite) {
		// Flat sprite
		return plane;
	}
	
	if (prop.sprite_shape === 'tri') {
		// Apply tri shape transformations
		plane.rotateX((prop.shape_angle ?? 0) / 180 * Math.PI);
		plane.translate(0, 0, (prop.shape_size ?? 0) * prop.spritesize.w);
	}

	// Cross / tri shape
	const plane2 = plane.clone().rotateY(Math.PI / 3 * 2);
	const plane3 = plane.clone().rotateY(Math.PI / 3 * 4);

	const combined_geo = new BufferGeometry();
	const combined_verts = new Float32Array(6 * 3 * 3);
	const combined_uvs = new Float32Array(6 * 2 * 3);

	combined_verts.set(plane.getAttribute('position').array, 0);
	combined_verts.set(plane2.getAttribute('position').array, 18);
	combined_verts.set(plane3.getAttribute('position').array, 36);

	combined_uvs.set(plane.getAttribute('uv').array, 0);
	combined_uvs.set(plane2.getAttribute('uv').array, 12);
	combined_uvs.set(plane3.getAttribute('uv').array, 24);

	combined_geo.setAttribute('position', new BufferAttribute(combined_verts, 3));
	combined_geo.setAttribute('uv', new BufferAttribute(combined_uvs, 2));

	return combined_geo;
}

// #endregion

// https://github.com/ValveSoftware/source-sdk-2013/blob/0d8dceea4310fde5706b3ce1c70609d72a38efdf/mp/src/utils/vbsp/detailobjects.cpp#L322-L354
function selectRandomGroup(d: Detail, alpha: number): DetailGroup {
	let start: number, end: number;
	for (start = 0; start < d.groups.length-1; start++) {
		if (alpha < d.groups[start+1].alpha) break;
	}

	end = start+1;
	if (end >= d.groups.length) end--;
	if (start === end) return d.groups[start];

	const dAlpha = d.groups[end].alpha - d.groups[start].alpha;
	const dist = dAlpha ? (alpha - d.groups[start].alpha) / dAlpha : 0.0;
	return d.groups[random() > dist ? start : end];
}

// https://github.com/ValveSoftware/source-sdk-2013/blob/0d8dceea4310fde5706b3ce1c70609d72a38efdf/mp/src/utils/vbsp/detailobjects.cpp#L360-L373
function selectRandomDetail(g: DetailGroup): DetailProp | null {
	const r = random();
	for (let i=0; i<g.props.length; i++) {
		if (g.props[i].amount > r) return g.props[i];
	}
	return null;
}

// https://github.com/ValveSoftware/source-sdk-2013/blob/0d8dceea4310fde5706b3ce1c70609d72a38efdf/mp/src/utils/vbsp/detailobjects.cpp#L633
function emitDetailObjectsOnFace(face: BufferGeometry, detail: Detail, target: EmittedPropTarget) {
	// Thanks to https://stackoverflow.com/a/42167138
	// Convert the geo to a non-indexed one so we get the correct vertex properties
	face = face.toNonIndexed();

	const vertAttribute = face.getAttribute('position');
	const verts = vertAttribute.array;
	const faceSize = vertAttribute.itemSize * 3;
	// const alphaAttribute = face.getAttribute('alpha');
	// const alphas = alphaAttribute.array;

	for (let vertIdx=0; vertIdx<=verts.length-faceSize; vertIdx+=faceSize) {
		// Compute area of triangle
		const edge1 = new Vector3(
			verts[vertIdx+0] - verts[vertIdx+3],
			verts[vertIdx+1] - verts[vertIdx+4],
			verts[vertIdx+2] - verts[vertIdx+5],
		);
		const edge2 = new Vector3(
			verts[vertIdx+6] - verts[vertIdx+3],
			verts[vertIdx+7] - verts[vertIdx+4],
			verts[vertIdx+8] - verts[vertIdx+5],
		);

		const areaVec = new Vector3().crossVectors(edge1, edge2);
		const normalLength = areaVec.length();
		const area = 0.5 * normalLength;

		// Compute number of samples to take
		const numSamples = area * detail.density * 0.000001;
		
		// Take a sample and randomly place an object
		for (let i=0; i<numSamples; i++) {
			let u = random(),
				v = random();
			
			// Flip if we're outside the triangle
			if (v > 1 - u) {
				u = 1 - u;
				v = 1 - v;
			}
	
			// TODO: Compute alpha
			let alpha = 1.0;

			const group = selectRandomGroup(detail, alpha);
			const model = selectRandomDetail(group);
			if (model === null) continue;

			// Convert U/V to real coordinates
			const pos = new Vector3(
				verts[vertIdx+3] + (u * edge1.x) + (v * edge2.x),
				verts[vertIdx+4] + (u * edge1.y) + (v * edge2.y),
				verts[vertIdx+5] + (u * edge1.z) + (v * edge2.z),
			);

			// const normal = new Vector3().copy(areaVec).divideScalar(-normalLength);
			// placeDetail(model, point, normal);
			const angles = new Euler(0.0, random() * Math.PI * 2, 0.0);
			let scale = 1.0;
			if (model.spriterandomscale) scale += (random() - 0.5) * model.spriterandomscale;
			else noopRandom();
			
			// Append to list for later construction
			if (model.kind === DetailKind.Model)
				target.models.push({ model, pos, angles, scale });
			else
				target.sprites.push({ model, pos, angles, scale });
		}
	}
}

function createSpriteMeshes(detail: Detail, source: EmittedPropTarget, scene: Scene, mat: Material) {
	const instDict: Map<DetailProp, InstancedMesh> = new Map();
	const meshDetailsDict: MeshDetailsMap = new Map();

	// Count up number of instances required for each prop
	const instCountDict: Map<DetailProp, number> = new Map();
	for (const prop of source.sprites) {
		instCountDict.set(prop.model, (instCountDict.get(prop.model) ?? 0) + 1);
	}
	
	// Create instanced mesh object for each prop
	for (const dgroup of detail.groups) {
		for (const dprop of dgroup.props) {
			const geo = makeSpritePropGeo(dprop);
			// const mat = new MeshBasicMaterial({ color: Math.random() * 0xffffff });
			const count = instCountDict.get(dprop) ?? 0;
			if (!count) continue;

			const mesh = new InstancedMesh(geo, mat, count);
			instDict.set(dprop, mesh);
			meshDetailsDict.set(mesh, new Array(count));
		}
	}

	// Reset to 0, reuse this as an index tracker
	for (const key of instCountDict.keys()) instCountDict.set(key, 0);

	// Setup mesh instances
	for (const prop of source.sprites) {
		// Get current instance for this prop
		const index = instCountDict.get(prop.model) ?? 0;
		instCountDict.set(prop.model, index+1);
		
		// Get mesh to index into
		const mesh = instDict.get(prop.model)!;
		
		// Apply transform to instance
		const matrix = new Matrix4().makeTranslation(prop.pos);
		matrix.multiply(new Matrix4().makeRotationFromEuler(prop.angles));
		mesh.setMatrixAt(index, matrix);

		// Save instance entry to list for later transformation
		meshDetailsDict.get(mesh)![index] = prop;
	}
	
	// Update and add instances to scene
	for (const key of instDict.keys()) {
		const mesh = instDict.get(key)!;
		mesh.instanceMatrix.needsUpdate = true;
		mesh.computeBoundingSphere();
		scene.add(mesh);
	}

	return [instDict, meshDetailsDict] as const;
}

function destroyOldMeshes(instDict: Map<DetailProp, InstancedMesh>, scene: Scene) {
	for (const key of instDict.keys()) {
		const mesh = instDict.get(key)!;
		scene.remove(mesh);
		mesh.dispose();
	}
}

// #region Viewport

export let g_currentMeshes: Map<DetailProp, InstancedMesh> | null = null;
export let g_currentInstances: MeshDetailsMap | null = null;
export function resetViewportDetails(detail: Detail|undefined, scene: Scene, geo: BufferGeometry, mat: Material) {
	if (detail) {
		resetRandom();

		const target: EmittedPropTarget = { sprites: [], models: [] };
		emitDetailObjectsOnFace(geo, detail, target);

		if (g_currentMeshes) destroyOldMeshes(g_currentMeshes, scene);
		[g_currentMeshes, g_currentInstances] = createSpriteMeshes(detail, target, scene, mat);
	}
	else {
		if (g_currentMeshes) destroyOldMeshes(g_currentMeshes, scene);
		g_currentMeshes = null;
		g_currentInstances = null;
	}

}

export function updateViewportDetails(camera: Camera, time: number) {
	if (!g_currentInstances) return;
	const camPos = camera.getWorldPosition(new Vector3());
	const camForward = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

	// TODO: Pretty much all of this should be done on the GPU instead of here. HOW??
	for (const [mesh, instances] of g_currentInstances) {
		for (let i=0; i<instances.length; i++) {
			const inst = instances[i];
			let out = new Matrix4().makeTranslation(inst.pos);
			
			if (inst.model.detailOrientation === DetailOrientation.ZAxis) {
				out.multiply(new Matrix4().lookAt(camPos, inst.pos, camera.up));
			}
			else if (inst.model.detailOrientation === DetailOrientation.AllAxes) {
				out.multiply(new Matrix4().lookAt(camPos, inst.pos, camForward));
			}
			else {
				out.multiply(new Matrix4().makeRotationFromEuler(inst.angles));
			}

			if (inst.scale !== 1.0) {
				out.multiply(new Matrix4().makeScale(inst.scale, inst.scale, inst.scale));
			}
			
			// TODO: This is totally incorrect
			if (inst.model.sway! > 0.0) {
				const s1 = Math.sin(time / 2000 + i) * inst.model.sway!;
				const s2 = Math.sin(time / 2000 - i) * inst.model.sway!;
				const sway = new Matrix4().makeShear(0, 0, s1, s2, 0, 0);
				out.multiply(sway);
			}

			mesh.setMatrixAt(i, out);
		}
		mesh.instanceMatrix.needsUpdate = true;
	}
}

export function updateViewportDetailUVs() {
	if (!g_currentMeshes) return;
	for (const [prop, mesh] of g_currentMeshes) {
		const uv = plane_getDetailUVs(prop);
		const uvattribute = mesh.geometry.getAttribute('uv');
		const new_uv_array = new Float32Array([
			uv[0].x, uv[0].y,
			uv[0].x, uv[1].y,
			uv[1].x, uv[1].y,
			uv[0].x, uv[0].y,
			uv[1].x, uv[1].y,
			uv[1].x, uv[0].y,
		]);

		// TODO: This is dumb code that assumes everything is a plane. DO NOT TRUST.
		const target_uv_array = uvattribute.array;
		const plane_count = uvattribute.count / 6;
		console.log(plane_count, target_uv_array, new_uv_array);

		let planeIdx = 0;
		for (let i=0; i<plane_count; i++, planeIdx += new_uv_array.length) {
			target_uv_array.set(new_uv_array, planeIdx);
		}

		uvattribute.needsUpdate = true;
	}
}

// #endregion