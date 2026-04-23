import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWorkingDirectory } from './resolve-working-directory';

let tmpDir: string;
let subDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'rwd-anchor-test-'));
	const { mkdirSync } = require('node:fs');
	subDir = path.join(tmpDir, 'src');
	mkdirSync(subDir, { recursive: true });
});

afterEach(() => {
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		/* best effort */
	}
});

describe('resolveWorkingDirectory project root anchor (issue #577 regression)', () => {
	it('rejects working_directory pointing to a subdirectory', () => {
		const result = resolveWorkingDirectory(subDir, tmpDir);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.message).toContain('project root');
		}
	});

	it('rejects working_directory pointing to a different absolute path', () => {
		const result = resolveWorkingDirectory('/tmp', tmpDir);
		// /tmp exists and is a real directory but is not the project root
		if (!result.success) {
			expect(result.message).toContain('project root');
		} else {
			// If /tmp resolves to tmpDir somehow (impossible), that's also fine
			expect(result.directory).toBe(path.resolve(tmpDir));
		}
	});

	it('accepts working_directory matching the project root exactly', () => {
		const result = resolveWorkingDirectory(tmpDir, tmpDir);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.directory).toBe(path.resolve(tmpDir));
		}
	});

	it('returns fallback directory when working_directory is omitted', () => {
		const result = resolveWorkingDirectory(undefined, tmpDir);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.directory).toBe(tmpDir);
		}
	});

	it('returns fallback directory when working_directory is empty string', () => {
		const result = resolveWorkingDirectory('', tmpDir);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.directory).toBe(tmpDir);
		}
	});

	it('rejects path traversal sequences', () => {
		const result = resolveWorkingDirectory('../other', tmpDir);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.message).toContain('..');
		}
	});

	it('rejects null bytes', () => {
		const result = resolveWorkingDirectory('/tmp/safe\0evil', tmpDir);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.message).toContain('null bytes');
		}
	});
});
