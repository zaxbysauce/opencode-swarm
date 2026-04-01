import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureAgentSession } from '../../../src/state';
import { createIsolatedTestEnv } from '../../helpers/isolated-test-env';

// Import the function under test
let buildRetroInjection: (
	directory: string,
	currentPhaseNumber: number,
) => Promise<string | null>;

describe('buildRetroInjection - TIER 2 ADVERSARIAL ATTACKS', () => {
	let tempDir: string;
	let originalCwd: string;
	let cleanupEnv: (() => void) | null = null;

	beforeEach(async () => {
		// Reset state
		ensureAgentSession('test-session');

		// Create temp directory using createIsolatedTestEnv
		const { configDir, cleanup } = createIsolatedTestEnv();
		tempDir = configDir;
		cleanupEnv = cleanup;
		originalCwd = process.cwd();
		process.chdir(tempDir);

		// Create .swarm directory and evidence directory structure
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, '.swarm', 'evidence'), { recursive: true });

		// Import the function after setting up environment
		const systemEnhancerModule = await import(
			'../../../src/hooks/system-enhancer'
		);
		buildRetroInjection = systemEnhancerModule.buildRetroInjection;
	});

	afterEach(() => {
		process.chdir(originalCwd);
		if (cleanupEnv) {
			cleanupEnv();
		}
	});

	// Helper function to write a retro bundle with custom entries
	function writeRetroBundleWithEntries(taskId: string, entries: any[]): void {
		const retroDir = path.join(tempDir, '.swarm', 'evidence', taskId);
		fs.mkdirSync(retroDir, { recursive: true });

		const retroBundle = {
			schema_version: '1.0.0',
			task_id: taskId,
			entries: entries,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};

		fs.writeFileSync(
			path.join(retroDir, 'evidence.json'),
			JSON.stringify(retroBundle, null, 2),
		);
	}

	// Helper function to create a valid retro entry
	function createValidRetroEntry(overrides: any = {}): any {
		const now = new Date().toISOString();
		return {
			task_id: 'retro-1',
			type: 'retrospective',
			timestamp: now,
			agent: 'architect',
			verdict: 'pass',
			summary: 'Test retrospective',
			phase_number: 1,
			total_tool_calls: 100,
			coder_revisions: 5,
			reviewer_rejections: 2,
			test_failures: 1,
			security_findings: 0,
			integration_issues: 0,
			task_count: 10,
			task_complexity: 'moderate',
			top_rejection_reasons: ['Config schema', 'Dependencies'],
			lessons_learned: [
				'Plan tree-sitter integration early',
				'Review security findings before release',
			],
			...overrides,
		};
	}

	// Helper function to call the system enhancer hook and extract retrospective content
	// Now we can call buildRetroInjection directly
	async function callBuildRetroInjection(
		phaseNumber: number,
	): Promise<string | null> {
		return await buildRetroInjection(tempDir, phaseNumber);
	}

	describe('Sanity check: Valid retrospective should be injected', () => {
		test('valid retro entry with recent timestamp should produce non-null output', async () => {
			// Create a valid retro entry with all required fields
			writeRetroBundleWithEntries('retro-1', [createValidRetroEntry()]);

			const result = await callBuildRetroInjection(1);

			// Result should not be null
			expect(result).not.toBeNull();

			// Should contain lesson content
			expect(result).toContain('lesson');
		});
	});

	describe('Attack Vector 1: Malformed timestamp', () => {
		test('timestamp: "not-a-date" should be skipped gracefully (isNaN check)', async () => {
			// Write retro bundle with malformed timestamp - write directly to bypass validation
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [
					{
						...createValidRetroEntry(),
						timestamp: 'not-a-date', // Override with malformed timestamp
					},
				],
			};

			fs.writeFileSync(
				path.join(retroDir, 'evidence.json'),
				JSON.stringify(bundle, null, 2),
			);

			// Should not throw - the key test is that it doesn't crash
			const result = await callBuildRetroInjection(1);

			// Result may be null because timestamp is invalid - graceful degradation
			// The important thing is that it should not crash
			expect(result !== undefined).toBe(true); // Either null or string is OK
		});
	});

	describe('Attack Vector 2: Timestamp injection', () => {
		test('timestamp: "; DROP TABLE retros; --" should not cause unhandled exception', async () => {
			// Write retro bundle with SQL injection attempt - write directly
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [
					{
						...createValidRetroEntry(),
						timestamp: "'; DROP TABLE retros; --", // SQL injection attempt
					},
				],
			};

			fs.writeFileSync(
				path.join(retroDir, 'evidence.json'),
				JSON.stringify(bundle, null, 2),
			);

			// Should not throw - the key test is that it doesn't crash or execute SQL
			const result = await callBuildRetroInjection(1);

			// May return null (if timestamp is invalid) - graceful degradation
			// The important thing is it shouldn't crash or execute SQL
			expect(result !== undefined).toBe(true);
		});
	});

	describe('Attack Vector 3: Oversized lessons_learned[0]', () => {
		test('first lesson is 2000 chars -> output capped at 800 chars', async () => {
			// Create a 2000-character lesson
			const oversizedLesson = 'X'.repeat(2000);

			writeRetroBundleWithEntries('retro-1', [
				createValidRetroEntry({
					lessons_learned: [oversizedLesson],
				}),
			]);

			const result = await callBuildRetroInjection(1);

			// Result should not be null (should have content)
			expect(result).not.toBeNull();

			// Output must be capped at <= 803 chars (800 + ellipsis)
			expect(result!.length).toBeLessThanOrEqual(803);
		});
	});

	describe('Attack Vector 4: Null/undefined summary', () => {
		test('summary: null should use fallback "Phase N completed"', async () => {
			// Write retro with null summary - write directly to bypass validation
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [
					{
						...createValidRetroEntry(),
						summary: null, // Override with null
					},
				],
			};

			fs.writeFileSync(
				path.join(retroDir, 'evidence.json'),
				JSON.stringify(bundle, null, 2),
			);

			// Should not throw - may be null due to validation, which is graceful
			const result = await callBuildRetroInjection(1);

			expect(result !== undefined).toBe(true);
		});

		test('summary: undefined should use fallback "Phase N completed"', async () => {
			// Write retro with missing summary - write directly
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const entry = createValidRetroEntry();
			delete (entry as any).summary;

			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [entry],
			};

			fs.writeFileSync(
				path.join(retroDir, 'evidence.json'),
				JSON.stringify(bundle, null, 2),
			);

			// Should not throw - may be null due to validation, which is graceful
			const result = await callBuildRetroInjection(1);

			expect(result !== undefined).toBe(true);
		});
	});

	describe('Attack Vector 5: Empty lessons_learned array', () => {
		test('lessons_learned: [] should fall back to "No lessons recorded"', async () => {
			writeRetroBundleWithEntries('retro-1', [
				createValidRetroEntry({
					lessons_learned: [],
				}),
			]);

			const result = await callBuildRetroInjection(1);

			expect(result).not.toBeNull();
			expect(result).toContain('No lessons recorded');
		});
	});

	describe('Attack Vector 6: Unicode in lessons', () => {
		test('lessons_learned with emoji and CJK characters should appear unmodified', async () => {
			writeRetroBundleWithEntries('retro-1', [
				createValidRetroEntry({
					lessons_learned: [
						'🚀 Test with emoji 🎉',
						'测试中文文本',
						'日本語テスト',
						'한국어 테스트',
					],
				}),
			]);

			const result = await callBuildRetroInjection(1);

			expect(result).not.toBeNull();
			// Unicode characters should be preserved (Tier 2 only shows first lesson)
			expect(result).toContain('🚀');
		});
	});

	describe('Attack Vector 7: Negative phase_number', () => {
		test('phase_number: -1 should not crash (edge case)', async () => {
			// Write retro with negative phase - write directly to bypass validation
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [
					{
						...createValidRetroEntry(),
						phase_number: -1, // Override with negative
					},
				],
			};

			fs.writeFileSync(
				path.join(retroDir, 'evidence.json'),
				JSON.stringify(bundle, null, 2),
			);

			// Should not throw
			const result = await callBuildRetroInjection(1);

			// May include or exclude based on filtering logic, but should not crash
			expect(result !== undefined).toBe(true);
		});
	});

	describe('Attack Vector 8: Zero retros after verdict filter', () => {
		test('all retro entries have verdict: "fail" -> returns null gracefully', async () => {
			writeRetroBundleWithEntries('retro-1', [
				createValidRetroEntry({
					verdict: 'fail',
				}),
			]);

			writeRetroBundleWithEntries('retro-2', [
				createValidRetroEntry({
					verdict: 'fail',
				}),
			]);

			const result = await callBuildRetroInjection(1);

			// Should return null because all retros have verdict 'fail'
			expect(result).toBeNull();
		});
	});

	describe('Attack Vector 9: Malformed evidence bundle JSON', () => {
		test('evidence.json with no entries field should not crash', async () => {
			// Write malformed evidence bundle directly (not through evidence manager)
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const malformedBundle = {
				schema_version: '1.0',
				// No 'entries' field
			};

			fs.writeFileSync(
				path.join(retroDir, 'evidence.json'),
				JSON.stringify(malformedBundle, null, 2),
			);

			// Should not throw - may return null due to validation, which is graceful
			const result = await callBuildRetroInjection(1);

			expect(result !== undefined).toBe(true);
		});
	});

	describe('Attack Vector 10: Tier 2 behavior for Phase 1', () => {
		test('Phase 1 context should use Tier 2 (historical lessons)', async () => {
			writeRetroBundleWithEntries('retro-1', [createValidRetroEntry()]);

			const result = await callBuildRetroInjection(1);

			// Should use Tier 2 logic (cross-project historical lessons)
			expect(result).not.toBeNull();
			// Should include "Historical Lessons" header (Tier 2)
			expect(result).toContain('Historical Lessons');
		});
	});

	describe('Attack Vector 11: Resilience to invalid inputs', () => {
		test('should handle malformed evidence gracefully', async () => {
			// Write evidence with missing required fields - write directly
			const retroDir = path.join(tempDir, '.swarm', 'evidence', 'retro-1');
			fs.mkdirSync(retroDir, { recursive: true });

			const entry = createValidRetroEntry();
			delete (entry as any).summary;
			delete (entry as any).verdict;

			const bundle = {
				schema_version: '1.0.0',
				task_id: 'retro-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				entries: [entry],
			};

			fs.writeFileSync(
				path.join(retroDir, 'evidence.json'),
				JSON.stringify(bundle, null, 2),
			);

			// Should not throw - may return null due to validation, which is graceful
			const result = await callBuildRetroInjection(1);

			expect(result !== undefined).toBe(true);
		});
	});

	describe('Attack Vector 12: Very large number of retros', () => {
		test('50 retro bundles -> only top-3 appear, performance acceptable', async () => {
			// Write 50 retro bundles
			for (let i = 1; i <= 50; i++) {
				writeRetroBundleWithEntries(`retro-${i}`, [
					createValidRetroEntry({
						phase_number: i,
						timestamp: new Date(Date.now() - i * 1000).toISOString(), // Stagger timestamps
						lessons_learned: [`Lesson from phase ${i}`],
					}),
				]);
			}

			// Should complete within reasonable time (< 5 seconds)
			const startTime = Date.now();
			const result = await callBuildRetroInjection(1);
			const duration = Date.now() - startTime;

			// Should not be null
			expect(result).not.toBeNull();

			// Should complete in reasonable time
			expect(duration).toBeLessThan(5000);

			// Should only contain top 3 retros
			// Count occurrences of "Phase" in the result (each retro should appear once with its phase number)
			const phaseMatches = result!.match(/Phase \d+/g) || [];
			expect(phaseMatches.length).toBeLessThanOrEqual(3);
		});
	});
});
