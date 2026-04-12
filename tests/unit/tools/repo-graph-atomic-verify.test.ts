import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { constants } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('createAtomic exclusivity verification', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fsPromises.mkdtemp(
			path.join(os.tmpdir(), 'atomic-verify-'),
		);
	});

	afterEach(async () => {
		try {
			await fsPromises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('copyFile with COPYFILE_EXCL fails when target exists', async () => {
		const targetPath = path.join(tempDir, 'repo-graph.json');
		const tempPath = path.join(tempDir, 'repo-graph.json.tmp.12345');

		// Create the target file first (simulating first save)
		await fsPromises.writeFile(
			targetPath,
			JSON.stringify({ test: 1 }),
			'utf-8',
		);

		// Create a temp file (simulating what saveGraph does)
		await fsPromises.writeFile(tempPath, JSON.stringify({ test: 2 }), 'utf-8');

		// copyFile with COPYFILE_EXCL should FAIL because target exists
		await expect(
			fsPromises.copyFile(tempPath, targetPath, constants.COPYFILE_EXCL),
		).rejects.toMatchObject({ code: 'EEXIST' });
	});

	test('copyFile with COPYFILE_EXCL succeeds when target does not exist', async () => {
		const targetPath = path.join(tempDir, 'repo-graph.json');
		const tempPath = path.join(tempDir, 'repo-graph.json.tmp.12345');

		// Create only the temp file (target does NOT exist)
		await fsPromises.writeFile(tempPath, JSON.stringify({ test: 2 }), 'utf-8');

		// copyFile with COPYFILE_EXCL should SUCCEED because target doesn't exist
		await fsPromises.copyFile(tempPath, targetPath, constants.COPYFILE_EXCL);

		// Verify the file was copied
		const content = await fsPromises.readFile(targetPath, 'utf-8');
		expect(JSON.parse(content)).toEqual({ test: 2 });
	});
});
