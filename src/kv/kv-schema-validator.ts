import * as vscode from 'vscode';

import type { JSONSchema4 } from 'json-schema';
import { KVPairRanged, KVRootRanged, KVSetRanged, KVType, keyValuesCache } from './kv-document.js';

function getSchemaCompletions(schema: JSONSchema4, isKey: boolean): vscode.CompletionItem[] {
	const out: vscode.CompletionItem[] = [];

	if (isKey) {
		if (schema.properties) {
			for (const key in schema.properties) {
				const subSchema = schema.properties[key];
				out.push({ label: key, detail: subSchema.description });
			}
		}
		return out;
	}

	if (schema.default && schema.type && schema.type !== 'object') {
		out.push({ label: schema.default.toString() });
	}

	if (schema.type === 'array') {
		out.push({
			label: '[...]',
			insertText: new vscode.SnippetString('[').appendTabstop().appendText(']')
		});
		out.push({
			label: '{...}',
			insertText: new vscode.SnippetString('{').appendTabstop().appendText('}')
		});
	}

	else if (schema.type === 'boolean') {
		out.push({ label: 'true' }, { label: 'false' });
	}

	return out;
}

export function getSchemaCompletionsForNode(schema: JSONSchema4, isKey: boolean, node: KVPairRanged | KVSetRanged) {
	const path = keyValuesCache.nodeKeyPath(node);
	if (isKey) path.pop();

	// const matchingSchemas: JSONSchema4[] = [];
	// console.log('Using path:', path);

	let schemaNode: JSONSchema4 | undefined = schema;
	for (let i=0; i<path.length; i++) {
		const folder = path[i];

		if (schemaNode.properties && folder in schemaNode.properties!) {
			schemaNode = schemaNode.properties[folder];
			continue;
		}

		if (schemaNode.additionalProperties && typeof schemaNode.additionalProperties === 'object') {
			schemaNode = schemaNode.additionalProperties;
			continue;
		}

		schemaNode = undefined;
		break;
	}

	// console.log('schemaNode:', schemaNode, '  isKey:', isKey);

	if (!schemaNode) return [];
	return getSchemaCompletions(schemaNode, isKey);
}

const ClosingBrackets = {
	'[': ']',
	'{': '}'
} as const;

/**
 * Validates a KeyValues document with a JSON Schema.
 * ### !!! CURRENTLY, THIS IMPLEMENTATION ONLY SUPPORTS A TINY SUBSET OF THE SPEC !!!
 * 
 * Supports:
 * `type`, `properties`, `additionalProperties`
 */
export function validateDocument(
	doc: vscode.TextDocument,
	rootNode: KVRootRanged | KVSetRanged,
	rootSchema: JSONSchema4,
): vscode.Diagnostic[] {

	function pushError(errors: vscode.Diagnostic[], node: KVSetRanged | KVPairRanged | undefined, err: string) {
		const v = node && node.type === KVType.Pair && node.value_end !== 0;
		const range = node
			? new vscode.Range(
				doc.positionAt(v ? node.value_start : node.key_start),
				doc.positionAt(v ? node.value_end : node.key_end))
			: new vscode.Range(doc.positionAt(0), doc.positionAt(1));

		errors.push(new vscode.Diagnostic(range, err, vscode.DiagnosticSeverity.Error));
	}

	function dictifySet(set: KVSetRanged) {
		const out: Record<string, KVSetRanged | KVPairRanged> = {};
		for (const child of set.children) out[child.key] = child;
		return out;
	}

	function validateObject(
		errors: vscode.Diagnostic[],
		schema: JSONSchema4 | boolean,
		key: string,
		parent: KVSetRanged | KVRootRanged | undefined,
		node: KVPairRanged | KVSetRanged | undefined,
	) {
		if (schema === false) {
			if (node != null) pushError(errors, parent, `Unexpected property "${key}"!`);
			return;
		}

		if (schema === true) {
			return;
		}

		if (node == null) {
			pushError(errors, parent, `Missing property "${key}"!`);
			return;
		}

		const schemaWantsObject =
			schema.type === undefined || schema.type === 'object';

		if (schemaWantsObject && node.type !== KVType.Dir) {
			return pushError(errors, node, `Expected "${node.key}" to be an object!`);
		}

		if (!schemaWantsObject && node.type !== KVType.Pair) {
			return pushError(errors, node, `Expected "${node.key}" to be of type "${schema.type}"!`);
		}

		if (node.type === KVType.Pair) {
			return validatePrimitive(errors, schema, node);
		}

		const nodeDict = dictifySet(node);

		if (schema.properties) {
			const requiredArr = Array.isArray(schema.required) && schema.required;

			for (const propKey in schema.properties) {
				const propSchema = schema.properties[propKey];
				
				if (propKey in nodeDict || (requiredArr && requiredArr.includes(propKey))) {
					validateObject(errors, propSchema, propKey, node, nodeDict[propKey]);
				}
			}
		}

		if (schema.additionalProperties != null) {
			for (const propKey in nodeDict) {
				if (schema.properties && propKey in schema.properties) continue;
				validateObject(errors, schema.additionalProperties, propKey, node, nodeDict[propKey]);
			}
		}
	}

	function validatePrimitive(
		errors: vscode.Diagnostic[],
		schema: JSONSchema4,
		node: KVPairRanged,
	) {
		let value = node.value;

		switch (schema.type) {
			case 'object':
			case 'string':
			case 'null':
			case 'any':
				return;
			case 'boolean': {
				if (!(
					value === '0' ||
					value === '1' ||
					value === 'false' ||
					value === 'true' ||
					value === 'off' ||
					value === 'on'
				)) pushError(errors, node, `Could not interpret "${value}" as a boolean!`);
				return;
			}
			case 'number': {
				const iV = +value;
				if (isNaN(iV)) pushError(errors, node, `Could not interpret "${value}" as a number!`);
				return;
			}
			case 'integer': {
				const iV = +value;
				if (isNaN(iV) || iV !== (~~iV)) pushError(errors, node, `Could not interpret "${value}" as an integer!`);
				return;
			}
			case 'array': {
				const b1 = value.at(0), b2 = value.at(-1);
				if (b1 === '[' || b1 === '{') {
					if (b2 !== ClosingBrackets[b1]) {
						pushError(errors, node, `Unclosed [...] brackets in array!`);
						value = value.slice(1);
					} else {
						value = value.slice(1, -1);
					}
				}

				// TODO: Actually verify numbers,
				// maybe give a warning whenever you use [ 255 ] or { 1. } ?
			}
				
		}
		return;
	}

	const errors: vscode.Diagnostic[] = [];

	validateObject(
		errors,
		rootSchema,
		rootNode.key,
		(<KVSetRanged>rootNode).parent,
		rootNode,
	);

	return errors;
}
