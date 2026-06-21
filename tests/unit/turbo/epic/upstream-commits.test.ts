/**
 * Tests for greenfield-smart Rule 3 — `buildIsUpstreamCommitted`.
 * File: tests/unit/turbo/epic/upstream-commits.test.ts
 *
 * Verifies the predicate:
 *  - Parses task IDs out of `swarm(task <id>):` commit subjects.
 *  - Returns `true` for committed IDs, `false` for unseen ones.
 *  - Degrades to permissive (always-true) when git log fails.
 *  - Honors a custom `maxCommits` scan window.
 *  - Ignores non-swarm commits cleanly.
 *
 * Phase 6 of the 2026-06-03 corrective plan removed the plan-ledger
 * fallback that earlier revisions OR'd in to "guard against silent
 * commit failures". Phase 5 made Rule 2 reliable across every completion
 * path by centralizing the commit invocation in `plan/manager.updateTask-
 * Status`, so the guard's premise no longer applies — and keeping the
 * fallback would have defeated Rule 3's own premise. Tests for the
 * removed fallback were deleted along with the code.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	_internals,
	buildIsUpstreamCommitted,
} from '../../../../src/turbo/epic/upstream-commits';

type Internals = typeof _internals;

describe('buildIsUpstreamCommitted', () => {
	const originals: Internals = { ..._internals };

	beforeEach(() => {
		// fresh state per test
	});

	afterEach(() => {
		Object.assign(_internals, originals);
	});

	test('predicate returns true for task IDs that appear in swarm commit subjects', () => {
		_internals.readGitLogSubjects = () =>
			[
				'swarm(task 1.1): set up package structure',
				'swarm(task 1.2): add pyproject.toml',
				'unrelated: docs typo fix',
				'swarm(task 2.1): implement ClinicalDataset',
			].join('\n');

		const isCommitted = buildIsUpstreamCommitted('/tmp/fake');
		expect(isCommitted('1.1')).toBe(true);
		expect(isCommitted('1.2')).toBe(true);
		expect(isCommitted('2.1')).toBe(true);
	});

	test('predicate returns false for task IDs that never appear', () => {
		_internals.readGitLogSubjects = () => ['swarm(task 1.1): foo'].join('\n');

		const isCommitted = buildIsUpstreamCommitted('/tmp/fake');
		expect(isCommitted('1.2')).toBe(false);
		expect(isCommitted('99.99')).toBe(false);
	});

	test('git failure degrades to permissive — legacy "dep implicitly satisfied" behavior', () => {
		// When git log can't be read (no repo, spawn error, timeout), we
		// fall back to the pre-Rule-3 semantics: cross-batch deps are
		// implicitly satisfied. Better legacy than permanently wedged.
		// Phase 6 removed the plan-ledger fallback that earlier revisions
		// used here — see file header for rationale.
		_internals.readGitLogSubjects = () => {
			throw new Error('not a git repo');
		};

		const isCommitted = buildIsUpstreamCommitted('/tmp/fake');
		expect(isCommitted('1.1')).toBe(true);
		expect(isCommitted('anything')).toBe(true);
	});

	test('Phase 6 regression: plan-ledger fallback is GONE — predicate ignores .swarm/plan.json entirely', () => {
		// The deleted F3-fallback tests proved the predicate accepted
		// plan-ledger evidence ("status: completed in plan.json" → true).
		// Phase 6 removed that path. This test pins that the removal
		// holds: git log is empty AND a plan ledger entry could exist on
		// disk — the predicate must still return false, because git is
		// now the sole evidence source.
		//
		// We write a real `.swarm/plan.json` to a temp dir to prove the
		// predicate does NOT consult it. If a future revision reintroduces
		// the fallback, that read would flip 1.1 to true and this test
		// catches it.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-no-fallback-'));
		try {
			fs.mkdirSync(path.join(dir, '.swarm'), { recursive: true });
			fs.writeFileSync(
				path.join(dir, '.swarm', 'plan.json'),
				JSON.stringify({
					phases: [
						{
							id: 1,
							tasks: [{ id: '1.1', status: 'completed' }],
						},
					],
				}),
			);
			// Empty git log — but Phase 6 means we don't look at plan.json.
			_internals.readGitLogSubjects = () => '';

			const isCommitted = buildIsUpstreamCommitted(dir);
			// Pre-Phase-6 this would return true (plan-ledger says completed);
			// Post-Phase-6 it must return false.
			expect(isCommitted('1.1')).toBe(false);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test('empty log (greenfield: no swarm commits yet) returns false for everything', () => {
		_internals.readGitLogSubjects = () => '';

		const isCommitted = buildIsUpstreamCommitted('/tmp/fake');
		expect(isCommitted('1.1')).toBe(false);
	});

	test('non-swarm commits are ignored', () => {
		_internals.readGitLogSubjects = () =>
			[
				'feat: add login flow',
				'chore: bump deps',
				'fix(api): handle null response',
			].join('\n');

		const isCommitted = buildIsUpstreamCommitted('/tmp/fake');
		expect(isCommitted('1.1')).toBe(false);
		expect(isCommitted('feat')).toBe(false);
	});

	test('passes custom maxCommits to git log invocation', () => {
		let capturedMax: number | undefined;
		_internals.readGitLogSubjects = (_cwd: string, max: number) => {
			capturedMax = max;
			return '';
		};

		buildIsUpstreamCommitted('/tmp/fake', { maxCommits: 42 });
		expect(capturedMax).toBe(42);
	});

	test('default maxCommits caps the scan at 10000', () => {
		let capturedMax: number | undefined;
		_internals.readGitLogSubjects = (_cwd: string, max: number) => {
			capturedMax = max;
			return '';
		};

		buildIsUpstreamCommitted('/tmp/fake');
		expect(capturedMax).toBe(10_000);
	});

	test('handles whitespace and blank lines without false matches', () => {
		_internals.readGitLogSubjects = () =>
			'  \n\nswarm(task 1.1): a\n\n  \nswarm(task 1.2): b\n';

		const isCommitted = buildIsUpstreamCommitted('/tmp/fake');
		expect(isCommitted('1.1')).toBe(true);
		expect(isCommitted('1.2')).toBe(true);
	});
});
