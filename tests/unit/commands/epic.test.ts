/**
 * Tests for the /swarm epic slash command.
 * File: tests/unit/commands/epic.test.ts
 *
 * Covers:
 *  - Missing session context → friendly error.
 *  - on / off / toggle round-trip via the durable state seam.
 *  - status renders the last decision when one exists.
 *  - decide computes a fresh verdict from the plan without writing evidence.
 *  - Unknown subcommand → usage.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { _internals, handleEpicCommand } from '../../../src/commands/epic';

const realInternals = { ..._internals };

let active = false;
let sessionStateStored: ReturnType<typeof realInternals.loadEpicSessionState> =
	null;
let decideCalls = 0;
let enableCalls = 0;
let disableCalls = 0;
let sessionFlag: { epicModeActive?: boolean; id: string; turboMode: boolean };

beforeEach(() => {
	active = false;
	sessionStateStored = null;
	decideCalls = 0;
	enableCalls = 0;
	disableCalls = 0;
	sessionFlag = { id: 'sess-1', turboMode: false, epicModeActive: false };

	// `/swarm epic` bootstraps the agent session via `ensureAgentSession`,
	// so the stub always returns the session flag regardless of id.
	_internals.ensureAgentSession = (() => sessionFlag as never) as never;
	_internals.isEpicModeActive = (() => active) as never;
	_internals.isStateUnreadable = (() => false) as never;
	_internals.loadEpicSessionState = (() => sessionStateStored) as never;
	_internals.readTaskScopes = (() => null) as never;
	_internals.enableEpicMode = (() => {
		active = true;
		enableCalls += 1;
		sessionStateStored = {
			sessionID: 'sess-1',
			active: true,
			enabledAt: '2025-01-01T00:00:00Z',
		} as never;
	}) as never;
	_internals.disableEpicMode = (() => {
		active = false;
		disableCalls += 1;
		sessionStateStored = {
			sessionID: 'sess-1',
			active: false,
			disabledAt: '2025-01-02T00:00:00Z',
		} as never;
	}) as never;

	_internals.loadPluginConfigWithMeta = (() => ({
		config: { turbo: { epic: { mode: { enabled: true } } } },
		isUsingDefaults: false,
	})) as never;
	_internals.loadPlanJsonOnly = (async () => ({
		phases: [
			{
				id: 1,
				name: 'P1',
				tasks: [
					{
						id: '1.1',
						description: 'a',
						status: 'pending',
						files_touched: ['src/a.ts'],
					},
				],
			},
		],
	})) as never;
	_internals.getCoChangeData = (async () => ({
		pairs: [],
		commitsObserved: 50,
	})) as never;
	_internals.decideEpicActivation = (() => {
		decideCalls += 1;
		return {
			decision: 'promote',
			p: 0,
			rationale: {
				pCheck: { passed: true, p: 0, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: { passed: true, commitsObserved: 50, minCommits: 20 },
			},
			blockingReasons: [],
		};
	}) as never;
});

afterEach(() => {
	for (const k of Object.keys(realInternals)) {
		(_internals as never as Record<string, unknown>)[k] = (
			realInternals as never as Record<string, unknown>
		)[k];
	}
});

describe('handleEpicCommand — session validation', () => {
	test('rejects empty sessionID', async () => {
		const out = await handleEpicCommand('/fake', [], '');
		expect(out).toContain('No active session context');
	});

	test('bootstraps the agent session when no architect has spoken yet', async () => {
		// Previously rejected with "No active session" when the architect
		// hadn't initialized a session yet — that error was a chicken-and-egg
		// UX bug since `/swarm epic` is a session-state command. The new
		// behavior creates the session lazily via `ensureAgentSession` and
		// proceeds with the toggle. Bare `/swarm epic` (no arg) renders the
		// status string, not an error.
		const out = await handleEpicCommand('/fake', [], 'fresh-session');
		expect(out).not.toContain('No active session');
	});
});

describe('handleEpicCommand — on / off / toggle', () => {
	test('`on` enables the mode and acks', async () => {
		const out = await handleEpicCommand('/fake', ['on'], 'sess-1');
		expect(out).toContain('Epic Mode enabled');
		expect(enableCalls).toBe(1);
		expect(active).toBe(true);
		// In-memory session flag is also mirrored so hasActiveEpicMode picks it up.
		expect(sessionFlag.epicModeActive).toBe(true);
	});

	test('`off` disables the mode and acks', async () => {
		active = true;
		sessionFlag.epicModeActive = true;
		const out = await handleEpicCommand('/fake', ['off'], 'sess-1');
		expect(out).toContain('Epic Mode disabled');
		expect(disableCalls).toBe(1);
		expect(active).toBe(false);
		expect(sessionFlag.epicModeActive).toBe(false);
	});

	test('bare `/swarm epic` shows status and does NOT toggle (anti-loop)', async () => {
		// Toggle-by-default created an architect-loop with weaker models:
		// the model called `swarm_command [command=epic]` without args to
		// "check state", which flipped the flag, then it tried again →
		// flip back → loop. Status-by-default is idempotent and safe.
		const beforeEnable = enableCalls;
		const beforeDisable = disableCalls;
		const out = await handleEpicCommand('/fake', [], 'sess-1');
		expect(out).toContain('Epic Mode — Status');
		expect(enableCalls).toBe(beforeEnable);
		expect(disableCalls).toBe(beforeDisable);

		// Calling it again is also idempotent — same observation.
		await handleEpicCommand('/fake', [], 'sess-1');
		expect(enableCalls).toBe(beforeEnable);
		expect(disableCalls).toBe(beforeDisable);
	});

	test('unknown subcommand returns usage', async () => {
		const out = await handleEpicCommand('/fake', ['nope'], 'sess-1');
		expect(out).toContain("Unknown subcommand 'nope'");
		expect(out).toContain('Usage:');
	});

	test('empty-string subcommand is treated as unknown (not toggle)', async () => {
		// `['']` is different from `[]`: arg0 is '' not undefined.
		const out = await handleEpicCommand('/fake', [''], 'sess-1');
		expect(out).toContain("Unknown subcommand ''");
		// And NO toggle happened.
		expect(enableCalls).toBe(0);
		expect(disableCalls).toBe(0);
	});
});

describe('handleEpicCommand — status', () => {
	test('renders "not toggled" when no session state exists', async () => {
		sessionStateStored = null;
		const out = await handleEpicCommand('/fake', ['status'], 'sess-1');
		expect(out).toContain('Epic Mode — Status');
		expect(out).toContain('has not been toggled');
	});

	test('distinguishes "state unreadable" from "not toggled"', async () => {
		_internals.isStateUnreadable = (() => true) as never;
		const out = await handleEpicCommand('/fake', ['status'], 'sess-1');
		expect(out).toContain('Epic Mode — Status');
		expect(out).toContain('unreadable');
		expect(out).toContain('fail-closed');
		// And it does NOT mislead with "not toggled".
		expect(out).not.toContain('has not been toggled');
	});

	test('renders the last decision when state has one', async () => {
		sessionStateStored = {
			sessionID: 'sess-1',
			active: true,
			enabledAt: '2025-01-01T00:00:00Z',
			lastDecision: {
				decidedAt: '2025-01-02T00:00:00Z',
				phase: 2,
				decision: 'demote',
				p: 0.75,
				blockingReasons: ['p exceeds threshold'],
			},
		} as never;
		const out = await handleEpicCommand('/fake', ['status'], 'sess-1');
		expect(out).toContain('Last activation decision');
		expect(out).toContain('demote');
		expect(out).toContain('0.750');
		expect(out).toContain('p exceeds threshold');
	});
});

describe('handleEpicCommand — decide (read-only what-if)', () => {
	test('returns a verdict rendering without dispatching execution', async () => {
		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		expect(out).toContain('Epic Mode — Activation Decision');
		expect(out).toContain('promote');
		expect(decideCalls).toBe(1);
	});

	test('does not write evidence (read-only)', async () => {
		// The evidence writer isn't bound to a seam in `decide`, but we can
		// at least verify the no-plan path produces a friendly message
		// instead of attempting a write.
		_internals.loadPlanJsonOnly = (async () => null) as never;
		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		expect(out).toContain('No plan found');
	});

	test('Phase 15 (B38): decide-path renders phantom-only failure with the typo, not empty "missing upstreams:"', async () => {
		_internals.decideEpicActivation = (() => ({
			decision: 'demote' as const,
			p: 0.05,
			rationale: {
				pCheck: { passed: true, p: 0.05, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: {
					passed: false,
					commitsObserved: 4,
					minCommits: 20,
					crossPhaseUpstreams: [],
					missingUpstreams: [],
					phantomDeps: ['1.7', '2.99'],
				},
			},
			blockingReasons: [
				'phantom dep id(s) declared but not present in plan (probable typo, fix the dep id) — 1.7, 2.99',
			],
		})) as never;

		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		// The phantom typo IDs appear on the greenfield gate line itself.
		expect(out).toContain('phantom dep ids');
		expect(out).toContain('1.7');
		expect(out).toContain('2.99');
		// And there is no misleading empty "missing upstreams: " segment.
		expect(out).not.toMatch(/missing upstreams: ?\n/);
	});

	test('Phase 15 (B38): decide-path renders mixed phantom+missing failure with both segments', async () => {
		_internals.decideEpicActivation = (() => ({
			decision: 'demote' as const,
			p: 0.05,
			rationale: {
				pCheck: { passed: true, p: 0.05, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: {
					passed: false,
					commitsObserved: 10,
					minCommits: 20,
					crossPhaseUpstreams: ['1.1'],
					missingUpstreams: ['1.1'],
					phantomDeps: ['2.99'],
				},
			},
			blockingReasons: [],
		})) as never;

		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		expect(out).toContain('phantom dep ids');
		expect(out).toContain('2.99');
		expect(out).toContain('missing upstreams');
		expect(out).toContain('1.1');
	});

	test('Phase 15 (B38): decide-path renders vacuous-pass when no cross-phase upstreams', async () => {
		_internals.decideEpicActivation = (() => ({
			decision: 'promote' as const,
			p: 0.05,
			rationale: {
				pCheck: { passed: true, p: 0.05, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: {
					passed: true,
					commitsObserved: 0,
					minCommits: 20,
					crossPhaseUpstreams: [],
					missingUpstreams: [],
				},
			},
			blockingReasons: [],
		})) as never;

		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		expect(out).toContain('vacuous');
	});

	test('Phase 15 (B38): decide-path tolerates legacy rationale without crashing', async () => {
		// A pre-Phase-10 verdict shape (no crossPhaseUpstreams /
		// missingUpstreams / phantomDeps on greenfieldCheck). The
		// renderer must default these to [] and not throw.
		_internals.decideEpicActivation = (() => ({
			decision: 'demote' as const,
			p: 0.5,
			rationale: {
				pCheck: { passed: false, p: 0.5, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: {
					passed: false,
					commitsObserved: 0,
					minCommits: 20,
				},
			},
			blockingReasons: ['p too high'],
		})) as never;

		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		expect(out).toContain('legacy record');
	});
});

describe('handleEpicCommand — last (most recent decision from evidence)', () => {
	test('returns a "no decisions yet" message when the evidence file is empty', async () => {
		_internals.readPromotionEvidence = (() => []) as never;
		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		expect(out).toContain('Epic Mode — Last Decision');
		expect(out).toContain('No decisions recorded yet');
		expect(out).toContain('run `/swarm epic decide`');
	});

	test('renders the most recent record with verdict, p, and gate-by-gate', async () => {
		_internals.readPromotionEvidence = (() => [
			{
				timestamp: '2026-05-27T11:00:00Z',
				sessionID: 'sess-prior',
				phase: 1,
				verdict: {
					decision: 'promote' as const,
					p: 0.12,
					rationale: {
						pCheck: { passed: true, p: 0.12, threshold: 0.3 },
						hotModuleCheck: { passed: true, touchedHotModules: [] },
						greenfieldCheck: {
							passed: true,
							commitsObserved: 80,
							minCommits: 20,
						},
					},
					blockingReasons: [],
				},
			},
			{
				timestamp: '2026-05-28T09:30:00Z',
				sessionID: 'sess-current',
				phase: 2,
				verdict: {
					decision: 'demote' as const,
					p: 0.55,
					rationale: {
						pCheck: { passed: false, p: 0.55, threshold: 0.3 },
						hotModuleCheck: {
							passed: false,
							touchedHotModules: ['src/global.ts'],
						},
						greenfieldCheck: {
							passed: true,
							commitsObserved: 50,
							minCommits: 20,
						},
					},
					blockingReasons: [
						'p (0.550) exceeds activation threshold (0.300)',
						'plan touches Lean Turbo hot module(s): src/global.ts',
					],
				},
			},
		]) as never;

		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		// Must show the LAST (second) record, not the first.
		expect(out).toContain('Decided at: 2026-05-28T09:30:00Z');
		expect(out).toContain('Session: sess-current');
		expect(out).toContain('Phase: 2');
		expect(out).toContain('Decision: **demote**');
		expect(out).toContain('p: 0.550');
		expect(out).toContain('p (0.550) exceeds activation threshold (0.300)');
		expect(out).toContain('plan touches Lean Turbo hot module(s)');
		// Gate-by-gate section
		expect(out).toContain('p-threshold');
		expect(out).toContain('hot-module');
		expect(out).toContain('greenfield');
		expect(out).toContain('src/global.ts');
		// History footer when records.length > 1
		expect(out).toContain('2 decisions total');
	});

	test('surfaces read errors as a friendly message rather than throwing', async () => {
		_internals.readPromotionEvidence = (() => {
			throw new Error('disk fell off');
		}) as never;
		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		expect(out).toContain('Error reading epic-promotions.jsonl');
		expect(out).toContain('disk fell off');
	});
});

describe('handleEpicCommand — calibration (Capability D state)', () => {
	test('returns "no state yet" + static threshold when state is null (clean repo)', async () => {
		_internals.loadCalibrationState = (() => null) as never;
		_internals.isCalibrationStateUnreadable = (() => false) as never;
		_internals.readDivergenceHistory = (() => []) as never;
		const out = await handleEpicCommand('/fake', ['calibration'], 'sess-1');
		expect(out).toContain('Epic Mode — Calibration');
		expect(out).toContain('No calibration state yet');
		// Static threshold from default config (0.3) must be surfaced.
		expect(out).toContain('0.300');
	});

	test('returns fail-closed message when calibration state is unreadable', async () => {
		_internals.isCalibrationStateUnreadable = (() => true) as never;
		const out = await handleEpicCommand('/fake', ['calibration'], 'sess-1');
		expect(out).toContain('unreadable (fail-closed)');
		expect(out).toContain('static config defaults');
	});

	test('renders effective threshold + tightening delta when override is set', async () => {
		_internals.isCalibrationStateUnreadable = (() => false) as never;
		_internals.loadCalibrationState = (() => ({
			version: 1 as const,
			updatedAt: '2026-05-28T10:00:00Z',
			activationThresholdOverride: 0.22,
			hotModuleAdditions: ['src/global.ts', 'src/init.ts'],
			consecutiveCleanCount: 3,
			lastCalibrationAt: '2026-05-28T09:45:00Z',
			processedRecords: 17,
		})) as never;
		_internals.readDivergenceHistory = (() => [
			{
				timestamp: '2026-05-28T09:00:00Z',
				sessionID: 's',
				taskId: 'T-2.4',
				declaredScope: ['src/foo.ts'],
				actualFiles: ['src/foo.ts', 'src/global.ts'],
				undeclared: ['src/global.ts'],
				unused: [],
				divergenceRatio: 0.5,
				isClean: false,
			},
		]) as never;
		const out = await handleEpicCommand('/fake', ['calibration'], 'sess-1');
		// Static and effective both shown with delta.
		expect(out).toContain('Static threshold (config): 0.300');
		expect(out).toContain('Effective threshold (learned)**: 0.220');
		expect(out).toContain('tightened by 0.080');
		// Counter + window from defaults.
		expect(out).toContain('Consecutive clean tasks: 3 / 10');
		// Hot module entries listed.
		expect(out).toContain('src/global.ts');
		expect(out).toContain('src/init.ts');
		// Recent divergent rendered with undeclared sample.
		expect(out).toContain('T-2.4');
		expect(out).toContain('ratio=0.50');
	});

	test('says "using static" when no override is set', async () => {
		_internals.isCalibrationStateUnreadable = (() => false) as never;
		_internals.loadCalibrationState = (() => ({
			version: 1 as const,
			updatedAt: '2026-05-28T10:00:00Z',
			hotModuleAdditions: [],
			consecutiveCleanCount: 0,
			processedRecords: 0,
		})) as never;
		_internals.readDivergenceHistory = (() => []) as never;
		const out = await handleEpicCommand('/fake', ['calibration'], 'sess-1');
		expect(out).toContain('using static — no calibration override');
		expect(out).toContain("hasn't promoted any modules");
		expect(out).toContain('None recent');
	});

	test('truncates long hot-module list at 10 entries with summary line', async () => {
		_internals.isCalibrationStateUnreadable = (() => false) as never;
		const lotsOfModules = Array.from({ length: 14 }, (_, i) => `src/m${i}.ts`);
		_internals.loadCalibrationState = (() => ({
			version: 1 as const,
			updatedAt: '2026-05-28T10:00:00Z',
			hotModuleAdditions: lotsOfModules,
			consecutiveCleanCount: 0,
			processedRecords: 20,
		})) as never;
		_internals.readDivergenceHistory = (() => []) as never;
		const out = await handleEpicCommand('/fake', ['calibration'], 'sess-1');
		expect(out).toContain('src/m0.ts');
		expect(out).toContain('src/m9.ts');
		expect(out).toContain('+4 more');
		// m10..m13 should not appear individually.
		expect(out).not.toContain('src/m12.ts');
	});
});

describe('Phase 14 (B26) — renderer surfaces phantomDeps on the greenfield line', () => {
	test('failing gate with phantom deps only ⇒ renderer names the typo, not "missing upstreams:" with empty list', async () => {
		_internals.readPromotionEvidence = (() => [
			{
				timestamp: '2026-06-03T12:00:00Z',
				sessionID: 'sess-1',
				phase: 2,
				verdict: {
					decision: 'demote' as const,
					p: 0.05,
					rationale: {
						pCheck: { passed: true, p: 0.05, threshold: 0.3 },
						hotModuleCheck: { passed: true, touchedHotModules: [] },
						greenfieldCheck: {
							passed: false,
							commitsObserved: 4,
							minCommits: 20,
							crossPhaseUpstreams: [],
							missingUpstreams: [],
							phantomDeps: ['1.7', '2.99'],
						},
					},
					blockingReasons: [
						'phantom dep id(s) declared but not present in plan (probable typo, fix the dep id) — 1.7, 2.99',
					],
				},
			},
		]) as never;

		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		// The phantom typo IDs MUST appear on the greenfield line itself.
		expect(out).toContain('phantom dep ids');
		expect(out).toContain('1.7');
		expect(out).toContain('2.99');
		// And the renderer must NOT emit a misleading empty
		// "missing upstreams: " segment.
		expect(out).not.toMatch(/missing upstreams: ?\n/);
	});

	test('failing gate with BOTH phantom deps and missing upstreams ⇒ both segments surface', async () => {
		_internals.readPromotionEvidence = (() => [
			{
				timestamp: '2026-06-03T13:00:00Z',
				sessionID: 'sess-1',
				phase: 3,
				verdict: {
					decision: 'demote' as const,
					p: 0.05,
					rationale: {
						pCheck: { passed: true, p: 0.05, threshold: 0.3 },
						hotModuleCheck: { passed: true, touchedHotModules: [] },
						greenfieldCheck: {
							passed: false,
							commitsObserved: 10,
							minCommits: 20,
							crossPhaseUpstreams: ['1.1'],
							missingUpstreams: ['1.1'],
							phantomDeps: ['2.99'],
						},
					},
					blockingReasons: [],
				},
			},
		]) as never;

		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		expect(out).toContain('phantom dep ids');
		expect(out).toContain('2.99');
		expect(out).toContain('missing upstreams');
		expect(out).toContain('1.1');
	});

	test('passing gate with cross-phase upstreams in git ⇒ renderer names them', async () => {
		_internals.readPromotionEvidence = (() => [
			{
				timestamp: '2026-06-03T14:00:00Z',
				sessionID: 'sess-1',
				phase: 2,
				verdict: {
					decision: 'promote' as const,
					p: 0.05,
					rationale: {
						pCheck: { passed: true, p: 0.05, threshold: 0.3 },
						hotModuleCheck: { passed: true, touchedHotModules: [] },
						greenfieldCheck: {
							passed: true,
							commitsObserved: 3,
							minCommits: 20,
							crossPhaseUpstreams: ['1.1', '1.2'],
							missingUpstreams: [],
						},
					},
					blockingReasons: [],
				},
			},
		]) as never;

		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		expect(out).toContain('cross-phase upstreams in git: 1.1, 1.2');
	});

	test('passing gate with no cross-phase upstreams ⇒ renders "vacuous" (Phase 1 / single-phase plans)', async () => {
		_internals.readPromotionEvidence = (() => [
			{
				timestamp: '2026-06-03T15:00:00Z',
				sessionID: 'sess-1',
				phase: 1,
				verdict: {
					decision: 'promote' as const,
					p: 0.05,
					rationale: {
						pCheck: { passed: true, p: 0.05, threshold: 0.3 },
						hotModuleCheck: { passed: true, touchedHotModules: [] },
						greenfieldCheck: {
							passed: true,
							commitsObserved: 0,
							minCommits: 20,
							crossPhaseUpstreams: [],
							missingUpstreams: [],
						},
					},
					blockingReasons: [],
				},
			},
		]) as never;

		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		expect(out).toContain('vacuous');
	});

	test('legacy record with no diagnostic fields ⇒ renderer prints honest "(legacy record?)" hint', async () => {
		_internals.readPromotionEvidence = (() => [
			{
				timestamp: '2026-05-01T10:00:00Z',
				sessionID: 'sess-pre10',
				phase: 1,
				verdict: {
					decision: 'demote' as const,
					p: 0.5,
					rationale: {
						pCheck: { passed: false, p: 0.5, threshold: 0.3 },
						hotModuleCheck: { passed: true, touchedHotModules: [] },
						greenfieldCheck: {
							passed: false,
							commitsObserved: 0,
							minCommits: 20,
							// no crossPhaseUpstreams / missingUpstreams /
							// phantomDeps — legacy pre-Phase-10 record
						},
					},
					blockingReasons: ['pre-Phase-10 reason'],
				},
			},
		]) as never;

		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		// Renderer doesn't crash. Doesn't print misleading empty list.
		expect(out).toContain('legacy record');
	});
});
