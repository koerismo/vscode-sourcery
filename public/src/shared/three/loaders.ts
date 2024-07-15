import * as Three from 'three';
import { json as parseToJson } from 'fast-vdf';
import { ImageDataLike } from './imagelike.js';
import { VEncodedImageData, VFormats, Vtf } from 'vtf-js';
import { assert } from './utils.js';

// @ts-expect-error No types
import { SourceModelLoader } from 'source-engine-model-loader/src/SourceModelLoader.js';
declare const SourceModelLoader: typeof Three.Loader;

export const URL_ROOT = document.querySelector('head meta[name=root]')!.getAttribute('content')!;
export const SERVER_PORT = document.querySelector('head meta[name=port]')!.getAttribute('content')!;

export function localFetch(path: string) {
	return fetch(`http://localhost:${SERVER_PORT}` + normalizePath(path, '', null));
}

const RE_SLASH = /(\/|\\)+/g;
export function normalizePath(path: string, root: string='materials/', ext: string|null='.vtf') {
	path = ('/' + root + path).replace(RE_SLASH, '/').toLowerCase();
	if (ext !== null && !path.endsWith(ext)) path += ext;
	return path;
}

/** Load with GPU acceleration via three. */
export function loadSourceModel(path: string): Promise<Three.Group> {
	return new Promise(resolve => {
		new SourceModelLoader().load(path, (out) => {
			const { group, vvd, mdl, vtx, materials } = <any>out;
			resolve(group);
		});
	});
}

export async function loadVMT(path: string): Promise<{ shader: string, data: Record<string, string> }|null> {
	const resp = await localFetch(path);
	if (!resp.ok) return null;
	const body = await resp.text();
	if (!body.length) return null;
	const vmtData = parseToJson(body) as any;
	const shaderName = Object.keys(vmtData)[0];
	if (!shaderName) return null;
	return { shader: shaderName, data: vmtData[shaderName] };
}

export async function loadSourceMaterial(path: string): Promise<Three.Material|null> {
	const vmt = await loadVMT(path);
	if (!vmt) return null;
	return null;
}

export async function loadVtfAsTexture(path: string): Promise<Three.Texture> {
	const resp = await localFetch(path);
	assert(resp.ok);

	const body = await resp.arrayBuffer();
	const vtf = Vtf.decode(body);
	let slice = vtf.data.getImage(0, 0, 0, 0, true);

	let isCompressed = false;
	let pixelFormat: Three.AnyPixelFormat = Three.RGBAFormat;
	let texType: Three.TextureDataType = Three.UnsignedByteType;
	if (slice instanceof VEncodedImageData) {
		switch (slice.format) {
			case VFormats.A8:
				pixelFormat = Three.AlphaFormat;
				break;
			case VFormats.R32F:
				pixelFormat = Three.RedFormat;
				texType = Three.FloatType;
				break;
			case VFormats.I8:
				pixelFormat = Three.LuminanceFormat;
				break;
			case VFormats.RGB888:
				pixelFormat = Three.RGBFormat;
				break;
			case VFormats.RGBA8888:
				pixelFormat = Three.RGBAFormat;
				break;
			
			
			case VFormats.RGB323232F:
				pixelFormat = Three.RGBFormat;
				texType = Three.FloatType;
				break;
			case VFormats.RGBA16161616F:
				texType = Three.HalfFloatType;
				break;
			case VFormats.RGBA32323232F:
				texType = Three.FloatType;
				break;

			case VFormats.DXT1:
			case VFormats.DXT1_ONEBITALPHA:
				isCompressed = true;
				pixelFormat = Three.RGBA_S3TC_DXT1_Format;
				break;
			case VFormats.DXT3:
				isCompressed = true;
				pixelFormat = Three.RGBA_S3TC_DXT3_Format;
				break;
			case VFormats.DXT5:
				isCompressed = true;
				pixelFormat = Three.RGBA_S3TC_DXT5_Format;
				break;

			default:
				// If we don't have a quick way to make webgl handle it on the gpu, just decode the image on the cpu.
				slice = slice.decode();
		}
	}

	const tex = (isCompressed ? 
		new Three.CompressedTexture([slice], slice.width, slice.height, <Three.CompressedPixelFormat>pixelFormat)
		:
		new Three.DataTexture(slice.data, slice.width, slice.height, <Three.PixelFormat>pixelFormat, texType)
	);

	// TODO: Use actual mipmaps!
	tex.minFilter = Three.LinearFilter;
	tex.magFilter = Three.LinearFilter;

	return tex;
}

export async function loadVtfAsImage(path?: string): Promise<ImageDataLike|null> {
	if (!path) return null;
	const resp = await localFetch(path);
	if (!resp.ok) return null;

	const body = await resp.arrayBuffer();
	const vtf = Vtf.decode(body);
	return vtf.data.getImage(0, 0, 0, 0).convert(Uint8Array);
}
