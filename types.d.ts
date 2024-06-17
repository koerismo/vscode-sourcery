declare module '*.html' {
	const content: string;
	export default content;
}

declare module 'image-decode' {
	function _exports(data: ArrayBufferLike): { data: Uint8Array, width: number, height: number };
	// export = _exports;
	const _any: any;
	export = _any;
}
