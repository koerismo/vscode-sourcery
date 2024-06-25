// import { Main } from '../shared/Main';

// declare function acquireVsCodeApi(): { postMessage(message: any): void };

// const vscode = acquireVsCodeApi();
// const mod_uri_root = document.querySelector('meta[name=mod_uri]').getAttribute('content');
// console.log('FOUND ROOT', mod_uri_root);

export async function modFetch(resolvedPath: string): Promise<Uint8Array | null> {
	// const req = await fetch((mod_uri_root+resolvedPath).replaceAll(/\/+/g, '/'));
	const req = await fetch(`http://localhost:50001/${resolvedPath}`.replaceAll(/\/+/g, '/'));
	if (req.ok) {
		const body = await req.arrayBuffer();
		if (!body.byteLength) return null;
		return new Uint8Array(body);
	}
	return null;
	// return new Promise((resolve) => {
	// 	const onMessage = (event: MessageEvent): void => {
	// 		const message = event.data;
	// 		if (message.path !== resolvedPath) return;
	// 		removeEventListener('message', onMessage);
	// 		// console.log('RESOLVED!', message);

	// 		const buf = message.data;
	// 		if (!buf) return resolve(null);
	// 		resolve(buf);
	// 	};

	// 	addEventListener('message', onMessage);
	// 	vscode.postMessage({ path: resolvedPath, fromSelf: true });
	// });
}

// God help us all
// const main = new Main();
