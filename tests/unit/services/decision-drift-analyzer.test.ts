import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
	analyzeDecisionDrift,
	extractDecisionsFromContext,
	findContradictions,
	formatDriftForContext,
	type DriftAnalysisResult,
	type DriftSignal,
} from '../../../src/services/decision-drift-analyzer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('decision-drift-analyzer', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(tmpdir(), 'drift-test-'));
	});

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors on Windows
		}
	});

	describe('extractDecisionsFromContext', () => {
		it('should extract decisions from context.md', () => {
			const context = `## Phase 1: Setup

Some content here

## Decisions
- Use TypeScript for type safety
- Use Bun as runtime
- Adopt ESLint for linting

## Agent Activity
Some activity`;

			const decisions = extractDecisionsFromContext(context);
			expect(decisions).toHaveLength(3);
			expect(decisions[0].text).toContain('TypeScript');
			expect(decisions[1].text).toContain('Bun');
			expect(decisions[2].text).toContain('ESLint');
		});

		it('should extract phase from decision text when present', () => {
			const context = `## Decisions
- ✅ Use TypeScript Phase 1 [confirmed]
- Use Jest for testing`;

			const decisions = extractDecisionsFromContext(context);
			expect(decisions[0].confirmed).toBe(true);
			expect(decisions[1].confirmed).toBe(false);
		});

		it('should handle empty context', () => {
			const decisions = extractDecisionsFromContext('');
			expect(decisions).toHaveLength(0);
		});

		it('should handle context without decisions section', () => {
			const context = `## Phase 1

Some content without decisions`;

			const decisions = extractDecisionsFromContext(context);
			expect(decisions).toHaveLength(0);
		});

		it('should extract timestamps when present', () => {
			const context = `## Decisions
- Use TypeScript [2024-01-15T10:30:00Z]
- Use Jest`;

			const decisions = extractDecisionsFromContext(context);
			expect(decisions[0].timestamp).toBe('2024-01-15T10:30:00Z');
			expect(decisions[1].timestamp).toBeNull();
		});
	});

	describe('findContradictions', () => {
		it('should detect contradictions between use and not use', () => {
			const decisions = [
				{ text: 'Use TypeScript for the project', phase: 1, confirmed: true, timestamp: null, line: 1 },
				{ text: 'Do not use TypeScript', phase: 2, confirmed: false, timestamp: null, line: 2 },
			];

			const contradictions = findContradictions(decisions);
			expect(contradictions.length).toBeGreaterThan(0);
			expect(contradictions[0].type).toBe('contradiction');
		});

		it('should detect contradictions between keep and remove', () => {
			const decisions = [
				{ text: 'Keep the existing config', phase: 1, confirmed: true, timestamp: null, line: 1 },
				{ text: 'Remove the config file', phase: 2, confirmed: false, timestamp: null, line: 2 },
			];

			const contradictions = findContradictions(decisions);
			expect(contradictions.length).toBeGreaterThan(0);
		});

		it('should not flag unrelated decisions as contradictions', () => {
			const decisions = [
				{ text: 'Use TypeScript for backend', phase: 1, confirmed: true, timestamp: null, line: 1 },
				{ text: 'Use React for frontend', phase: 2, confirmed: false, timestamp: null, line: 2 },
			];

			const contradictions = findContradictions(decisions);
			// These are different subjects, should not be contradictory
			expect(contradictions.length).toBe(0);
		});

		it('should return empty array for less than 2 decisions', () => {
			const decisions = [
				{ text: 'Use TypeScript', phase: 1, confirmed: true, timestamp: null, line: 1 },
			];

			const contradictions = findContradictions(decisions);
			expect(contradictions).toHaveLength(0);
		});
	});

	describe('analyzeDecisionDrift', () => {
		it('should return empty result when no context file exists', async () => {
			const result = await analyzeDecisionDrift(tempDir);
			expect(result.hasDrift).toBe(false);
			expect(result.signals).toHaveLength(0);
		});

		it('should return empty result when context has no decisions', async () => {
			// Create empty context.md
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				'## Phase 1\n\nSome content',
			);

			const result = await analyzeDecisionDrift(tempDir);
			expect(result.hasDrift).toBe(false);
		});

		it('should detect stale decisions from past phases', async () => {
			// Create plan.json with current_phase = 3
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.json'),
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Test Plan',
					swarm: 'test',
					current_phase: 3,
					phases: [
						{ id: 1, name: 'Phase 1', status: 'complete', tasks: [] },
						{ id: 2, name: 'Phase 2', status: 'complete', tasks: [] },
						{ id: 3, name: 'Phase 3', status: 'in_progress', tasks: [] },
					],
				}),
			);

			// Create context.md with a stale decision from Phase 1
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				`## Phase 1

## Decisions
- Use TypeScript for the project

## Phase 3
Current phase is now active`,
			);

			const result = await analyzeDecisionDrift(tempDir);
			expect(result.hasDrift).toBe(true);
			expect(result.signals.some((s) => s.type === 'stale')).toBe(true);
		});

		it('should detect unconfirmed decisions in current phase', async () => {
			// Create plan.json with current_phase = 1
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.json'),
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Test Plan',
					swarm: 'test',
					current_phase: 1,
					phases: [{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] }],
				}),
			);

			// Create context.md with unconfirmed decisions
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				`## Phase 1

## Decisions
- Use TypeScript for the project
- ✅ Confirm this decision`,
			);

			const result = await analyzeDecisionDrift(tempDir);
			// Should detect stale because unconfirmed in current phase
			expect(result.signals.length).toBeGreaterThan(0);
		});

		it('should detect contradictions', async () => {
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.json'),
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Test Plan',
					swarm: 'test',
					current_phase: 1,
					phases: [{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] }],
				}),
			);

			// Create context with contradictory decisions
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				`## Decisions
- Use TypeScript for the project
- Do not use TypeScript in the codebase`,
			);

			const result = await analyzeDecisionDrift(tempDir);
			expect(result.hasDrift).toBe(true);
			expect(result.signals.some((s) => s.type === 'contradiction')).toBe(true);
		});

		it('should respect maxSignals config', async () => {
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.json'),
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Test Plan',
					swarm: 'test',
					current_phase: 5,
					phases: [
						{ id: 1, name: 'Phase 1', status: 'complete', tasks: [] },
						{ id: 2, name: 'Phase 2', status: 'complete', tasks: [] },
						{ id: 3, name: 'Phase 3', status: 'complete', tasks: [] },
						{ id: 4, name: 'Phase 4', status: 'complete', tasks: [] },
						{ id: 5, name: 'Phase 5', status: 'in_progress', tasks: [] },
					],
				}),
			);

			// Create many stale decisions
			const manyDecisions = Array.from({ length: 10 }, (_, i) => `- Decision ${i + 1}`).join('\n');
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				`## Phase 1
## Decisions
${manyDecisions}`,
			);

			const result = await analyzeDecisionDrift(tempDir, { maxSignals: 3 });
			expect(result.signals.length).toBeLessThanOrEqual(3);
		});

		it('should disable contradiction detection when configured', async () => {
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.json'),
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Test Plan',
					swarm: 'test',
					current_phase: 1,
					phases: [{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] }],
				}),
			);

			// Create context with contradictory decisions
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				`## Decisions
- Use TypeScript
- Do not use TypeScript`,
			);

			const result = await analyzeDecisionDrift(tempDir, { detectContradictions: false });
			// Should not detect contradiction
			expect(result.signals.some((s) => s.type === 'contradiction')).toBe(false);
		});
	});

	describe('formatDriftForContext', () => {
		it('should return empty string when no drift', () => {
			const result: DriftAnalysisResult = {
				hasDrift: false,
				signals: [],
				summary: '',
				analyzedAt: new Date().toISOString(),
			};

			expect(formatDriftForContext(result)).toBe('');
		});

		it('should format drift summary correctly', () => {
			const signals: DriftSignal[] = [
				{
					id: 'stale-1',
					severity: 'warning',
					type: 'stale',
					message: 'Stale decision from Phase 1',
					source: { file: 'context.md', line: 5 },
					hint: 'Consider confirming or revisiting',
				},
				{
					id: 'contradiction-1',
					severity: 'error',
					type: 'contradiction',
					message: 'Contradictory decisions detected',
					source: { file: 'context.md', line: 10 },
					relatedDecisions: ['Use TypeScript', 'Do not use TypeScript'],
				},
			];

			// Build the summary the same way analyzeDecisionDrift does
			const warnings = signals.filter((s) => s.severity === 'warning');
			const errors = signals.filter((s) => s.severity === 'error');
			const lines: string[] = ['[SWARM DECISION DRIFT]'];
			if (errors.length > 0) {
				lines.push(`⚠️ ${errors.length} contradiction(s) detected:`);
				for (const err of errors.slice(0, 2)) {
					const related = err.relatedDecisions
						? ` (${err.relatedDecisions[0].substring(0, 30)}... vs ${err.relatedDecisions[1].substring(0, 30)}...)`
						: '';
					lines.push(`  - ${err.type}: ${err.message}${related}`);
				}
			}
			if (warnings.length > 0) {
				lines.push(`💡 ${warnings.length} stale decision(s) found:`);
				for (const warn of warnings.slice(0, 3)) {
					const hint = warn.hint ? ` - ${warn.hint}` : '';
					lines.push(`  - ${warn.message.substring(0, 60)}${hint}`);
				}
			}
			lines.push('See .swarm/context.md for details.');
			const expectedSummary = lines.join('\n');

			const result: DriftAnalysisResult = {
				hasDrift: true,
				signals,
				summary: expectedSummary,
				analyzedAt: new Date().toISOString(),
			};

			const formatted = formatDriftForContext(result);
			expect(formatted).toContain('[SWARM DECISION DRIFT]');
			expect(formatted).toContain('contradiction');
			expect(formatted).toContain('stale');
		});

		it('should truncate long summaries', () => {
			const longMessage = 'Stale decision: ' + 'x'.repeat(1000);
			const signals: DriftSignal[] = [
				{
					id: 'stale-1',
					severity: 'warning',
					type: 'stale',
					message: longMessage,
					source: { file: 'context.md', line: 5 },
				},
			];

			const result: DriftAnalysisResult = {
				hasDrift: true,
				signals,
				summary: 'Test summary',
				analyzedAt: new Date().toISOString(),
			};

			const formatted = formatDriftForContext(result);
			expect(formatted.length).toBeLessThan(700);
		});
	});

	describe('negative cases', () => {
		it('should not flag recent confirmed decisions as stale', async () => {
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.json'),
				JSON.stringify({
					schema_version: '1.0.0',
					title: 'Test Plan',
					swarm: 'test',
					current_phase: 1,
					phases: [{ id: 1, name: 'Phase 1', status: 'in_progress', tasks: [] }],
				}),
			);

			// Create context with confirmed decision in current phase
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				`## Decisions
- ✅ Use TypeScript [confirmed]`,
			);

			const result = await analyzeDecisionDrift(tempDir);
			// Should not detect stale because it's confirmed
			const staleSignals = result.signals.filter((s) => s.type === 'stale');
			expect(staleSignals.length).toBe(0);
		});

		it('should handle legacy plan.md format', async () => {
			fs.mkdirSync(path.join(tempDir, '.swarm'));
			// Create legacy plan.md instead of plan.json
			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'plan.md'),
				`# Test Plan

Phase: 2

## Phase 1: Setup [COMPLETE]
- Task 1

## Phase 2: Implementation [IN PROGRESS]
- Task 2`,
			);

			fs.writeFileSync(
				path.join(tempDir, '.swarm', 'context.md'),
				`## Decisions
- Use TypeScript Phase 1`,
			);

			// Test decision extraction separately
			const contextContent = fs.readFileSync(path.join(tempDir, '.swarm', 'context.md'), 'utf-8');
			const decisions = extractDecisionsFromContext(contextContent);
			console.log('Extracted decisions:', JSON.stringify(decisions, null, 2));

			const result = await analyzeDecisionDrift(tempDir);
			
			// Should work without crashing and detect stale from Phase 1
			expect(result).toBeDefined();
			// Debug output
			console.log('Legacy test result:', JSON.stringify(result));
			expect(result.hasDrift).toBe(true);
			const staleSignals = result.signals.filter((s) => s.type === 'stale');
			expect(staleSignals.length).toBeGreaterThan(0);
		});
	});
});
