import { JsonSet } from 'fast-vdf';
import { parse } from 'fast-vdf/dist/core.js';

export class ParsedVmt<V = string | JsonSet<string>> {
	constructor(
		public shader: string,
		public keys: JsonSet<V>,
	) {}

	static parse(text: string) {
		const p = lenientJson(text);
		const shaderKey = Object.keys(p)[0];
		const obj = p[shaderKey];
		if (typeof obj !== 'object') return new ParsedVmt(shaderKey, {});
		return new ParsedVmt(shaderKey, obj);
	}

	value(key: string): string | undefined;
	value<D>(key: string, vDefault: D): string | D;
	value(key: string, vDefault?: any): string | undefined {
		const v = this.keys[key];
		if (typeof v === 'string') return v;
		return vDefault;
	}
}

const PARENT = Symbol('parent');

interface JsonSetInternal {
	[PARENT]?: null | JsonSetInternal;
	[key: string]: JsonSetInternal | string;
}

export function lenientJson(text: string): JsonSet<string> {
	const root: JsonSetInternal = { [PARENT]: null };
	let node: JsonSetInternal = root;

	try {
		parse(text, {
			escapes: false,
			multilines: false,
			types: false,
			on_enter(key) {
				const child = { [PARENT]: node };
				node[key] = child;
				node = child;
			},
			on_key(key, value) {
				node[key] = value as string;
			},
			on_exit() {
				if (!node[PARENT]) return;
				node = node[PARENT];
			},
		});
	}
	finally {
		return root;
	}
}
