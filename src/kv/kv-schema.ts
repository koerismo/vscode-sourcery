// @ts-nocheck

import type { JSONSchema4 } from 'json-schema';
import { KVPairRanged, KVSetRanged } from './kv-document.js';

function getSchemaForNode(schema: string, node: KVPairRanged | KVSetRanged): JSONSchema4 {
	return {
		type: ['number'],
		title: node.key,
		description: 'This does a thing',
	};
}
