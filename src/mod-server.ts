import { type OutgoingHttpHeaders, Server, createServer } from 'node:http';
import { modFilesystem } from './mod-mount.js';
import { ExtensionContext, Uri } from 'vscode';
import { outConsole } from './extension.js';
import { normalize, extname } from 'node:path/posix';

/** The port which the server will be hosted on. */
export const HOST_PORT = 50001;

/** The auth secret. Must be provided to all web requests! */
export const HOST_AUTH: string = (() => {
	const arr = crypto.getRandomValues(new Uint8Array(32));
	return 'Basic ' + btoa(String.fromCharCode.apply(null, arr as unknown as number[]));
})();

const COMMON_HEADERS: OutgoingHttpHeaders = {
	'access-control-allow-origin': '*',
	'access-control-allow-headers': 'authorization'
};

const VALID_PATH = /^[/a-zA-Z0-9_\-\.\(\)]+$/;
const VALID_EXTS: string[] = [
	'.vmt', '.vtf', '.mdl', '.vtx', '.vvd', '.phy',
] as const;

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
				if (req.method === 'OPTIONS') {
					res.writeHead(200, 'OK', COMMON_HEADERS);
					res.end();
					return;
				}

				if (req.headers.authorization !== HOST_AUTH) {
					res.writeHead(401, 'Unauthorized!');
					res.end();
					return;
				}

				if (!modFilesystem.isReady()) {
					res.writeHead(500, 'Server is not ready!');
					res.end();
					return;
				}

				const urlObj = Uri.parse(req.url!);
				if (!urlObj.path.match(VALID_PATH)) {
					res.writeHead(403, 'Bad url! (Invalid characters)');
					return;
				}

				const normPath = normalize(urlObj.path.toLowerCase());
				if (normPath.startsWith('../')) {
					res.writeHead(403, 'Bad url! (Invalid backpath)');
					res.end();
					return;
				}

				const fileExt = extname(normPath);
				if (!fileExt || !VALID_EXTS.includes(fileExt)) {
					res.writeHead(403, 'Bad url! (Filetype must be whitelisted)');
					res.end();
					return;
				}
	
				const out = await modFilesystem.gfs.readFile(normPath, undefined, false);

				// No results!
				if (!out) {
					res.writeHead(404, 'File not found!', COMMON_HEADERS);
					res.end();
					return;
				}

				console.log('RES_OK:', req.url, COMMON_HEADERS);
				res.writeHead(200, {
					...COMMON_HEADERS,
					'content-length': out.length
				});

				res.end(out);

			}).listen(HOST_PORT, 'localhost', () => {
				outConsole.log('Listening for requests!');
				resolve();
			});
		});
	}
}