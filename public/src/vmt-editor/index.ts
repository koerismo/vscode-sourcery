import { Main } from '../shared/Main';

declare function acquireVsCodeApi(): { postMessage(message: any): void };

const vscode = acquireVsCodeApi();

export function modFetch(resolvedPath: string): Promise<Uint8Array | null> {
	return new Promise((resolve) => {
		const onMessage = (event: MessageEvent): void => {
			const message = event.data;
			if (message.path !== resolvedPath) return;
			removeEventListener('message', onMessage);
			console.log('RESOLVED!', message);

			const buf = message.data;
			if (!buf) return resolve(null);
			resolve(buf);
		};

		addEventListener('message', onMessage);
		vscode.postMessage({ path: resolvedPath, fromSelf: true });
	});
}

// God help us all
const main = new Main();
