import { platform } from 'os';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { modFilesystem } from '../mod-mount.js';

export function revealFile(path: string) {
	let process: ChildProcessWithoutNullStreams;
	
	switch (platform()) {
		case 'win32':
			process = spawn('explorer', [path]);
			break;
		case 'linux':
			process = spawn('xdg-open', [path]);
			break;
		default:
			process = spawn('open', ['-R', path]);
			break;
	}

	process.once('error', (e) => {
		process.kill();
		throw e;
	});
}

export function revealGamePath() {
	if (!modFilesystem.isReady()) return false;
	if (!modFilesystem.gfs.gameroot) return false;
	revealFile(modFilesystem.gfs.gameroot);
}
