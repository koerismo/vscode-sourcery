import { makeRouterConstructor } from '../../shared/router.js';

declare function acquireVsCodeApi(): { postMessage(message: any): void };
const vscode = acquireVsCodeApi();

export const makeClientRouter = makeRouterConstructor(
	onMessage => { window.onmessage = ev => onMessage(ev.data); },
	vscode.postMessage,
);
