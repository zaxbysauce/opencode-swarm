import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Creates a unique subdirectory under os.tmpdir() and returns
 * the path plus a cleanup function. Safe for use in bun:test.
 *
 * Usage:
 *   const { dir, cleanup } = createSafeTestDir('my-test-');
 *   afterEach(cleanup);
 */
export function createSafeTestDir(prefix = 'swarm-safe-test-'): {
	dir: string;
	cleanup: () => void;
} {
	const base = os.tmpdir();
	const dir = fs.mkdtempSync(path.join(base, prefix));

	// Safety assertion: verify it's actually under tmpdir
	const resolvedDir = path.resolve(dir);
	const resolvedBase = path.resolve(base);
	if (
		!resolvedDir.startsWith(resolvedBase + path.sep) &&
		resolvedDir !== resolvedBase
	) {
		throw new Error(
			`createSafeTestDir: created dir ${resolvedDir} is not under os.tmpdir() ${resolvedBase}`,
		);
	}

	const cleanup = (): void => {
		fs.rmSync(dir, { recursive: true, force: true });
	};

	return { dir, cleanup };
}

/**
 * Runs an async function with a safe temp directory, always cleaning up.
 *
 * Usage:
 *   await withSafeTestDir(async (dir) => {
 *     fs.writeFileSync(path.join(dir, 'test.txt'), 'hello');
 *     // ... test logic
 *   });
 */
export async function withSafeTestDir<T>(
	fn: (dir: string) => Promise<T>,
	prefix = 'swarm-safe-test-',
): Promise<T> {
	const { dir, cleanup } = createSafeTestDir(prefix);
	try {
		return await fn(dir);
	} finally {
		cleanup();
	}
}
