import { VFormats, getCodec } from 'vtf-js';

class QuickVtf {
	constructor(
		public readonly width: number,
		public readonly height: number,
		public readonly format: VFormats,
		public readonly mipOffsets: number[],
		public readonly mipSizes: number[],
	) {}

	static load(data: ArrayBufferLike): QuickVtf | undefined {
		const view = new DataView(data);
		if (view.getUint32(0, true) !== 0x00667476) return;	// 0
		if (view.getUint32(4, true) !== 7) return;			// 4
		const version = view.getUint32(8, true);			// 8
		if (version < 1 || version > 6) return;
		let idx = 0;
		const headerSize = view.getUint32
		const width = view.getUint16(12, true);				// 12
		const height = view.getUint16(14, true);			// 14
		const flags = view.getUint32(16, true);				// 16
		const frameCount = view.getUint16(20, true);		// 20
		const firstFrame = view.getInt16(22, true);			// 22
		const reflectR = view.getFloat32()
	}
	
	decompressMip() {
	
	}
}
