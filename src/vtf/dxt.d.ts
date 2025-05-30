declare module 'dxt' {
	export function compress(buf: Buffer, width: number, height: number, flags?: number): Buffer;
	export function decompress(buf: Buffer, width: number, height: number, flags?: number): Buffer;
    export const kDxt1 = 1;
    export const kDxt3 = 2;
    export const kDxt5 = 4;
    export const kColourClusterFit = 8;
    export const kColourRangeFit = 16;
    export const kColourMetricPerceptual = 32;
    export const kColourMetricUniform = 64;
    export const kWeightColourByAlpha = 128;
    export const kColourIterativeClusterFit = 256;
}
