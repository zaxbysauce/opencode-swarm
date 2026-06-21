/**
 * Tests for Epic Mode banner constants + hasActiveEpicMode wiring.
 * File: tests/unit/hooks/system-enhancer-epic-banner.test.ts
 *
 * The full system-enhancer prompt-injection flow is heavy integration
 * machinery; this test covers the leaf-level invariants the
 * `if (hasActiveEpicMode(...)) inject(EPIC_MODE_BANNER)` block relies
 * on:
 *
 *   - `EPIC_MODE_BANNER` exists and instructs the architect to use
 *     `epic_run_phase` instead of `lean_turbo_run_phase`.
 *   - `hasActiveEpicMode(sessionID)` reads `session.epicModeActive`
 *     and returns the expected booleans (per-session and any-session).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { EPIC_MODE_BANNER } from '../../../src/config/constants';
import {
	hasActiveEpicMode,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state';

beforeEach(() => {
	resetSwarmState();
});

afterEach(() => {
	resetSwarmState();
});

describe('EPIC_MODE_BANNER content', () => {
	test('describes the SINGLE sanctioned phase-execution flow', () => {
		// The banner describes ONE flow:
		//   declare_scope → epic_decide_phase → epic_plan_waves
		//     → Task dispatch (per wave) → epic_record_divergence
		// All five tool names appear; the opaque alternatives are
		// explicitly forbidden. 2026-06-05 compression: text was condensed
		// to fit the 4000-token injection budget — assert semantic anchors,
		// not verbatim prose.
		expect(EPIC_MODE_BANNER).toContain('declare_scope');
		expect(EPIC_MODE_BANNER).toContain('epic_decide_phase');
		expect(EPIC_MODE_BANNER).toContain('epic_plan_waves');
		expect(EPIC_MODE_BANNER).toContain('Task');
		expect(EPIC_MODE_BANNER).toContain('epic_record_divergence');
		expect(EPIC_MODE_BANNER).toContain('Six-step flow');
	});

	test('forbids the opaque dispatch tools (lean_turbo_run_phase + epic_run_phase)', () => {
		// Both tools dispatch coders via opencodeClient internally (outside
		// opencode's Task tracking). The banner must block both so the
		// transparent Task-based dispatch is the only flow the architect
		// can take.
		expect(EPIC_MODE_BANNER).toContain(
			'Do NOT call `lean_turbo_run_phase` directly',
		);
		expect(EPIC_MODE_BANNER).toContain("Don't use `lean_turbo_run_phase`");
		// The architect's pretraining may include the deprecated
		// `epic_run_phase` tool. The banner must explicitly anchor the
		// model away from inventing a call to it.
		expect(EPIC_MODE_BANNER).toContain('epic_run_phase');
		expect(EPIC_MODE_BANNER).toContain('deprecated');
	});

	test('explains both promote and demote outcomes', () => {
		expect(EPIC_MODE_BANNER).toContain('promote');
		expect(EPIC_MODE_BANNER).toContain('demote');
	});

	test('preserves the Stage B / phase-reviewer requirement', () => {
		expect(EPIC_MODE_BANNER.toLowerCase()).toContain('phase reviewer');
	});

	test('puts a user-interrupt-priority rule FIRST, overriding the protocol', () => {
		// Live failure (Kimi K2.6, Phase 3, 2026-06-05): mid-phase, the
		// architect tunnel-visioned on a coder retry loop and ignored direct
		// user messages — even an explicit `/swarm epic status` slash
		// command. Root cause: nothing told it user input overrides the
		// flow, and the protocol banner is re-injected every turn. This rule
		// is the antidote and MUST appear before the six-step flow so it
		// outranks it.
		expect(EPIC_MODE_BANNER).toContain('THE USER ALWAYS COMES FIRST');
		expect(EPIC_MODE_BANNER).toContain('STOP advancing the flow');
		expect(EPIC_MODE_BANNER.toLowerCase()).toContain('slash command');
		// It must come BEFORE the six-step flow header to outrank it.
		expect(
			EPIC_MODE_BANNER.indexOf('THE USER ALWAYS COMES FIRST'),
		).toBeLessThan(EPIC_MODE_BANNER.indexOf('Six-step flow'));
	});

	test('asks the architect to tell the user the verdict and wave plan', () => {
		// Without this, weaker models (Kimi K2.6 observed) dispatched
		// silently and the user had no signal Epic was doing anything.
		// The 2026-06-05 v2 wording dropped the heavy "MANDATORY SURFACE /
		// copy VERBATIM" compliance scaffolding (which made the architect
		// robotic) in favor of a natural "tell the user … in your own
		// words" nudge for BOTH the verdict and the wave plan.
		// 2026-06-05 v3: reverted to the 06-03 plain "surface immediately"
		// phrasing that empirically worked, after the MANDATORY/VERBATIM
		// surface-block cascade (622aa1da etc.) regressed natural talking.
		expect(EPIC_MODE_BANNER).toContain(
			'Surface the verdict to the user immediately',
		);
		expect(EPIC_MODE_BANNER).toContain('Surface the wave plan to the user');
		// Natural narration is still framed as conversation, not a script.
		expect(EPIC_MODE_BANNER).toContain('in your own words');
		expect(EPIC_MODE_BANNER).toContain('in your own voice');
		// The robotic-era scaffolding must be gone — no MANDATORY SURFACE and
		// no "copy VERBATIM" surface-block phrasing (those tool-result
		// functions were deleted). NOTE: a legitimate "surface its output
		// VERBATIM" remains on the slash-command line (echo status output) —
		// that's not the robotic phrasing, so we target the specific strings.
		expect(EPIC_MODE_BANNER).not.toContain('MANDATORY SURFACE');
		expect(EPIC_MODE_BANNER).not.toContain('copy them VERBATIM');
		expect(EPIC_MODE_BANNER).not.toContain('COPIED VERBATIM');
	});

	test('lists the /swarm epic visibility commands', () => {
		// After 2026-06-05 compression these are listed as a single
		// pipe-joined line for token efficiency, not four separate lines.
		expect(EPIC_MODE_BANNER).toContain('/swarm epic status');
		expect(EPIC_MODE_BANNER).toContain('last');
		expect(EPIC_MODE_BANNER).toContain('decide');
		expect(EPIC_MODE_BANNER).toContain('calibration');
	});

	test('mandates surfacing divergence when a task wrote outside its declared scope', () => {
		// Without this, per-task divergence is silent — the user only sees
		// the activation decision, not the scope-discipline signal that
		// drives the next threshold tightening.
		expect(EPIC_MODE_BANNER).toContain('summary.isClean: false');
		expect(EPIC_MODE_BANNER).toContain('Divergence: task');
	});

	test('mandates declaring scope upfront BEFORE the decision call', () => {
		// Discovered live: without upfront scope declaration the wave
		// planner has no graph and falls back to serial dispatch silently.
		// After 2026-06-05 compression the rule is expressed compactly:
		// "declare ALL pending scopes UP FRONT (step 1), BEFORE step 2."
		expect(EPIC_MODE_BANNER).toContain('declare_scope');
		expect(EPIC_MODE_BANNER).toContain('UP FRONT');
		expect(EPIC_MODE_BANNER).toContain('BEFORE step 2');
		// Supersedes Rule 1a/3a's declare-as-you-go cadence.
		expect(EPIC_MODE_BANNER).toContain('Just-in-time declaration');
	});

	test('mandates Task dispatch (with all calls in ONE message per wave for parallel execution)', () => {
		// The point of the architect-led dispatch is opencode-tracked
		// subagents the user can click into for live visibility. Each wave
		// is one assistant message containing wave.taskIds.length separate
		// Task calls. After 2026-06-05 compression these are stated as
		// "SEPARATE Task calls in ONE assistant message".
		expect(EPIC_MODE_BANNER).toContain(
			'SEPARATE `Task` calls in ONE assistant message',
		);
		expect(EPIC_MODE_BANNER).toContain('subagent_type="coder"');
		expect(EPIC_MODE_BANNER).toContain('only sanctioned dispatch path');
		// Defects-to-avoid block must call out bundling and splitting
		// explicitly (these were observed live failure modes).
		expect(EPIC_MODE_BANNER).toContain('Bundling');
		expect(EPIC_MODE_BANNER).toContain('Splitting across messages');
		expect(EPIC_MODE_BANNER).toContain('Skipping single-task waves');
	});
});

describe('hasActiveEpicMode — per-session lookup', () => {
	test('returns false when no session exists', () => {
		expect(hasActiveEpicMode('non-existent')).toBe(false);
	});

	test('returns false for a session without epicModeActive set', () => {
		startAgentSession('sess-a', 'architect');
		expect(hasActiveEpicMode('sess-a')).toBe(false);
	});

	test('returns true when epicModeActive is explicitly set', () => {
		startAgentSession('sess-a', 'architect');
		const session = swarmState.agentSessions.get('sess-a');
		if (!session) throw new Error('session not found');
		session.epicModeActive = true;
		expect(hasActiveEpicMode('sess-a')).toBe(true);
	});

	test('returns false after the flag is cleared', () => {
		startAgentSession('sess-a', 'architect');
		const session = swarmState.agentSessions.get('sess-a');
		if (!session) throw new Error('session not found');
		session.epicModeActive = true;
		session.epicModeActive = false;
		expect(hasActiveEpicMode('sess-a')).toBe(false);
	});
});

describe('hasActiveEpicMode — global (any-session) lookup', () => {
	test('returns false when no sessions exist', () => {
		expect(hasActiveEpicMode()).toBe(false);
	});

	test('returns true if ANY session has it active', () => {
		startAgentSession('sess-a', 'architect');
		startAgentSession('sess-b', 'architect');
		const sb = swarmState.agentSessions.get('sess-b');
		if (!sb) throw new Error('session not found');
		sb.epicModeActive = true;
		expect(hasActiveEpicMode()).toBe(true);
	});

	test('returns false when no session has it active', () => {
		startAgentSession('sess-a', 'architect');
		startAgentSession('sess-b', 'architect');
		expect(hasActiveEpicMode()).toBe(false);
	});
});
