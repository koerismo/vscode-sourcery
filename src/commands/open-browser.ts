import * as vscode from 'vscode';
import { MaterialBrowserManager } from '../vmt-browser';

export default async (uri?: vscode.Uri) => {
	MaterialBrowserManager.show();
};
