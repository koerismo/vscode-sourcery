// @ts-check

const path = require('path');
const isProduction = process.env.NODE_ENV === 'production';

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const config = {
    entry: {
		'mdl-editor': './public/src/mdl-editor/index.ts',
		'vtf-editor': './public/src/vtf-editor/index.ts',
		'vmt-editor': './public/src/vmt-editor/index.ts',
		'vmt-browser': './public/src/vmt-browser/index.ts',
	},
    output: {
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        // Add your plugins here
        // Learn more about plugins from https://webpack.js.org/configuration/plugins/
    ],
	
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

            // Add your rules for custom modules here
            // Learn more about loaders from https://webpack.js.org/loaders/
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '...'],
    },
	optimization: {
		usedExports: true,
		sideEffects: true
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
