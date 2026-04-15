/**
 * Smoke test: tool registration completeness
 *
 * Regression guard for tools added to src/tools/index.ts (barrel) and
 * TOOL_NAMES but forgotten in src/index.ts's plugin `tool: { … }` block.
 *
 * The bug class this catches: a developer adds a tool to the barrel and
 * TOOL_NAMES but forgets to import it in src/index.ts and register it in
 * the plugin's tool object.
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tools from '../../../src/tools';
import { TOOL_NAMES } from '../../../src/tools/tool-names';

/**
 * Parse the `tool: { … }` block from src/index.ts to extract registered tool keys.
 * Mirrors the approach used in plugin-tool-registration.test.ts.
 */
function extractRegisteredToolKeys(src: string): Set<string> {
	const startMarker = src.indexOf("name: 'opencode-swarm'");
	if (startMarker === -1) {
		throw new Error('Could not locate opencode-swarm plugin return object');
	}
	const toolStart = src.indexOf('tool: {', startMarker);
	if (toolStart === -1) {
		throw new Error('Could not locate tool: { block in plugin return');
	}
	// Walk brace depth from the opening { of tool: {
	const openBrace = src.indexOf('{', toolStart);
	let depth = 0;
	let endIdx = -1;
	for (let i = openBrace; i < src.length; i++) {
		const ch = src[i];
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) {
				endIdx = i;
				break;
			}
		}
	}
	if (endIdx === -1) {
		throw new Error('Unterminated tool: { block');
	}
	const block = src.slice(openBrace + 1, endIdx);
	const keys = new Set<string>();
	// Match shorthand keys (`foo,` or `foo\n`) and renamed keys (`foo: bar,`).
	// Lookahead on the trailing delimiter so consecutive keys on the same line
	// (`foo, bar,`) are all captured.
	const keyRe = /(?:^|[,{\n])\s*([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*[:,}\n])/g;
	for (const m of block.matchAll(keyRe)) {
		keys.add(m[1]);
	}
	return keys;
}

describe('tool registration smoke test', () => {
	const indexPath = path.join(process.cwd(), 'src', 'index.ts');
	const source = fs.readFileSync(indexPath, 'utf-8');
	const registeredToolKeys = extractRegisteredToolKeys(source);

	test('every TOOL_NAMES entry is registered in the plugin tool object', () => {
		const missing: string[] = [];
		for (const toolName of TOOL_NAMES) {
			if (!registeredToolKeys.has(toolName)) {
				missing.push(toolName);
			}
		}
		if (missing.length > 0) {
			throw new Error(
				`The following tools are in TOOL_NAMES but not registered in src/index.ts plugin tool block:\n  - ${missing.join('\n  - ')}\n\nAdd them to the import block and to the plugin's tool registration object.`,
			);
		}
		expect(missing).toEqual([]);
	});

	test('no extra tools are registered that are not in TOOL_NAMES', () => {
		const extra: string[] = [];
		for (const key of registeredToolKeys) {
			if (!TOOL_NAMES.includes(key as (typeof TOOL_NAMES)[number])) {
				extra.push(key);
			}
		}
		if (extra.length > 0) {
			throw new Error(
				`The following tools are registered in the plugin tool block but not in TOOL_NAMES:\n  - ${extra.join('\n  - ')}\n\nEither add them to TOOL_NAMES or remove the stray registration.`,
			);
		}
		expect(extra).toEqual([]);
	});

	test('registered tool count matches TOOL_NAMES count', () => {
		expect(registeredToolKeys.size).toBe(TOOL_NAMES.length);
	});

	test('each registered tool has a callable execute function', () => {
		const unregistered: string[] = [];
		for (const toolName of TOOL_NAMES) {
			// The tool is registered in the plugin under its TOOL_NAMES key
			// The actual tool object lives in the ./tools barrel
			const tool = (tools as Record<string, unknown>)[toolName];
			if (!tool) {
				unregistered.push(toolName);
				continue;
			}
			if (typeof (tool as { execute?: unknown }).execute !== 'function') {
				throw new Error(
					`Tool '${toolName}' is registered but has no callable execute function`,
				);
			}
		}
		if (unregistered.length > 0) {
			throw new Error(
				`The following tools are registered in the plugin but not found in src/tools barrel:\n  - ${unregistered.join('\n  - ')}`,
			);
		}
		expect(unregistered).toEqual([]);
	});

	test('TOOL_NAMES has no duplicates', () => {
		const seen = new Set<string>();
		const duplicates: string[] = [];
		for (const name of TOOL_NAMES) {
			if (seen.has(name)) {
				duplicates.push(name);
			}
			seen.add(name);
		}
		expect(duplicates).toEqual([]);
	});
});
