// This is *actually* exported at vtf-js/utils, but Webpack is illiterate and so my hand is forced.
// If you're trying to build this - You have to add the "./*" export in the vtf-js package.json to prevent it from shitting itself.
import { setCompressionMethod } from 'vtf-js/dist/core/utils.js';
import { VCompressionMethods, registerCodec, VFormats, VEncodedImageData, VImageData } from 'vtf-js';
// import * as dxt from 'dxt';
// const DXT_COMMON = dxt.kColourIterativeClusterFit | dxt.kColourMetricUniform;


import { deflateSync, inflateSync } from 'node:zlib';
import { decompress as zDecompress } from 'fzstd';

// registerCodec(VFormats.DXT1, {
// 	length(width, height) {
// 		return Math.ceil(width / 4) * Math.ceil(height / 4) * 8;
// 	},
// 	encode(image) {
// 		const buf = Buffer.from(image.data);
// 		const out = dxt.compress(buf, image.width, image.height, dxt.kDxt1 | DXT_COMMON);
// 		return new VEncodedImageData(out, image.width, image.height, VFormats.DXT1);
// 	},
// 	decode(image) {
// 		const buf = Buffer.from(image.data);
// 		const out = dxt.decompress(buf, image.width, image.height, dxt.kDxt1);
// 		return new VImageData(out, image.width, image.height);
// 	},
// });

// registerCodec(VFormats.DXT3, {
// 	length(width, height) {
// 		return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
// 	},
// 	encode(image) {
// 		const buf = Buffer.from(image.data);
// 		const out = dxt.compress(buf, image.width, image.height, dxt.kDxt3 | DXT_COMMON);
// 		return new VEncodedImageData(out, image.width, image.height, VFormats.DXT3);
// 	},
// 	decode(image) {
// 		const buf = Buffer.from(image.data);
// 		const out = dxt.decompress(buf, image.width, image.height, dxt.kDxt3);
// 		return new VImageData(out, image.width, image.height);
// 	},
// });

// registerCodec(VFormats.DXT5, {
// 	length(width, height) {
// 		return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
// 	},
// 	encode(image) {
// 		const buf = Buffer.from(image.data);
// 		const out = dxt.compress(buf, image.width, image.height, dxt.kDxt5 | DXT_COMMON);
// 		return new VEncodedImageData(out, image.width, image.height, VFormats.DXT5);
// 	},
// 	decode(image) {
// 		const buf = Buffer.from(image.data);
// 		const out = dxt.decompress(buf, image.width, image.height, dxt.kDxt5);
// 		return new VImageData(out, image.width, image.height);
// 	},
// });

setCompressionMethod(
	async (data, method, level) => {
		let nodebuffer: Buffer;
		switch (method) {
			case VCompressionMethods.Deflate:
				nodebuffer = deflateSync(data, { level });
				break;
			case VCompressionMethods.ZSTD:
				throw Error('ZSTD compression is not supported!');
				// nodebuffer = await zstdCompress(Buffer.from(data), level);
				// break;
			default:
				throw Error('Compress: Unrecognized compression method '+method+'!');
		}
		return new Uint8Array(nodebuffer);
	},
	async (data, method, _level) => {
		// data = Buffer.from(data);
		let nodebuffer: Buffer;
		switch (method) {
			case VCompressionMethods.Deflate:
				nodebuffer = inflateSync(data);
				break;
			case VCompressionMethods.ZSTD:
				return zDecompress(data);
				// nodebuffer = await zstdDecompress(Buffer.from(data));
				// break;
			default:
				throw Error('Decompress: Unrecognized compression method '+method+'!');
		}
		return new Uint8Array(nodebuffer);
	}
);

