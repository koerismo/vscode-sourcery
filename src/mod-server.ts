import { Server, createServer } from 'http';
import { modFilesystem } from './mod-mount.js';
import { ExtensionContext } from 'vscode';

/** The port which the server will be hosted on. */
export const HOST_PORT = 50001;

export class MountServerManager {
	static #server: Server | null = null;
	static #context: ExtensionContext;

	static register(context: ExtensionContext) {
		this.#context = context;
		return this;
	}

	static dispose() {
		if (this.#server) this.#server.close();
	}
	
	static async startup(): Promise<void> {
		if (this.#server) return Promise.resolve();
		console.log('Starting up mod filesystem server...');
		return new Promise(resolve => {
			this.#server = createServer(async (req, res) => {
				// This is really shit security-wise, but in this context it's still pretty bad but not quite enough for me to care.
				if (!req.headers.origin?.startsWith('vscode-webview://')) {
					res.writeHead(403);
					res.end();
					return;
				}
				if (!modFilesystem.isReady()) {
					res.writeHead(500);
					res.end();
					return;
				}
				// Not ideal, but it doesn't really matter since we're hosting this on a port that is
				// most likely going to be blocked on every system.
				res.writeHead(200, { 'access-control-allow-origin': '*' });
				const out = await modFilesystem.gfs.readFile(req.url!, undefined, true);
				if (!out) {
					res.end();
					return;
				}
				res.end(out);

			}).listen(HOST_PORT, 'localhost', () => {
				console.log('Listening for requests!');
				resolve();
			});
		});
	}
}