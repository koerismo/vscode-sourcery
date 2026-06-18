// This is *actually* exported at vtf-js/utils, but Webpack is illiterate and so my hand is forced.
// If you're trying to build this - You have to add the "./*" export in the vtf-js package.json to prevent it from shitting itself.
// import { setCompressionMethod } from 'vtf-js/dist/core/utils.js';
import { VCompressionMethods, registerCodec, VFormats, VEncodedImageData, VImageData } from 'vtf-js';
// import * as dxt from 'dxt';
// const DXT_COMMON = dxt.kColourIterativeClusterFit | dxt.kColourMetricUniform;

// import 'vtf-js/dist/addons/compress/node.js';
// import 'vtf-js/dist/addons/squish.js';
