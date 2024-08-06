// @ts-check

const path = require('path');
const isProduction = process.env.NODE_ENV === 'production';

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const config = {
    entry: {
		// 'noclip': './public/src/shared/NoclipApi.ts',
		'detail-editor': { import: './public/src/detail-editor/index.ts' },
		'mdl-editor': { import: './public/src/mdl-editor/index.ts' }, // , dependOn: 'noclip' 
		'vmt-editor': { import: './public/src/vmt-editor/index.ts' }, // , dependOn: 'noclip' 
		// 'vmt-browser': './public/src/vmt-browser/index.ts',
		'soundscape-editor': './public/src/soundscape-editor/index.ts',
		'vtf-editor': './public/src/vtf-editor/index.ts',
	},
    output: {
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        // Add your plugins here
        // Learn more about plugins from https://webpack.js.org/configuration/plugins/
    ],
	resolve: {
		extensions: ['.tsx', '.ts', '.jsx', '.js', '...'],
		extensionAlias: {
			'.js': ['.js', '.ts'],
		},
	},
    module: {
		parser: {
			javascript : { importMeta: false }
		},
        rules: [
            {
                test: /\.(ts|tsx)$/i,
                loader: 'ts-loader',
                exclude: ['/node_modules/'],
            },
            {
                test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
                type: 'asset',
            },
			{
				test: /\.css$/i,
				use: ['style-loader', 'css-loader'],
			},

            // Add your rules for custom modules here
            // Learn more about loaders from https://webpack.js.org/loaders/
        ],
    },
	optimization: {
		// runtimeChunk: 'single',
		// usedExports: true,
		// sideEffects: true
	},
	experiments: {
		syncWebAssembly: true
	},
};

module.exports = () => {
    if (isProduction) {
        config.mode = 'production';
    } else {
        config.mode = 'development';
    }
    return config;
};
