import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanDocIndex } from '../../../src/tools/doc-scan';

describe('doc-scan caching', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-scan-cache-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test('cache is used when file mtime matches stored mtime (happy path)', async () => {
		// Create a doc file
		fs.writeFileSync(
			path.join(tmpDir, 'README.md'),
			'# Happy Path Test\n\nThis file should be cached.\n',
		);

		// First scan — should not be cached
		const first = await scanDocIndex(tmpDir);
		expect(first.cached).toBe(false);
		expect(first.manifest.files.length).toBe(1);
		expect(first.manifest.files[0].path).toBe('README.md');

		// Capture the stored mtime from the manifest
		const storedMtime = first.manifest.files[0].mtime;

		// Second scan — should be cached because file mtime hasn't changed
		const second = await scanDocIndex(tmpDir);
		expect(second.cached).toBe(true);
		expect(second.manifest.files.length).toBe(1);
		expect(second.manifest.files[0].mtime).toBe(storedMtime);
	});

	test('cache is invalidated when file mtime is later than stored mtime', async () => {
		// Create a doc file
		fs.writeFileSync(
			path.join(tmpDir, 'README.md'),
			'# Original Content\n\nThis will be modified.\n',
		);

		// First scan — not cached
		const first = await scanDocIndex(tmpDir);
		expect(first.cached).toBe(false);
		expect(first.manifest.files.length).toBe(1);

		// Wait a small amount so mtime definitely advances, then overwrite with new content
		// This naturally updates the file's mtime to the current time
		await Bun.sleep(100);
		fs.writeFileSync(
			path.join(tmpDir, 'README.md'),
			'# Modified Content\n\nThis file has been modified.\n',
		);

		// Second scan — cache should be invalidated because mtime changed
		const second = await scanDocIndex(tmpDir);
		expect(second.cached).toBe(false);
		expect(second.manifest.files.length).toBe(1);

		// The new mtime should be later than the original
		expect(second.manifest.files[0].mtime).toBeGreaterThan(
			first.manifest.files[0].mtime,
		);
	});

	test('cache is invalidated when a file in the manifest is deleted', async () => {
		// Create multiple doc files
		fs.writeFileSync(
			path.join(tmpDir, 'README.md'),
			'# README\n\nMain readme.\n',
		);
		fs.writeFileSync(
			path.join(tmpDir, 'ARCHITECTURE.md'),
			'# Architecture\n\nSystem design.\n',
		);

		// First scan — not cached
		const first = await scanDocIndex(tmpDir);
		expect(first.cached).toBe(false);
		expect(first.manifest.files.length).toBe(2);

		// Delete one of the files
		fs.unlinkSync(path.join(tmpDir, 'ARCHITECTURE.md'));

		// Second scan — cache should be invalidated because a file is missing
		const second = await scanDocIndex(tmpDir);
		expect(second.cached).toBe(false);
		// The new manifest should only have the remaining file
		expect(second.manifest.files.length).toBe(1);
		expect(second.manifest.files[0].path).toBe('README.md');
	});

	test('manifest with zero files returns cached=true on second scan', async () => {
		// Empty directory — no doc files matching the patterns
		// First scan — not cached (empty manifest)
		const first = await scanDocIndex(tmpDir);
		expect(first.cached).toBe(false);
		expect(first.manifest.files).toEqual([]);

		// Second scan — should be cached (empty manifest is still a valid cached state)
		const second = await scanDocIndex(tmpDir);
		expect(second.cached).toBe(true);
		expect(second.manifest.files).toEqual([]);
		// The manifest should be identical
		expect(second.manifest.scanned_at).toBe(first.manifest.scanned_at);
	});
});
