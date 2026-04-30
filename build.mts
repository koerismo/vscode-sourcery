import * as esbuild from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
import { sveltePreprocess } from 'svelte-preprocess';
import { argv } from 'node:process';

const isProd = argv.includes('--prod');

console.log('———————————————— Building extension... ————————————————');

await esbuild.build({
	logLevel: 'info',
	sourceRoot: './src/',
	outdir: './dist/',
	external: ['vscode', 'node:*', 'os', 'path', 'fs'],
	resolveExtensions: ['.js', '.ts'],
	sourcemap: 'linked',
	sourcesContent: !isProd,
	bundle: true,
	minify: true,
	format: 'cjs',
	entryPoints: {
		'extension': 'src/extension.ts',
	},
	loader: {
		'.html': 'text',
		'.node': 'file'
	}
});

console.log('————————————————  Building webview...  ————————————————');

await esbuild.build({
	logLevel: 'info',
	sourceRoot: './src/webview/',
	outdir: './dist/public/',
	external: ['vscode'],
	resolveExtensions: ['.js', '.ts'],
	sourcemap: 'linked',
	sourcesContent: !isProd,
	splitting: true,
	bundle: true,
	minify: true,
	format: 'esm',
	entryPoints: {
		'detail-editor': 'src/editors/client/detail-editor/index.ts',
		'mdl-editor': 'src/editors/client/mdl-editor/index.ts',
		'soundscape-editor': 'src/editors/client/soundscape-editor/index.ts',
		'vmt-browser': 'src/editors/client/vmt-browser/index.ts',
		'vtf-editor': 'src/editors/client/vtf-editor/index.ts',
	},
	loader: {
		'.html': 'text',
		'.ttf': 'file',
	},
	plugins: [
		esbuildSvelte({
			preprocess: sveltePreprocess(),
		}),
	]
});

console.log('Done! :3');
