import * as vscode from 'vscode';
import { KeyVRoot, parse as unsafeParseVdf } from 'fast-vdf';

export function parseVdf(data: string): KeyVRoot<string>|null {
	try {
		return unsafeParseVdf(data);
	}
	catch {
		return null;
	}
}

let cacheLastUpdated = 0;
let detailCache: { uri: vscode.Uri, types: string[] }[] = [];

export async function ensureCacheUpdated() {
	if (Date.now() - cacheLastUpdated > 120_000) return await updateDetailCache();
	return;
}

export async function updateDetailCache() {
	cacheLastUpdated = Date.now();

	const uris = await vscode.workspace.findFiles('**/*.vbsp', null, 32);
	const promises: Promise<void>[] = [];
	const entries: { uri: vscode.Uri, types: string[] }[] = [];
	
	const TD = new TextDecoder();
	for (const uri of uris) {
		promises.push(new Promise(async resolve => {
			const data = await vscode.workspace.fs.readFile(uri);
			const vroot = parseVdf(TD.decode(data));
			if (!vroot) return resolve();
			
			const vdir = vroot.dir('detail', null);
			if (!vdir) return resolve();

			const types = vdir.all().map(x => x.key);
			entries.push({ uri, types });
			return resolve();
		}));
	}

	await Promise.all(promises);
	detailCache = entries;
}

export async function getDetailTypes(): Promise<string[]> {
	await ensureCacheUpdated();
	return detailCache.flatMap(value => {
		return value.types;
	});
}

export async function findDetailSource(type: string): Promise<vscode.Uri | null> {
	await ensureCacheUpdated();
	for (const source of detailCache) {
		if (source.types.includes(type)) return source.uri;
	}
	return null;
}
