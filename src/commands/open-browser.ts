import * as vscode from 'vscode';
import { MaterialBrowserManager } from '../vmt-browser.js';

export default async (uri?: vscode.Uri) => {
	MaterialBrowserManager.show();
};
