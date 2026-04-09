import { Server, createServer } from 'node:http';
import { modFilesystem } from './mod-mount.js';
import { ExtensionContext, Uri } from 'vscode';
import { outConsole } from './extension.js';

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
		outConsole.log('Starting up mod filesystem server...');
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
				const urlObj = Uri.parse(req.url!);
				const out = await modFilesystem.gfs.readFile(urlObj.path.toLowerCase(), undefined, false);

				// No results!
				if (!out) {
					res.writeHead(404);
					res.end();
					return;
				}

				res.writeHead(200, { 'access-control-allow-origin': '*', 'content-length': out.length });
				res.end(out);

			}).listen(HOST_PORT, 'localhost', () => {
				outConsole.log('Listening for requests!');
				resolve();
			});
		});
	}
}