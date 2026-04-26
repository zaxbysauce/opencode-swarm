import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { resolveGrammarDir } from '../../../src/services/diagnose-service.js';

describe('resolveGrammarDir — CLI bundle path regression (#626)', () => {
	test('source context: /src/services → ../lang/grammars', () => {
		const thisDir = '/project/src/services';
		const result = resolveGrammarDir(thisDir);
		expect(result).toBe(
			path.join('/project/src/services', '..', 'lang', 'grammars'),
		);
	});

	test('CLI bundle context: /dist/cli → ../lang/grammars (the bug was it returned cli/lang/grammars)', () => {
		const thisDir = '/project/dist/cli';
		const result = resolveGrammarDir(thisDir);
		expect(result).toBe(
			path.join('/project/dist/cli', '..', 'lang', 'grammars'),
		);
		expect(result).not.toContain('cli/lang');
		expect(result).not.toContain('cli\\lang');
	});

	test('main bundle context: /dist → lang/grammars', () => {
		const thisDir = '/project/dist';
		const result = resolveGrammarDir(thisDir);
		expect(result).toBe(path.join('/project/dist', 'lang', 'grammars'));
	});

	test('CLI and source both resolve one level up — same relative path', () => {
		const cliResult = resolveGrammarDir('/some/path/cli');
		const sourceResult = resolveGrammarDir('/some/path/src/services');
		// Both go up one level relative to their thisDir
		expect(cliResult).toBe(
			path.join('/some/path/cli', '..', 'lang', 'grammars'),
		);
		expect(sourceResult).toBe(
			path.join('/some/path/src/services', '..', 'lang', 'grammars'),
		);
	});

	test('Windows-style path: CLI bundle', () => {
		const thisDir = 'C:\\project\\dist\\cli';
		const result = resolveGrammarDir(thisDir);
		expect(result).toBe(
			path.join('C:\\project\\dist\\cli', '..', 'lang', 'grammars'),
		);
	});

	test('Windows-style path: main bundle', () => {
		const thisDir = 'C:\\project\\dist';
		const result = resolveGrammarDir(thisDir);
		expect(result).toBe(path.join('C:\\project\\dist', 'lang', 'grammars'));
	});
});
