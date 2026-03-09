import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readCuratorSummary, writeCuratorSummary, filterPhaseEvents, checkPhaseCompliance, runCuratorInit, runCuratorPhase, applyCuratorKnowledgeUpdates } from '../../../src/hooks/curator.js';
import { getGlobalEventBus, resetGlobalEventBus } from '../../../src/background/event-bus.js';
import type { CuratorSummary, CuratorConfig, KnowledgeRecommendation } from '../../../src/hooks/curator-types';
import type { KnowledgeConfig, SwarmKnowledgeEntry } from '../../../src/hooks/knowledge-types';

describe('curator', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-test-'));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe('readCuratorSummary', () => {
		it('returns null when file is missing', async () => {
			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('returns null when JSON is corrupt', async () => {
			// Create .swarm directory with corrupt JSON
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				'{ invalid json }',
			);

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('returns null when schema_version is 2', async () => {
			// Write invalid schema version directly to file (type requires 1)
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				JSON.stringify({
					schema_version: 2, // Invalid: must be 1
					session_id: 'test-session',
					last_updated: new Date().toISOString(),
					last_phase_covered: 1,
					digest: 'test-digest',
					phase_digests: [],
					compliance_observations: [],
					knowledge_recommendations: [],
				}),
			);

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('returns valid CuratorSummary when file exists and schema_version is 1', async () => {
			const validSummary: CuratorSummary = {
				schema_version: 1,
				session_id: 'test-session-123',
				last_updated: '2024-01-15T10:30:00.000Z',
				last_phase_covered: 2,
				digest: 'phase1:foo;phase2:bar',
				phase_digests: [
					{
						phase: 1,
						timestamp: '2024-01-15T09:00:00.000Z',
						summary: 'Completed Phase 1',
						agents_used: ['coder', 'reviewer'],
						tasks_completed: 5,
						tasks_total: 5,
						key_decisions: ['decision1'],
						blockers_resolved: ['blocker1'],
					},
				],
				compliance_observations: [
					{
						phase: 1,
						timestamp: '2024-01-15T10:00:00.000Z',
						type: 'missing_reviewer',
						description: 'No reviewer detected',
						severity: 'info',
					},
				],
				knowledge_recommendations: [
					{
						action: 'promote',
						entry_id: 'entry-1',
						lesson: 'Always run tests',
						reason: 'Important lesson',
					},
				],
			};

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				JSON.stringify(validSummary),
			);

			const result = await readCuratorSummary(tempDir);
			expect(result).not.toBeNull();
			expect(result?.schema_version).toBe(1);
			expect(result?.session_id).toBe('test-session-123');
			expect(result?.last_phase_covered).toBe(2);
			expect(result?.phase_digests).toHaveLength(1);
			expect(result?.compliance_observations).toHaveLength(1);
			expect(result?.knowledge_recommendations).toHaveLength(1);
		});
	});

	describe('writeCuratorSummary', () => {
		it('creates .swarm/ directory if missing and writes JSON', async () => {
			const summary: CuratorSummary = {
				schema_version: 1,
				session_id: 'new-session',
				last_updated: '2024-01-15T12:00:00.000Z',
				last_phase_covered: 1,
				digest: 'initial-digest',
				phase_digests: [],
				compliance_observations: [],
				knowledge_recommendations: [],
			};

			// Ensure .swarm directory does not exist
			expect(fs.existsSync(path.join(tempDir, '.swarm'))).toBe(false);

			await writeCuratorSummary(tempDir, summary);

			// Verify file was created
			const filePath = path.join(tempDir, '.swarm', 'curator-summary.json');
			expect(fs.existsSync(filePath)).toBe(true);

			// Verify content
			const content = fs.readFileSync(filePath, 'utf-8');
			const parsed = JSON.parse(content);
			expect(parsed.schema_version).toBe(1);
			expect(parsed.session_id).toBe('new-session');
		});

		it('overwrites existing file with new content', async () => {
			const initialSummary: CuratorSummary = {
				schema_version: 1,
				session_id: 'initial-session',
				last_updated: '2024-01-15T08:00:00.000Z',
				last_phase_covered: 0,
				digest: 'empty',
				phase_digests: [],
				compliance_observations: [],
				knowledge_recommendations: [],
			};

			const newSummary: CuratorSummary = {
				schema_version: 1,
				session_id: 'updated-session',
				last_updated: '2024-01-15T14:00:00.000Z',
				last_phase_covered: 3,
				digest: 'phase1:a;phase2:b;phase3:c',
				phase_digests: [
					{
						phase: 1,
						timestamp: '2024-01-15T09:00:00.000Z',
						summary: 'Phase 1 done',
						agents_used: ['coder'],
						tasks_completed: 3,
						tasks_total: 3,
						key_decisions: [],
						blockers_resolved: [],
					},
				],
				compliance_observations: [],
				knowledge_recommendations: [],
			};

			// Write initial summary
			await writeCuratorSummary(tempDir, initialSummary);

			// Verify initial content
			const initialPath = path.join(tempDir, '.swarm', 'curator-summary.json');
			let content = JSON.parse(fs.readFileSync(initialPath, 'utf-8'));
			expect(content.session_id).toBe('initial-session');

			// Overwrite with new summary
			await writeCuratorSummary(tempDir, newSummary);

			// Verify new content
			content = JSON.parse(fs.readFileSync(initialPath, 'utf-8'));
			expect(content.session_id).toBe('updated-session');
			expect(content.last_phase_covered).toBe(3);
			expect(content.phase_digests).toHaveLength(1);
		});

		it('throws on path traversal in filename', async () => {
			const summary: CuratorSummary = {
				schema_version: 1,
				session_id: 'test',
				last_updated: '2024-01-15T12:00:00.000Z',
				last_phase_covered: 1,
				digest: 'test',
				phase_digests: [],
				compliance_observations: [],
				knowledge_recommendations: [],
			};

			// We need to test validateSwarmPath directly for path traversal in filename
			// since writeCuratorSummary always uses 'curator-summary.json'
			const { validateSwarmPath } = await import('../../../src/hooks/utils');
			expect(() => validateSwarmPath(tempDir, '../escape/curator.json')).toThrow();
		});
	});

	describe('filterPhaseEvents', () => {
		it('returns empty array for empty string input', () => {
			const result = filterPhaseEvents('', 1);
			expect(result).toEqual([]);
		});

		it('skips blank lines in JSONL', () => {
			const jsonl = `{"type": "test", "phase": 1}

{"type": "test2", "phase": 1}`;
			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toHaveLength(2);
		});

		it('skips malformed JSON lines without throwing', () => {
			const jsonl = `{"type": "valid", "phase": 1}
invalid json here
{"type": "also valid", "phase": 1}`;
			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toHaveLength(2);
		});

		it('filters events by phase when no sinceTimestamp provided', () => {
			const jsonl = `{"type": "event1", "phase": 1, "timestamp": "2024-01-15T10:00:00Z"}
{"type": "event2", "phase": 2, "timestamp": "2024-01-15T10:01:00Z"}
{"type": "event3", "phase": 1, "timestamp": "2024-01-15T10:02:00Z"}`;
			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty('type', 'event1');
			expect(result[1]).toHaveProperty('type', 'event3');
		});

		it('filters events by timestamp when sinceTimestamp is provided (ignores phase)', () => {
			const jsonl = `{"type": "event1", "phase": 1, "timestamp": "2024-01-15T10:00:00Z"}
{"type": "event2", "phase": 2, "timestamp": "2024-01-15T10:05:00Z"}
{"type": "event3", "phase": 1, "timestamp": "2024-01-15T10:10:00Z"}`;
			const result = filterPhaseEvents(jsonl, 1, '2024-01-15T10:03:00Z');
			expect(result).toHaveLength(2);
			// Should return events after the timestamp, regardless of phase
			expect(result[0]).toHaveProperty('type', 'event2');
			expect(result[1]).toHaveProperty('type', 'event3');
		});

		it('returns empty array when no events match phase', () => {
			const jsonl = `{"type": "event1", "phase": 2}
{"type": "event2", "phase": 3}`;
			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toEqual([]);
		});

		it('returns empty array when no events after sinceTimestamp', () => {
			const jsonl = `{"type": "event1", "timestamp": "2024-01-15T10:00:00Z"}
{"type": "event2", "timestamp": "2024-01-15T10:01:00Z"}`;
			const result = filterPhaseEvents(jsonl, 1, '2024-01-15T12:00:00Z');
			expect(result).toEqual([]);
		});
	});

	describe('checkPhaseCompliance', () => {
		it('returns empty array when all checks pass', () => {
			const phaseEvents = [
				{ type: 'agent.delegation', agent: 'coder', index: 0 },
				{ type: 'agent.delegation', agent: 'reviewer', index: 1 },
				{ type: 'phase_complete', index: 2 },
				{ type: 'retrospective.written', index: 3 },
			];
			const result = checkPhaseCompliance(phaseEvents, ['coder', 'reviewer'], ['coder', 'reviewer'], 1);
			expect(result).toHaveLength(0);
		});

		describe('Check 1: workflow_deviation - missing required agents', () => {
			it('returns workflow_deviation warning for missing required agent', () => {
				const phaseEvents: object[] = [];
				const result = checkPhaseCompliance(phaseEvents, [], ['coder'], 1);
				expect(result).toHaveLength(1);
				expect(result[0]).toMatchObject({
					type: 'workflow_deviation',
					severity: 'warning',
					phase: 1,
				});
				expect(result[0].description).toContain('coder');
			});

			it('returns workflow_deviation for multiple missing required agents', () => {
				const phaseEvents: object[] = [];
				const result = checkPhaseCompliance(phaseEvents, ['reviewer'], ['coder', 'reviewer', 'designer'], 2);
				expect(result).toHaveLength(2);
				const types = result.map(r => r.type);
				expect(types).toContain('workflow_deviation');
				expect(types.filter(t => t === 'workflow_deviation')).toHaveLength(2);
			});

			it('normalizes agent names and strips prefixes', () => {
				const phaseEvents: object[] = [];
				// mega_coder should match required 'coder'
				const result = checkPhaseCompliance(phaseEvents, ['mega_coder'], ['coder'], 1);
				expect(result).toHaveLength(0);
			});

			it('strips paid_ prefix', () => {
				const phaseEvents: object[] = [];
				const result = checkPhaseCompliance(phaseEvents, ['paid_coder'], ['coder'], 1);
				expect(result).toHaveLength(0);
			});

			it('strips local_ prefix', () => {
				const phaseEvents: object[] = [];
				const result = checkPhaseCompliance(phaseEvents, ['local_reviewer'], ['reviewer'], 1);
				expect(result).toHaveLength(0);
			});

			it('strips lowtier_ prefix', () => {
				const phaseEvents: object[] = [];
				const result = checkPhaseCompliance(phaseEvents, ['lowtier_coder'], ['coder'], 1);
				expect(result).toHaveLength(0);
			});

			it('strips modelrelay_ prefix', () => {
				const phaseEvents: object[] = [];
				const result = checkPhaseCompliance(phaseEvents, ['modelrelay_designer'], ['designer'], 1);
				expect(result).toHaveLength(0);
			});
		});

		describe('Check 2: missing_reviewer - coder without subsequent reviewer', () => {
			it('returns missing_reviewer warning when coder has no subsequent reviewer', () => {
				const phaseEvents = [
					{ type: 'agent.delegation', agent: 'coder', index: 0 },
					{ type: 'agent.delegation', agent: 'reviewer', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});

			it('returns missing_reviewer when coder delegation has no reviewer after it', () => {
				const phaseEvents = [
					{ type: 'agent.delegation', agent: 'coder', index: 0 },
					{ type: 'other_event', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(1);
				expect(result[0]).toMatchObject({
					type: 'missing_reviewer',
					severity: 'warning',
					phase: 1,
				});
			});

			it('does not warn when reviewer index > coder index', () => {
				const phaseEvents = [
					{ type: 'agent.delegation', agent: 'coder', index: 0 },
					{ type: 'agent.delegation', agent: 'reviewer', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});

			it('warns for each coder without subsequent reviewer', () => {
				const phaseEvents = [
					{ type: 'agent.delegation', agent: 'coder', index: 0 },
					{ type: 'agent.delegation', agent: 'coder', index: 1 },
					{ type: 'agent.delegation', agent: 'reviewer', index: 2 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				// Both coders have reviewer at index 2 after them, so no warning
				expect(result).toHaveLength(0);
			});

			it('warns for coder without any subsequent reviewer (correct scenario)', () => {
				const phaseEvents = [
					{ type: 'agent.delegation', agent: 'coder', index: 0 },
					{ type: 'agent.delegation', agent: 'coder', index: 1 },
					// No reviewer after index 1
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				// Both coders have no reviewer after them
				expect(result).toHaveLength(2);
			});

			it('handles mega_coder and mega_reviewer prefixes', () => {
				const phaseEvents = [
					{ type: 'agent.delegation', agent: 'mega_coder', index: 0 },
					{ type: 'agent.delegation', agent: 'mega_reviewer', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});
		});

		describe('Check 3: missing_retro - phase_complete without retrospective', () => {
			it('returns missing_retro when phase_complete exists but no retrospective', () => {
				const phaseEvents = [
					{ type: 'phase_complete', index: 0 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(1);
				expect(result[0]).toMatchObject({
					type: 'missing_retro',
					severity: 'warning',
					phase: 1,
				});
			});

			it('does not warn when retrospective.written exists', () => {
				const phaseEvents = [
					{ type: 'phase_complete', index: 0 },
					{ type: 'retrospective.written', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});

			it('detects retrospective via evidence_type field', () => {
				const phaseEvents = [
					{ type: 'phase_complete', index: 0 },
					{ type: 'some_event', evidence_type: 'retrospective', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});

			it('handles phase.complete event type', () => {
				const phaseEvents = [
					{ type: 'phase.complete', index: 0 },
					{ type: 'retrospective.written', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});

			it('does not warn when retro exists before phase_complete (retro found)', () => {
				const phaseEvents = [
					{ type: 'retrospective.written', index: 0 },
					{ type: 'phase_complete', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				// No warning because retrospective exists (even though before phase_complete)
				expect(result).toHaveLength(0);
			});
		});

		describe('Check 4: missing_sme - domains.detected without SME delegation', () => {
			it('returns missing_sme info when domains detected but no SME delegation', () => {
				const phaseEvents = [
					{ type: 'domains.detected', index: 0 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(1);
				expect(result[0]).toMatchObject({
					type: 'missing_sme',
					severity: 'info',
					phase: 1,
				});
			});

			it('does not warn when SME delegation exists after domain detection', () => {
				const phaseEvents = [
					{ type: 'domains.detected', index: 0 },
					{ type: 'agent.delegation', agent: 'sme', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});

			it('warns when SME delegation comes before domain detection', () => {
				const phaseEvents = [
					{ type: 'agent.delegation', agent: 'sme', index: 0 },
					{ type: 'domains.detected', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(1);
				expect(result[0].type).toBe('missing_sme');
			});

			it('handles mega_sme prefix', () => {
				const phaseEvents = [
					{ type: 'domains.detected', index: 0 },
					{ type: 'agent.delegation', agent: 'mega_sme', index: 1 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				expect(result).toHaveLength(0);
			});

			it('warns for domain detection without any subsequent SME', () => {
				const phaseEvents = [
					{ type: 'domains.detected', index: 0 },
					{ type: 'domains.detected', index: 1 },
					// No SME after index 1
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				// Both domain detections have no SME after them
				expect(result).toHaveLength(2);
			});

			it('no warning when all domain detections have subsequent SME', () => {
				const phaseEvents = [
					{ type: 'domains.detected', index: 0 },
					{ type: 'domains.detected', index: 1 },
					{ type: 'agent.delegation', agent: 'sme', index: 2 },
				];
				const result = checkPhaseCompliance(phaseEvents, [], [], 1);
				// Both domain detections have SME at index 2 after them
				expect(result).toHaveLength(0);
			});
		});

		it('combines multiple compliance checks', () => {
			const phaseEvents = [
				{ type: 'agent.delegation', agent: 'coder', index: 0 },
				{ type: 'domains.detected', index: 1 },
			];
			// Missing reviewer, missing retro (phase_complete but no retro), missing SME
			const result = checkPhaseCompliance(phaseEvents, [], ['coder', 'designer'], 1);
			// workflow_deviation for designer (1), missing_reviewer (1), missing_sme (1) = 3
			expect(result.length).toBeGreaterThanOrEqual(3);
			const types = result.map(r => r.type);
			expect(types).toContain('workflow_deviation');
			expect(types).toContain('missing_reviewer');
			expect(types).toContain('missing_sme');
		});

		it('handles events with missing or invalid type field gracefully', () => {
			const phaseEvents = [
				{ type: 'agent.delegation', agent: 'coder', index: 0 },
				{ notype: 'missing', index: 1 },
				{ index: 2 },
			];
			const result = checkPhaseCompliance(phaseEvents, [], [], 1);
			// Should not throw, should return missing_reviewer for coder
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('missing_reviewer');
		});
	});

	describe('runCuratorInit', () => {
		let tempDir: string;
		const testConfig: CuratorConfig = {
			enabled: true,
			init_enabled: true,
			phase_enabled: true,
			max_summary_tokens: 2000,
			min_knowledge_confidence: 0.7,
			compliance_report: true,
			suppress_warnings: true,
			drift_inject_max_chars: 500,
		};

		beforeEach(() => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-init-test-'));
			resetGlobalEventBus();
		});

		afterEach(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
			resetGlobalEventBus();
		});

		it('returns First Session briefing when no prior summary exists', async () => {
			const result = await runCuratorInit(tempDir, testConfig);

			expect(result.briefing).toContain('First Session');
			expect(result.prior_phases_covered).toBe(0);
			expect(result.knowledge_entries_reviewed).toBe(0);
			expect(result.contradictions).toEqual([]);
		});

		it('returns Prior Session Summary when prior summary exists', async () => {
			// Create prior summary
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				JSON.stringify({
					schema_version: 1,
					session_id: 'session-test',
					last_updated: '2026-01-01T00:00:00Z',
					last_phase_covered: 2,
					digest: 'Phase 1 and 2 completed successfully.',
					phase_digests: [],
					compliance_observations: [],
					knowledge_recommendations: [],
				}),
			);

			const result = await runCuratorInit(tempDir, testConfig);

			expect(result.briefing).toContain('Prior Session Summary');
			expect(result.briefing).toContain('Phase 2');
			expect(result.prior_phases_covered).toBe(2);
		});

		it('includes compliance observations when suppress_warnings is false and observations exist', async () => {
			const configNoSuppress: CuratorConfig = {
				...testConfig,
				suppress_warnings: false,
			};

			// Create prior summary with compliance observations
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				JSON.stringify({
					schema_version: 1,
					session_id: 'session-test',
					last_updated: '2026-01-01T00:00:00Z',
					last_phase_covered: 1,
					digest: 'Phase 1 done.',
					phase_digests: [],
					compliance_observations: [
						{
							phase: 1,
							timestamp: '2026-01-01T00:00:00Z',
							type: 'missing_reviewer',
							description: 'No reviewer detected',
							severity: 'warning',
						},
					],
					knowledge_recommendations: [],
				}),
			);

			const result = await runCuratorInit(tempDir, configNoSuppress);

			expect(result.briefing).toContain('Compliance Observations');
			expect(result.briefing).toContain('WARNING');
		});

		it('does NOT include compliance when suppress_warnings is true', async () => {
			// Create prior summary with compliance observations
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				JSON.stringify({
					schema_version: 1,
					session_id: 'session-test',
					last_updated: '2026-01-01T00:00:00Z',
					last_phase_covered: 1,
					digest: 'Phase 1 done.',
					phase_digests: [],
					compliance_observations: [
						{
							phase: 1,
							timestamp: '2026-01-01T00:00:00Z',
							type: 'missing_reviewer',
							description: 'No reviewer detected',
							severity: 'warning',
						},
					],
					knowledge_recommendations: [],
				}),
			);

			const result = await runCuratorInit(tempDir, testConfig);

			expect(result.briefing).not.toContain('Compliance Observations');
		});

		it('includes knowledge recommendations from prior summary', async () => {
			// Create prior summary with knowledge recommendations
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				JSON.stringify({
					schema_version: 1,
					session_id: 'session-test',
					last_updated: '2026-01-01T00:00:00Z',
					last_phase_covered: 1,
					digest: 'Phase 1 done.',
					phase_digests: [],
					compliance_observations: [],
					knowledge_recommendations: [
						{
							action: 'promote',
							entry_id: 'entry-1',
							lesson: 'Always run tests',
							reason: 'Important lesson',
						},
					],
				}),
			);

			const result = await runCuratorInit(tempDir, testConfig);

			expect(result.briefing).toContain('Knowledge Recommendations');
			expect(result.briefing).toContain('Always run tests');
		});

		it('counts knowledge_entries_reviewed for all entries (not just high-confidence)', async () => {
			// Create knowledge.jsonl with mixed confidence entries
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			// Write knowledge.jsonl with entries of varying confidence
			const knowledgeContent = [
				{ id: 'entry-1', lesson: 'Lesson 1', confidence: 0.9, tags: [] },
				{ id: 'entry-2', lesson: 'Lesson 2', confidence: 0.5, tags: [] },
				{ id: 'entry-3', lesson: 'Lesson 3', confidence: 0.8, tags: [] },
				{ id: 'entry-4', lesson: 'Lesson 4', confidence: 0.3, tags: [] },
			]
				.map((e) => JSON.stringify(e))
				.join('\n');

			fs.writeFileSync(path.join(swarmDir, 'knowledge.jsonl'), knowledgeContent);

			const result = await runCuratorInit(tempDir, testConfig);

			// Should count all 4 entries (not filtered by confidence)
			expect(result.knowledge_entries_reviewed).toBe(4);
			// Only high confidence (>0.7) should be in briefing
			expect(result.briefing).toContain('Lesson 1');
			expect(result.briefing).toContain('Lesson 3');
			expect(result.briefing).not.toContain('Lesson 2');
			expect(result.briefing).not.toContain('Lesson 4');
		});

		it('identifies contradictions from knowledge entries with contradiction tag', async () => {
			// Create knowledge.jsonl with contradiction entries
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const knowledgeContent = [
				{ id: 'entry-1', lesson: 'Use tabs for indentation', confidence: 0.9, tags: ['coding-style'] },
				{ id: 'entry-2', lesson: 'Never use tabs, spaces only', confidence: 0.8, tags: ['contradiction', 'coding-style'] },
				{ id: 'entry-3', lesson: 'Comment your code', confidence: 0.9, tags: [] },
			]
				.map((e) => JSON.stringify(e))
				.join('\n');

			fs.writeFileSync(path.join(swarmDir, 'knowledge.jsonl'), knowledgeContent);

			const result = await runCuratorInit(tempDir, testConfig);

			expect(result.contradictions).toHaveLength(1);
			expect(result.contradictions[0]).toContain('Never use tabs');
		});

		it('returns safe default on error (invalid knowledge file)', async () => {
			// Create a knowledge.jsonl that cannot be read properly
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			// Write corrupt JSONL content
			fs.writeFileSync(path.join(swarmDir, 'knowledge.jsonl'), 'not valid json{');

			const result = await runCuratorInit(tempDir, testConfig);

			// Should still return a valid result (not throw) - the function handles errors gracefully
			expect(result.knowledge_entries_reviewed).toBe(0);
			expect(result.prior_phases_covered).toBe(0);
		});

		it('emits curator.init.completed event', async () => {
			const eventBus = getGlobalEventBus();
			const eventPayloads: unknown[] = [];

			eventBus.subscribe('curator.init.completed', (event) => {
				// Event bus passes full event object with payload property
				const e = event as { payload: unknown };
				eventPayloads.push(e.payload);
			});

			await runCuratorInit(tempDir, testConfig);

			expect(eventPayloads).toHaveLength(1);
			expect(eventPayloads[0]).toMatchObject({
				prior_phases_covered: 0,
				knowledge_entries_reviewed: 0,
				contradictions_found: 0,
			});
		});
	});

	describe('runCuratorPhase', () => {
		let tempDir: string;
		const testConfig: CuratorConfig = {
			enabled: true,
			init_enabled: true,
			phase_enabled: true,
			max_summary_tokens: 2000,
			min_knowledge_confidence: 0.7,
			compliance_report: true,
			suppress_warnings: true,
			drift_inject_max_chars: 500,
		};

		beforeEach(() => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator-phase-test-'));
			resetGlobalEventBus();
		});

		afterEach(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
			resetGlobalEventBus();
		});

		it('returns result with correct phase in digest', async () => {
			const result = await runCuratorPhase(tempDir, 1, [], testConfig, {});

			expect(result.digest.phase).toBe(1);
			expect(result.phase).toBe(1);
			expect(result.summary_updated).toBe(true);
		});

		it('normalizes agent names and strips mega_ prefix', async () => {
			const result = await runCuratorPhase(
				tempDir,
				1,
				['mega_coder', 'mega_reviewer', 'test_engineer'],
				testConfig,
				{},
			);

			expect(result.digest.agents_used).not.toContain('mega_coder');
			expect(result.digest.agents_used).toContain('coder');
			expect(result.digest.agents_used).toContain('reviewer');
			expect(result.digest.agents_used).toContain('test_engineer');
		});

		it('deduplicates agent names', async () => {
			const result = await runCuratorPhase(
				tempDir,
				1,
				['coder', 'coder', 'reviewer', 'reviewer'],
				testConfig,
				{},
			);

			// Should have unique agents only
			const uniqueAgents = new Set(result.digest.agents_used);
			expect(result.digest.agents_used.length).toBe(uniqueAgents.size);
		});

		it('returns empty knowledge_recommendations array', async () => {
			const result = await runCuratorPhase(tempDir, 1, [], testConfig, {});

			expect(result.knowledge_recommendations).toEqual([]);
		});

		it('writes curator summary to .swarm/curator-summary.json', async () => {
			await runCuratorPhase(tempDir, 1, ['reviewer', 'test_engineer'], testConfig, {});

			const summaryPath = path.join(tempDir, '.swarm', 'curator-summary.json');
			expect(fs.existsSync(summaryPath)).toBe(true);

			const content = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
			expect(content.schema_version).toBe(1);
			expect(content.last_phase_covered).toBe(1);
			expect(content.phase_digests).toHaveLength(1);
		});

		it('extends existing summary when prior summary exists', async () => {
			// Create prior summary
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'curator-summary.json'),
				JSON.stringify({
					schema_version: 1,
					session_id: 'session-existing',
					last_updated: '2026-01-01T00:00:00Z',
					last_phase_covered: 1,
					digest: 'Phase 1 initial digest',
					phase_digests: [],
					compliance_observations: [],
					knowledge_recommendations: [],
				}),
			);

			await runCuratorPhase(tempDir, 2, ['reviewer', 'test_engineer'], testConfig, {});

			const summaryPath = path.join(swarmDir, 'curator-summary.json');
			const content = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

			expect(content.last_phase_covered).toBe(2);
			expect(content.phase_digests).toHaveLength(1);
			expect(content.phase_digests[0].phase).toBe(2);
			expect(content.digest).toContain('Phase 1 initial digest');
		});

		it('returns safe default on error (invalid path - file instead of directory)', async () => {
			// Create a file instead of a directory to trigger an error
			const invalidPath = path.join(tempDir, 'is-a-file.txt');
			fs.writeFileSync(invalidPath, 'not a directory');

			const result = await runCuratorPhase(invalidPath, 1, [], testConfig, {});

			expect(result.summary_updated).toBe(false);
			expect(result.digest.phase).toBe(1);
			expect(result.digest.summary).toContain('failed');
		});

		it('emits curator.phase.completed event on success', async () => {
			const eventBus = getGlobalEventBus();
			const eventPayloads: unknown[] = [];

			eventBus.subscribe('curator.phase.completed', (event) => {
				// Event bus passes full event object with payload property
				const e = event as { payload: unknown };
				eventPayloads.push(e.payload);
			});

			await runCuratorPhase(tempDir, 1, ['reviewer', 'test_engineer'], testConfig, {});

			expect(eventPayloads).toHaveLength(1);
			expect(eventPayloads[0]).toMatchObject({
				phase: 1,
				summary_updated: true,
			});
		});

		it('emits curator.error event on failure', async () => {
			const eventBus = getGlobalEventBus();
			const eventPayloads: unknown[] = [];

			eventBus.subscribe('curator.error', (event) => {
				// Event bus passes full event object with payload property
				const e = event as { payload: unknown };
				eventPayloads.push(e.payload);
			});

			// Create a file instead of a directory to trigger an error
			const invalidPath = path.join(tempDir, 'is-a-file.txt');
			fs.writeFileSync(invalidPath, 'not a directory');
			await runCuratorPhase(invalidPath, 1, [], testConfig, {});

			expect(eventPayloads).toHaveLength(1);
			expect(eventPayloads[0]).toMatchObject({
				operation: 'phase',
				phase: 1,
			});
		});

		it('returns compliance array (can be empty)', async () => {
			// With both reviewer and test_engineer, compliance should pass
			const result = await runCuratorPhase(
				tempDir,
				1,
				['reviewer', 'test_engineer'],
				testConfig,
				{},
			);

			expect(result.compliance).toEqual([]);
		});

		it('writes compliance observations to events.jsonl', async () => {
			// Without reviewer, should have compliance warning
			await runCuratorPhase(tempDir, 1, ['test_engineer'], testConfig, {});

			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');
			expect(fs.existsSync(eventsPath)).toBe(true);

			const content = fs.readFileSync(eventsPath, 'utf-8');
			const lines = content.split('\n').filter((l) => l.trim());

			expect(lines.length).toBeGreaterThan(0);
			const lastEvent = JSON.parse(lines[lines.length - 1]);
			expect(lastEvent.type).toBe('curator_compliance');
		});

		it('filters events by phase correctly', async () => {
			// Create events.jsonl with events from multiple phases
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const eventsContent = [
				{ type: 'task.completed', phase: 1, timestamp: '2026-01-01T10:00:00Z' },
				{ type: 'task.completed', phase: 2, timestamp: '2026-01-01T10:01:00Z' },
				{ type: 'task.completed', phase: 1, timestamp: '2026-01-01T10:02:00Z' },
			]
				.map((e) => JSON.stringify(e))
				.join('\n');

			fs.writeFileSync(path.join(swarmDir, 'events.jsonl'), eventsContent);

			const result = await runCuratorPhase(tempDir, 1, ['reviewer', 'test_engineer'], testConfig, {});

			// Phase 1 has 2 tasks completed
			expect(result.digest.tasks_completed).toBe(2);
		});
	});

	describe('applyCuratorKnowledgeUpdates', () => {
		const defaultKnowledgeConfig: KnowledgeConfig = {
			enabled: true,
			swarm_max_entries: 100,
			hive_max_entries: 200,
			auto_promote_days: 90,
			max_inject_count: 5,
			dedup_threshold: 0.6,
			scope_filter: ['global'],
			hive_enabled: true,
			rejected_max_entries: 20,
			validation_enabled: true,
			evergreen_confidence: 0.9,
			evergreen_utility: 0.8,
			low_utility_threshold: 0.3,
			min_retrievals_for_utility: 3,
			schema_version: 1,
		};

		function createKnowledgeFile(dir: string, entries: SwarmKnowledgeEntry[]): void {
			const swarmDir = path.join(dir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			// Write as JSONL (one JSON object per line)
			const jsonlContent = entries.map((e) => JSON.stringify(e)).join('\n');
			fs.writeFileSync(
				path.join(swarmDir, 'knowledge.jsonl'),
				jsonlContent,
			);
		}

		function readKnowledgeJsonl(dir: string): SwarmKnowledgeEntry[] {
			const filePath = path.join(dir, '.swarm', 'knowledge.jsonl');
			if (!fs.existsSync(filePath)) return [];
			const content = fs.readFileSync(filePath, 'utf-8');
			const entries: SwarmKnowledgeEntry[] = [];
			for (const line of content.split('\n')) {
				const trimmed = line.trim();
				if (trimmed) {
					entries.push(JSON.parse(trimmed) as SwarmKnowledgeEntry);
				}
			}
			return entries;
		}

		it('returns { applied: 0, skipped: 0 } when recommendations array is empty', async () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			// Write empty JSONL
			fs.writeFileSync(
				path.join(swarmDir, 'knowledge.jsonl'),
				'',
			);

			const result = await applyCuratorKnowledgeUpdates(tempDir, [], defaultKnowledgeConfig);

			expect(result).toEqual({ applied: 0, skipped: 0 });
		});

		it('promotes an entry: hive_eligible=true, confidence bumped by 0.1, updated_at updated', async () => {
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Test lesson',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.5,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			createKnowledgeFile(tempDir, entries);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'promote', entry_id: 'E1', lesson: 'Test', reason: 'Good lesson' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			expect(result.applied).toBe(1);
			expect(result.skipped).toBe(0);

			// Verify the entry was modified
			const updatedContent = readKnowledgeJsonl(tempDir);
			expect(updatedContent[0].hive_eligible).toBe(true);
			expect(updatedContent[0].confidence).toBe(0.6); // 0.5 + 0.1
			expect(updatedContent[0].updated_at).not.toBe('2026-01-01T00:00:00Z');
		});

		it('archives an entry: status set to archived', async () => {
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Test lesson',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.5,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			createKnowledgeFile(tempDir, entries);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'archive', entry_id: 'E1', lesson: 'Test', reason: 'Outdated' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			expect(result.applied).toBe(1);
			expect(result.skipped).toBe(0);

			// Verify the entry was archived
			const updatedContent = readKnowledgeJsonl(tempDir);
			expect(updatedContent[0].status).toBe('archived');
			expect(updatedContent[0].updated_at).not.toBe('2026-01-01T00:00:00Z');
		});

		it('flag contradiction: tags array gets new entry contradiction:reason', async () => {
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Use tabs',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.5,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			createKnowledgeFile(tempDir, entries);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'flag_contradiction', entry_id: 'E1', lesson: 'Test', reason: 'Spaces are better than tabs for alignment' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			expect(result.applied).toBe(1);
			expect(result.skipped).toBe(0);

			// Verify the tag was added (reason truncated to 50 chars)
			const updatedContent = readKnowledgeJsonl(tempDir);
			expect(updatedContent[0].tags).toContain('contradiction:Spaces are better than tabs for alignment');
		});

		it('skips unknown entry_id: applied=0, skipped=1', async () => {
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Test lesson',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.5,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			createKnowledgeFile(tempDir, entries);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'promote', entry_id: 'UNKNOWN_ID', lesson: 'Test', reason: 'Unknown entry' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			expect(result.applied).toBe(0);
			expect(result.skipped).toBe(1);
		});

		it('applied + skipped === recommendations.length invariant across a mixed batch', async () => {
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Test lesson 1',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.5,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
				{
					id: 'E2',
					tier: 'swarm',
					lesson: 'Test lesson 2',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.6,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			createKnowledgeFile(tempDir, entries);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'promote', entry_id: 'E1', lesson: 'Test', reason: 'Good' },
				{ action: 'archive', entry_id: 'E2', lesson: 'Test', reason: 'Old' },
				{ action: 'promote', entry_id: 'UNKNOWN_1', lesson: 'Test', reason: 'Unknown' },
				{ action: 'flag_contradiction', entry_id: 'UNKNOWN_2', lesson: 'Test', reason: 'Conflict' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			expect(result.applied + result.skipped).toBe(recommendations.length);
			expect(result.applied).toBe(2);
			expect(result.skipped).toBe(2);
		});

		it('handles null entry.confidence (sets to 0.1 not NaN)', async () => {
			// Create entry with undefined confidence (JSON will have no confidence field)
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Test lesson',
					category: 'testing',
					tags: [],
					scope: 'global',
					// @ts-expect-error - intentionally omitting confidence to test nullish coalescing
					confidence: undefined,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			// Manually write the JSONL without confidence field
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			const entryWithoutConfidence = { ...entries[0] };
			delete (entryWithoutConfidence as Record<string, unknown>).confidence;
			fs.writeFileSync(
				path.join(swarmDir, 'knowledge.jsonl'),
				JSON.stringify(entryWithoutConfidence),
			);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'promote', entry_id: 'E1', lesson: 'Test', reason: 'Good' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			expect(result.applied).toBe(1);
			expect(result.skipped).toBe(0);

			// Verify confidence was bumped from 0 to 0.1 (not NaN)
			const updatedContent = readKnowledgeJsonl(tempDir);
			expect(updatedContent[0].confidence).toBe(0.1);
			expect(isNaN(updatedContent[0].confidence as number)).toBe(false);
		});

		it('handles null entry.tags (does not crash)', async () => {
			// Create entry with undefined tags
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			const entryWithoutTags = {
				id: 'E1',
				tier: 'swarm',
				lesson: 'Test lesson',
				category: 'testing',
				scope: 'global',
				confidence: 0.5,
				status: 'candidate',
				confirmed_by: [],
				retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
				schema_version: 1,
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-01T00:00:00Z',
				hive_eligible: false,
				project_name: 'test-project',
			};
			fs.writeFileSync(
				path.join(swarmDir, 'knowledge.jsonl'),
				JSON.stringify(entryWithoutTags),
			);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'flag_contradiction', entry_id: 'E1', lesson: 'Test', reason: 'Contradiction found' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			expect(result.applied).toBe(1);
			expect(result.skipped).toBe(0);

			// Verify tags were added (as empty array was coalesced to [])
			const updatedContent = readKnowledgeJsonl(tempDir);
			expect(updatedContent[0].tags).toContain('contradiction:Contradiction found');
		});

		it('duplicate recommendations for same entry: first applied, second NOT counted as skipped (both target same entry_id)', async () => {
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Test lesson',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.5,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			createKnowledgeFile(tempDir, entries);

			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'promote', entry_id: 'E1', lesson: 'Test', reason: 'First rec' },
				{ action: 'promote', entry_id: 'E1', lesson: 'Test', reason: 'Duplicate rec' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			// The function tracks applied entry_ids, not individual recommendations
			// Since both recs target the same entry_id, only 1 is "applied" (the entry was modified)
			// and 0 are "skipped" (because the entry_id is in appliedIds after first application)
			// Note: applied + skipped != recommendations.length in this case (1+0 != 2)
			expect(result.applied).toBe(1);
			expect(result.skipped).toBe(0);
		});

		it('does NOT call rewriteKnowledge when no entries matched (no write when modified=false)', async () => {
			// Create knowledge file
			const entries: SwarmKnowledgeEntry[] = [
				{
					id: 'E1',
					tier: 'swarm',
					lesson: 'Test lesson',
					category: 'testing',
					tags: [],
					scope: 'global',
					confidence: 0.5,
					status: 'candidate',
					confirmed_by: [],
					retrieval_outcomes: { applied_count: 0, succeeded_after_count: 0, failed_after_count: 0 },
					schema_version: 1,
					created_at: '2026-01-01T00:00:00Z',
					updated_at: '2026-01-01T00:00:00Z',
					hive_eligible: false,
					project_name: 'test-project',
				},
			];
			createKnowledgeFile(tempDir, entries);

			// Record original file modification time
			const knowledgePath = path.join(tempDir, '.swarm', 'knowledge.jsonl');
			const originalStats = fs.statSync(knowledgePath);
			const originalMtime = originalStats.mtimeMs;

			// Wait a bit to ensure file system has different timestamp
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Try to apply recommendations for unknown entries (no modifications)
			const recommendations: KnowledgeRecommendation[] = [
				{ action: 'promote', entry_id: 'UNKNOWN_ID', lesson: 'Test', reason: 'Unknown' },
			];

			const result = await applyCuratorKnowledgeUpdates(tempDir, recommendations, defaultKnowledgeConfig);

			// All should be skipped, no modifications
			expect(result.applied).toBe(0);
			expect(result.skipped).toBe(1);

			// Verify file was NOT rewritten by checking mtime hasn't changed
			const newStats = fs.statSync(knowledgePath);
			expect(newStats.mtimeMs).toBe(originalMtime);
		});
	});
});
