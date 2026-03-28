import { KeyV, KeyVChild, KeyVRoot, KeyVSet } from 'fast-vdf';
import { parse } from 'fast-vdf/dist/core.js';

export default function lenientParse(text: string): KeyVRoot<string> {
	const root = new KeyVRoot<string>();
	let node: KeyVSet | KeyVRoot = root;

	try {
		parse(text, {
			escapes: false,
			multilines: false,
			types: false,
			on_enter(key) {
				const child = new KeyVSet(key);
				node.add(child);
				node = child;
			},
			on_key(key, value, query) {
				node.add(new KeyV(key, value, query));
			},
			on_exit() {
				if (node.parent)
					node = node.parent;
			},
		});
	}
	finally {
		return root;
	}

}
