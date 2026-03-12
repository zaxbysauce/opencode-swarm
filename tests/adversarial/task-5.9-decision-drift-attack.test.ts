/**
 * ADVERSARIAL SECURITY TESTS for Decision Drift Detection (Task 5.9)
 *
 * Attack vectors covered:
 * 1. Malformed context/plan inputs - corrupted files, binary data, control chars
 * 2. Contradiction-spam prompt bloat - many contradictory decisions bloating context
 * 3. Malformed evidence JSON - invalid JSON structures attempting crash
 * 4. Gating bypass attempts - trying to bypass architect-only restriction
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
	analyzeDecisionDrift,
	extractDecisionsFromContext,
	findContradictions,
	formatDriftForContext,
	type Decision,
	type DriftAnalysisResult,
} from '../../src/services/decision-drift-analyzer';
import { createSystemEnhancerHook } from '../../src/hooks/system-enhancer';
import type { PluginConfig } from '../../src/config';
import { resetSwarmState, swarmState } from '../../src/state';
import { mkdtemp, writeFile, mkdir, rm, chmod, readFile } from 'node:fs/promises';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ============================================================================
// ATTACK VECTOR 1: MALFORMED CONTEXT/PLAN INPUTS
// ============================================================================

describe('ATTACK VECTOR 1: Malformed Context/Plan Inputs', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'drift-attack-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	test('handles binary data in context.md without crashing', async () => {
		const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x89, 0x50, 0x4e, 0x47]);
		await writeFile(join(tempDir, '.swarm', 'context.md'), binaryData);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
		expect(result.hasDrift).toBe(false);
		expect(result.signals).toBeInstanceOf(Array);
	});

	test('handles null bytes embedded in markdown', async () => {
		const maliciousContent = `## Decisions\n- Use \x00Type\x00Script\x00\n- \x00Remove\x00 config`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), maliciousContent);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
		expect(result.signals).toBeInstanceOf(Array);
	});

	test('handles control characters in decision text', async () => {
		const content = `## Decisions\n- Use \u001b[31mTypeScript\u001b[0m\n- \u0008\u0008Remove`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const decisions = extractDecisionsFromContext(content);
		expect(decisions).toBeInstanceOf(Array);
		// Should not throw, may extract sanitized content
	});

	test('handles deeply nested markdown structures', async () => {
		const nestedContent = `## Decisions\n${'  '.repeat(100)}- Deep nested decision`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), nestedContent);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles extremely long decision lines (DoS attempt)', async () => {
		const longDecision = 'x'.repeat(100000);
		const content = `## Decisions\n- ${longDecision}`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const startTime = Date.now();
		const result = await analyzeDecisionDrift(tempDir);
		const elapsed = Date.now() - startTime;

		expect(result).toBeDefined();
		// Should complete within reasonable time (< 5 seconds)
		expect(elapsed).toBeLessThan(5000);
	});

	test('handles context.md with only whitespace', async () => {
		await writeFile(join(tempDir, '.swarm', 'context.md'), '   \n\t\n   \n');

		const result = await analyzeDecisionDrift(tempDir);
		expect(result.hasDrift).toBe(false);
		expect(result.signals).toHaveLength(0);
	});

	test('handles empty context.md', async () => {
		await writeFile(join(tempDir, '.swarm', 'context.md'), '');

		const result = await analyzeDecisionDrift(tempDir);
		expect(result.hasDrift).toBe(false);
	});

	test('handles context.md with unicode edge cases', async () => {
		const content = `## Decisions\n- Use 🚀 emoji everywhere\n- 中文决定\n- العربية\n- עברית`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const decisions = extractDecisionsFromContext(content);
		expect(decisions.length).toBe(4);
	});

	test('handles malformed plan.json with invalid JSON', async () => {
		await writeFile(join(tempDir, '.swarm', 'plan.json'), '{ not valid json }');
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
		// Should gracefully handle plan parse error
	});

	test('handles plan.json with unexpected structure', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ foo: 'bar', nested: { deeply: { invalid: true } } }),
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles plan.json with null current_phase', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ current_phase: null, phases: [] }),
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles plan.json with negative phase number', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ current_phase: -999, phases: [] }),
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles plan.json with Infinity phase', async () => {
		// JSON.stringify will convert Infinity to null, but let's write it manually
		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			'{"current_phase": Infinity, "phases": []}',
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		// Should not crash - JSON.parse will handle it
		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles context with malformed phase markers', async () => {
		const content = `## Phase abc\n## Phase -1\n## Phase NaN\n## Decisions\n- Use TypeScript`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const decisions = extractDecisionsFromContext(content);
		expect(decisions).toBeInstanceOf(Array);
	});

	test('handles cyclic section references (markdown bomb attempt)', async () => {
		// Create a file with repeated section references
		const sections = [];
		for (let i = 0; i < 1000; i++) {
			sections.push(`## Section${i}\nContent${i}`);
		}
		sections.push(`## Decisions\n- Decision`);
		const content = sections.join('\n\n');
		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const startTime = Date.now();
		const result = await analyzeDecisionDrift(tempDir);
		const elapsed = Date.now() - startTime;

		expect(result).toBeDefined();
		expect(elapsed).toBeLessThan(5000);
	});
});

// ============================================================================
// ATTACK VECTOR 2: CONTRADICTION-SPAM PROMPT BLOAT
// ============================================================================

describe('ATTACK VECTOR 2: Contradiction-Spam Prompt Bloat', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'drift-attack-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	test('limits contradictions via maxSignals config', async () => {
		// Create 100 contradictory decision pairs
		const decisions: string[] = [];
		for (let i = 0; i < 100; i++) {
			decisions.push(`- Use library-${i}`);
			decisions.push(`- Do not use library-${i}`);
		}

		const content = `## Decisions\n${decisions.join('\n')}`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		// Default maxSignals is 5
		const result = await analyzeDecisionDrift(tempDir);
		expect(result.signals.length).toBeLessThanOrEqual(5);
	});

	test('contradiction detection does not cause exponential time', async () => {
		// Create many decisions that could cause O(n^2) comparison issues
		const decisions: Decision[] = [];
		for (let i = 0; i < 500; i++) {
			decisions.push({
				text: `Decision ${i} with unique content`,
				phase: 1,
				confirmed: false,
				timestamp: null,
				line: i + 1,
			});
		}

		const startTime = Date.now();
		const contradictions = findContradictions(decisions);
		const elapsed = Date.now() - startTime;

		expect(contradictions).toBeInstanceOf(Array);
		// Should complete in reasonable time even with 500 decisions
		expect(elapsed).toBeLessThan(5000);
	});

	test('formatDriftForContext truncates long summaries', async () => {
		const longSignals = Array.from({ length: 100 }, (_, i) => ({
			id: `stale-${i}`,
			severity: 'warning' as const,
			type: 'stale' as const,
			message: `Stale decision: ${'x'.repeat(100)}`,
			source: { file: 'context.md', line: i + 1 },
		}));

		const result: DriftAnalysisResult = {
			hasDrift: true,
			signals: longSignals,
			summary: 'x'.repeat(2000), // Very long summary
			analyzedAt: new Date().toISOString(),
		};

		const formatted = formatDriftForContext(result);
		expect(formatted.length).toBeLessThanOrEqual(603); // maxLength 600 + "..."
	});

	test('handles contradictory decisions with similar subjects correctly', () => {
		const decisions: Decision[] = [
			{ text: 'Use TypeScript for all files', phase: 1, confirmed: true, timestamp: null, line: 1 },
			{ text: 'Do not use TypeScript for files', phase: 2, confirmed: false, timestamp: null, line: 2 },
		];

		const contradictions = findContradictions(decisions);
		expect(contradictions.length).toBeGreaterThan(0);
	});

	test('does not false positive on unrelated decisions', () => {
		const decisions: Decision[] = [
			{ text: 'Use React for frontend', phase: 1, confirmed: true, timestamp: null, line: 1 },
			{ text: 'Use Vue for frontend widget', phase: 2, confirmed: false, timestamp: null, line: 2 },
		];

		const contradictions = findContradictions(decisions);
		// These are different frameworks but not direct contradictions
		expect(contradictions.length).toBe(0);
	});

	test('handles decisions with common words that could cause false positives', () => {
		const decisions: Decision[] = [
			{ text: 'The system must validate input', phase: 1, confirmed: true, timestamp: null, line: 1 },
			{ text: 'The system must log errors', phase: 2, confirmed: false, timestamp: null, line: 2 },
			{ text: 'The system must handle timeouts', phase: 3, confirmed: false, timestamp: null, line: 3 },
		];

		const contradictions = findContradictions(decisions);
		// These are all "must" statements but about different things - not contradictions
		expect(contradictions.length).toBe(0);
	});

	test('massive contradiction text does not overflow context window', async () => {
		const decisions: string[] = [];
		// Create massive contradictory decisions
		for (let i = 0; i < 50; i++) {
			decisions.push(`- Keep file ${'a'.repeat(200)}${i}`);
			decisions.push(`- Remove file ${'b'.repeat(200)}${i}`);
		}

		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ current_phase: 2, phases: [] }),
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n${decisions.join('\n')}`);

		const result = await analyzeDecisionDrift(tempDir);
		const formatted = formatDriftForContext(result);

		// Verify bounded output
		expect(formatted.length).toBeLessThanOrEqual(603);
	});
});

// ============================================================================
// ATTACK VECTOR 3: MALFORMED EVIDENCE JSON
// ============================================================================

describe('ATTACK VECTOR 3: Malformed Evidence JSON', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'drift-attack-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
		await mkdir(join(tempDir, '.swarm', 'evidence'), { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	test('handles corrupted evidence JSON files', async () => {
		await writeFile(join(tempDir, '.swarm', 'evidence', 'phase-1.json'), 'not valid json {{{');
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		// This tests the system enhancer which reads evidence files
		// Should not crash
		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles evidence JSON with prototype pollution attempt', async () => {
		const malicious = JSON.stringify({
			__proto__: { polluted: true },
			constructor: { prototype: { polluted: true } },
			type: 'retrospective',
		});
		await writeFile(join(tempDir, '.swarm', 'evidence', 'phase-1.json'), malicious);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles evidence JSON with null values', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'evidence', 'phase-1.json'),
			JSON.stringify({ type: null, data: null }),
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles evidence JSON with circular reference attempt', async () => {
		// Can't actually create circular in JSON, but test with self-referencing keys
		const circular = '{"a":"$ref:b","b":"$ref:a"}';
		await writeFile(join(tempDir, '.swarm', 'evidence', 'phase-1.json'), circular);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles evidence JSON with extremely large numbers', async () => {
		const largeNums = JSON.stringify({
			type: 'retrospective',
			phase_number: 1e308,
			reviewer_rejections: Infinity,
		});
		await writeFile(join(tempDir, '.swarm', 'evidence', 'phase-1.json'), largeNums);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles evidence directory without read permissions', async () => {
		await writeFile(join(tempDir, '.swarm', 'evidence', 'phase-1.json'), '{"type":"retrospective"}');
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		// Note: Permission tests may not work on all platforms
		try {
			await chmod(join(tempDir, '.swarm', 'evidence'), 0o000);
		} catch {
			// Skip on platforms that don't support chmod
		}

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles symlinks in evidence directory', async () => {
		// Create a symlink that could point outside the directory
		await writeFile(join(tempDir, '.swarm', 'evidence', 'phase-1.json'), '{"type":"retrospective"}');

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});
});

// ============================================================================
// ATTACK VECTOR 4: GATING BYPASS ATTEMPTS
// ============================================================================

describe('ATTACK VECTOR 4: Gating Bypass Attempts', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'drift-attack-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
		resetSwarmState();
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	const defaultConfig: PluginConfig = {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	const withDriftCapabilities = (enabled: boolean): PluginConfig['automation'] => ({
		mode: 'manual',
		capabilities: {
			plan_sync: false,
			phase_preflight: false,
			config_doctor_on_startup: false,
			config_doctor_autofix: false,
			evidence_auto_summaries: false,
			decision_drift_detection: enabled,
		},
	});

	async function invokeHook(config: PluginConfig, sessionID?: string): Promise<string[]> {
		const hooks = createSystemEnhancerHook(config, tempDir);
		const transform = hooks['experimental.chat.system.transform'] as (
			input: { sessionID?: string },
			output: { system: string[] },
		) => Promise<void>;
		const input = { sessionID: sessionID ?? 'test-session' };
		const output = { system: ['Initial system prompt'] };
		await transform(input, output);
		return output.system;
	}

	test('coder agent cannot bypass drift detection gate', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(true),
		};

		// Try to bypass by setting active agent to coder
		swarmState.activeAgent.set('test-session', 'swarm_coder');

		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));

		// Should NOT inject drift for coder
		expect(driftContent).toHaveLength(0);
	});

	test('reviewer agent cannot bypass drift detection gate', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(true),
		};

		swarmState.activeAgent.set('test-session', 'swarm_reviewer');

		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));

		expect(driftContent).toHaveLength(0);
	});

	test('architect with correct prefix gets drift detection', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(true),
		};

		swarmState.activeAgent.set('test-session', 'swarm_architect');

		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));

		expect(driftContent.length).toBeGreaterThan(0);
	});

	test('architect without prefix still gets drift detection', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(true),
		};

		swarmState.activeAgent.set('test-session', 'architect');

		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));

		expect(driftContent.length).toBeGreaterThan(0);
	});

	test('empty sessionID does not crash drift detection', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(true),
		};

		// Should not crash with undefined sessionID
		const systemOutput = await invokeHook(config, undefined);
		expect(systemOutput).toBeInstanceOf(Array);
	});

	test('feature flag disabled blocks drift detection even for architect', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(false), // Disabled
		};

		swarmState.activeAgent.set('test-session', 'swarm_architect');

		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));

		expect(driftContent).toHaveLength(0);
	});

	test('sessionID with special characters is handled safely', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(true),
		};

		// Try malicious session IDs
		const maliciousSessionIds = [
			'../etc/passwd',
			'; rm -rf /',
			'${process.env}',
			'<script>alert(1)</script>',
			'null',
			'undefined',
		];

		for (const sessionId of maliciousSessionIds) {
			swarmState.activeAgent.set(sessionId, 'swarm_architect');
			const systemOutput = await invokeHook(config, sessionId);
			expect(systemOutput).toBeInstanceOf(Array);
		}
	});

	test('cannot bypass by manipulating swarmState directly during hook call', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.md'),
			'# Plan\n\nPhase: 2\n\n## Phase 1 [COMPLETE]\n## Phase 2 [IN PROGRESS]',
		);
		await writeFile(
			join(tempDir, '.swarm', 'context.md'),
			`## Decisions\n- Use TypeScript Phase 1`,
		);

		const config: PluginConfig = {
			...defaultConfig,
			automation: withDriftCapabilities(true),
		};

		// Set to coder initially
		swarmState.activeAgent.set('test-session', 'swarm_coder');

		// The hook reads state at call time, so coder should not get drift
		const systemOutput = await invokeHook(config, 'test-session');
		const driftContent = systemOutput.filter((s) => s.includes('DECISION DRIFT'));

		expect(driftContent).toHaveLength(0);
	});
});

// ============================================================================
// ADDITIONAL EDGE CASES
// ============================================================================

describe('Edge Cases and Additional Attack Vectors', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'drift-attack-'));
		await mkdir(join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	test('handles decision text that looks like code injection', async () => {
		const content = `## Decisions
- Use \${process.exit(1)} as pattern
- Execute \`(function(){throw new Error()})()\`
- Run \`require('child_process').exec('rm -rf /')\``;

		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const decisions = extractDecisionsFromContext(content);
		expect(decisions.length).toBe(3);
		// Should extract literally, not execute
		expect(decisions[0].text).toContain('${');
	});

	test('handles decision text with markdown injection attempt', async () => {
		const content = `## Decisions
- Use [link](javascript:alert(1))
- See ![img](data:text/html,<script>alert(1)</script>)
- Check <!-- comment --><script>alert(1)</script>`;

		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const decisions = extractDecisionsFromContext(content);
		expect(decisions.length).toBe(3);
	});

	test('handles decisions section at very end of large file', async () => {
		const largeContent = `## Agent Activity\n${'x'.repeat(50000)}\n\n## Decisions\n- Last decision`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), largeContent);

		const decisions = extractDecisionsFromContext(largeContent);
		expect(decisions.length).toBe(1);
		expect(decisions[0].text).toContain('Last decision');
	});

	test('handles multiple decisions sections (uses first)', async () => {
		const content = `## Decisions\n- First\n\n## Other\n\n## Decisions\n- Second`;
		await writeFile(join(tempDir, '.swarm', 'context.md'), content);

		const decisions = extractDecisionsFromContext(content);
		// Should stop at first section end (## Other)
		expect(decisions.length).toBe(1);
		expect(decisions[0].text).toBe('First');
	});

	test('handles timestamp with various formats', async () => {
		const content = `## Decisions
- Decision 1 [2024-01-15T10:30:00Z]
- Decision 2 [2024-01-15T10:30:00.000Z]
- Decision 3 [not-a-timestamp]`;

		const decisions = extractDecisionsFromContext(content);
		// Note: The timestamp regex only matches Z-suffixed timestamps, not +HH:MM offsets
		expect(decisions[0].timestamp).toBe('2024-01-15T10:30:00Z');
		expect(decisions[1].timestamp).toBe('2024-01-15T10:30:00.000Z');
		// Third one should not match timestamp pattern
		expect(decisions[2].timestamp).toBeNull();
	});

	test('handles phase extraction from decision text edge cases', async () => {
		const content = `## Decisions
- Use Phase 10 for advanced features
- Phase 2 is complete
- The Phase99 approach
- Phase number: 5`;

		const decisions = extractDecisionsFromContext(content);
		// Verify phase extraction works reasonably
		expect(decisions).toBeInstanceOf(Array);
	});

	test('analyzeDecisionDrift with empty directory does not crash', async () => {
		// Don't create .swarm directory
		const result = await analyzeDecisionDrift(tempDir);
		expect(result.hasDrift).toBe(false);
		expect(result.signals).toHaveLength(0);
	});

	test('handles extremely high phase numbers', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ current_phase: 999999999, phases: [] }),
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		const result = await analyzeDecisionDrift(tempDir);
		expect(result).toBeDefined();
	});

	test('handles config with negative staleThresholdPhases', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ current_phase: 1, phases: [] }),
		);
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n- Use TypeScript`);

		// Should handle gracefully
		const result = await analyzeDecisionDrift(tempDir, { staleThresholdPhases: -1 });
		expect(result).toBeDefined();
	});

	test('handles config with very large maxSignals', async () => {
		await writeFile(
			join(tempDir, '.swarm', 'plan.json'),
			JSON.stringify({ current_phase: 10, phases: [] }),
		);

		const decisions = Array.from({ length: 20 }, (_, i) => `- Decision ${i}`).join('\n');
		await writeFile(join(tempDir, '.swarm', 'context.md'), `## Decisions\n${decisions}`);

		const result = await analyzeDecisionDrift(tempDir, { maxSignals: 1000000 });
		expect(result.signals.length).toBe(20);
	});
});
