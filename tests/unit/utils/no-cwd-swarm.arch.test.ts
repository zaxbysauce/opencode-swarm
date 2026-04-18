/**
 * Architecture lint: prevent process.cwd() from being used within 3 lines of
 * a .swarm path expression in production source files.
 *
 * This test enforces the invariant established in issue #528 — plugin code must
 * funnel .swarm/ writes through resolveSwarmRoot() rather than bare process.cwd().
 *
 * ALLOWLIST: the swarm-root helper itself (which intentionally calls process.cwd()
 * as a last resort), CLI entry, and test files.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../../..');
const SRC_DIR = join(REPO_ROOT, 'src');

const ALLOWLIST = new Set([
	'src/utils/swarm-root.ts',     // The helper — intentionally uses process.cwd() as fallback
	'src/cli/index.ts',            // CLI entry point — cwd is intentionally the project root
]);

const CONTEXT_LINES = 3;

function walkTs(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			results.push(...walkTs(full));
		} else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
			results.push(full);
		}
	}
	return results;
}

describe('arch lint: no process.cwd() near .swarm in production source', () => {
	test('no production file uses process.cwd() within 3 lines of a .swarm path', () => {
		const violations: string[] = [];

		for (const absPath of walkTs(SRC_DIR)) {
			const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/');

			if (ALLOWLIST.has(relPath)) continue;

			const lines = readFileSync(absPath, 'utf-8').split('\n');

			for (let i = 0; i < lines.length; i++) {
				if (!lines[i].includes('process.cwd()')) continue;

				// Skip pure comment lines — comments mentioning process.cwd() are OK
				if (lines[i].trimStart().startsWith('//') || lines[i].trimStart().startsWith('*')) continue;

				// Check within CONTEXT_LINES radius for a .swarm reference
				const start = Math.max(0, i - CONTEXT_LINES);
				const end = Math.min(lines.length - 1, i + CONTEXT_LINES);
				const window = lines.slice(start, end + 1).join('\n');

				if (window.includes('.swarm')) {
					violations.push(
						`${relPath}:${i + 1} — process.cwd() used within ${CONTEXT_LINES} lines of .swarm (use resolveSwarmRoot instead)`,
					);
				}
			}
		}

		if (violations.length > 0) {
			console.error('\n[arch-lint] process.cwd() near .swarm violations:');
			for (const v of violations) console.error('  ' + v);
		}

		expect(violations).toEqual([]);
	});
});
