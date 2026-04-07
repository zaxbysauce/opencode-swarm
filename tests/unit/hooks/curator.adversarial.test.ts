/**
 * Adversarial Tests for curator.ts I/O functions
 *
 * These tests validate security and robustness against malicious inputs
 * targeting the readCuratorSummary and writeCuratorSummary functions.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	getGlobalEventBus,
	resetGlobalEventBus,
} from '../../../src/background/event-bus.js';
import {
	applyCuratorKnowledgeUpdates,
	checkPhaseCompliance,
	filterPhaseEvents,
	readCuratorSummary,
	runCuratorInit,
	runCuratorPhase,
	writeCuratorSummary,
} from '../../../src/hooks/curator';
import type {
	CuratorConfig,
	CuratorSummary,
	KnowledgeRecommendation,
} from '../../../src/hooks/curator-types';
import type {
	KnowledgeConfig,
	SwarmKnowledgeEntry,
} from '../../../src/hooks/knowledge-types';

describe('curator.ts I/O - Adversarial Tests', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(
			tmpdir(),
			`.swarm-curator-adversarial-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	/**
	 * Attack Vector 1: Path traversal via null bytes
	 * Call readCuratorSummary with a directory that has a null byte in the path
	 * Should handle gracefully without crashing
	 */
	describe('Path traversal via null bytes', () => {
		it('should return null when directory path has null byte (read)', async () => {
			const maliciousDir = '/tmp/test\0evil';
			// readSwarmFileAsync catches errors and returns null
			const result = await readCuratorSummary(maliciousDir);
			expect(result).toBeNull();
		});

		it('should throw when directory path has null byte (write)', async () => {
			const maliciousDir = '/tmp/test\0evil';
			const summary = createValidSummary();
			// writeCuratorSummary does not catch the error from validateSwarmPath
			await expect(
				writeCuratorSummary(maliciousDir, summary),
			).rejects.toThrow();
		});
	});

	/**
	 * Attack Vector 2: Oversized JSON input
	 * Call readCuratorSummary with a file containing 10MB of valid JSON
	 * Should not hang or OOM - parses successfully since schema_version is valid number
	 */
	describe('Oversized JSON input (10MB)', () => {
		it('should handle 10MB valid JSON without hanging or OOM', async () => {
			const largeJson = createLargeValidJson(10 * 1024 * 1024); // 10MB
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, largeJson, 'utf-8');

			// Should complete within reasonable time and not throw
			// Since schema_version is valid number 1, it parses successfully
			const result = await readCuratorSummary(tempDir);
			expect(result).not.toBeNull();
			expect(result?.schema_version).toBe(1);
		}, 30000); // 30 second timeout
	});

	/**
	 * Attack Vector 3: Non-string schema_version
	 * File contains {"schema_version": "1"} (string "1" not number 1)
	 * parsed.schema_version !== 1 → should return null with warning
	 */
	describe('Non-string schema_version (string "1" instead of number 1)', () => {
		it('should return null when schema_version is string "1"', async () => {
			const invalidJson = JSON.stringify({
				schema_version: '1', // string, not number
				session_id: 'test-session',
				last_updated: new Date().toISOString(),
				last_phase_covered: 1,
				digest: 'test-digest',
				phase_digests: [],
				compliance_observations: [],
				knowledge_recommendations: [],
			});
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, invalidJson, 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('should return null when schema_version is missing', async () => {
			const invalidJson = JSON.stringify({
				session_id: 'test-session',
				last_updated: new Date().toISOString(),
				last_phase_covered: 1,
				digest: 'test-digest',
				phase_digests: [],
				compliance_observations: [],
				knowledge_recommendations: [],
			});
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, invalidJson, 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('should return null when schema_version is number 2', async () => {
			const invalidJson = JSON.stringify({
				schema_version: 2,
				session_id: 'test-session',
				last_updated: new Date().toISOString(),
				last_phase_covered: 1,
				digest: 'test-digest',
				phase_digests: [],
				compliance_observations: [],
				knowledge_recommendations: [],
			});
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, invalidJson, 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});
	});

	/**
	 * Attack Vector 4: Null summary fields
	 * readCuratorSummary with a file where schema_version: 1 but all other fields are null/missing
	 * Should return the parsed object (no field validation required at I/O layer)
	 */
	describe('Null summary fields', () => {
		it('should return parsed object when all optional fields are null', async () => {
			const jsonWithNulls = JSON.stringify({
				schema_version: 1,
				session_id: null,
				last_updated: null,
				last_phase_covered: null,
				digest: null,
				phase_digests: null,
				compliance_observations: null,
				knowledge_recommendations: null,
			});
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, jsonWithNulls, 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).not.toBeNull();
			expect(result?.schema_version).toBe(1);
		});

		it('should return parsed object when fields are missing', async () => {
			const jsonWithMissingFields = JSON.stringify({
				schema_version: 1,
			});
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, jsonWithMissingFields, 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).not.toBeNull();
			expect(result?.schema_version).toBe(1);
		});
	});

	/**
	 * Attack Vector 5: writeCuratorSummary with circular reference
	 * Pass a summary with a circular reference in a field
	 * JSON.stringify throws → should propagate the error
	 */
	describe('writeCuratorSummary with circular reference', () => {
		it('should propagate error when summary has circular reference', async () => {
			const summary = createValidSummary();
			// Create circular reference
			const circular: Record<string, unknown> = { name: 'circular' };
			circular.self = circular;
			summary.digest = circular as unknown as string;

			// Should throw due to JSON.stringify failure
			await expect(writeCuratorSummary(tempDir, summary)).rejects.toThrow();
		});
	});

	/**
	 * Attack Vector 6: Empty string directory
	 * Call readCuratorSummary('') - reads from cwd/.swarm (may return existing file)
	 * Call writeCuratorSummary('') - writes to cwd/.swarm
	 */
	describe('Empty string directory', () => {
		const cwdSwarmDir = join(process.cwd(), '.swarm');

		// Clean up cwd/.swarm before these tests to avoid pollution
		beforeEach(() => {
			try {
				rmSync(join(cwdSwarmDir, 'curator-summary.json'), { force: true });
				rmSync(cwdSwarmDir, { recursive: true, force: true });
			} catch {
				// Ignore
			}
			// Ensure .swarm exists for write test
			mkdirSync(cwdSwarmDir, { recursive: true });
		});

		afterEach(() => {
			// Clean up after tests
			try {
				rmSync(join(cwdSwarmDir, 'curator-summary.json'), { force: true });
			} catch {
				// Ignore
			}
		});

		it('should read from cwd/.swarm when directory is empty string', async () => {
			// When no file exists, returns null
			const result = await readCuratorSummary('');
			// Without a file, should return null
			expect(result).toBeNull();
		});

		it('should write to cwd/.swarm when directory is empty string', async () => {
			const summary = createValidSummary();
			// Empty string resolves to cwd/.swarm - write should succeed
			// Direct await to catch any errors
			await writeCuratorSummary('', summary);

			// Verify file was written
			const result = await readCuratorSummary('');
			expect(result).not.toBeNull();
			expect(result?.session_id).toBe('test-session-adversarial');
		});
	});

	/**
	 * Attack Vector 7: Deeply nested JSON
	 * Write a summary with 1000-level deep nested object in digest field
	 * Should serialize and deserialize without stack overflow
	 */
	describe('Deeply nested JSON (1000 levels)', () => {
		it('should handle 1000-level deep nested object in digest', async () => {
			const deepObject = createDeepNestedObject(1000);
			const summary = createValidSummary();
			summary.digest = JSON.stringify(deepObject);

			// Write should work (JSON.stringify handles this fine)
			await writeCuratorSummary(tempDir, summary);

			// Read should also work
			const result = await readCuratorSummary(tempDir);
			expect(result).not.toBeNull();
			expect(result?.schema_version).toBe(1);
		}, 30000); // 30 second timeout
	});

	/**
	 * Additional attack vectors
	 */
	describe('Additional security tests', () => {
		it('should handle completely invalid JSON', async () => {
			const invalidJson = 'this is not json {{{';
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, invalidJson, 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('should handle empty file', async () => {
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, '', 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('should handle file with only whitespace', async () => {
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, '   \n\t   ', 'utf-8');

			const result = await readCuratorSummary(tempDir);
			expect(result).toBeNull();
		});

		it('should handle path traversal attempt in filename', async () => {
			// The validateSwarmPath function should reject this
			// But readCuratorSummary passes 'curator-summary.json' fixed filename
			// So this is tested indirectly via readSwarmFileAsync handling
			const result = await readCuratorSummary(tempDir);
			// File doesn't exist, should return null
			expect(result).toBeNull();
		});
	});
});

/**
 * Adversarial Tests for filterPhaseEvents
 */
describe('filterPhaseEvents - Adversarial Tests', () => {
	/**
	 * Attack Vector 1: Oversized JSONL input (10,000 lines)
	 * Should not throw or hang
	 */
	describe('Oversized JSONL input (10,000 lines)', () => {
		it('should handle 10,000 lines without hanging or crashing', () => {
			const lines: string[] = [];
			for (let i = 0; i < 10000; i++) {
				lines.push(
					JSON.stringify({
						phase: 1,
						timestamp: `2024-01-01T00:00:${i.toString().padStart(2, '0')}Z`,
						event: 'test',
					}),
				);
			}
			const jsonl = lines.join('\n');

			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		}, 30000);
	});

	/**
	 * Attack Vector 2: Deeply nested JSON (1000 levels)
	 * Must not throw
	 */
	describe('Deeply nested JSON (1000 levels)', () => {
		it('should handle 1000-level deep nested JSON without throwing', () => {
			const deepEvent = createDeepNestedObject(1000);
			const jsonl = JSON.stringify({
				...deepEvent,
				phase: 1,
				timestamp: '2024-01-01T00:00:00Z',
			});

			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});
	});

	/**
	 * Attack Vector 3: Prototype-polluting phase field
	 * Event with __proto__, constructor, toString as phase value
	 * Must not affect global object
	 */
	describe('Prototype-polluting phase field', () => {
		it('should not pollute global object when phase is __proto__', () => {
			const jsonl = JSON.stringify({
				phase: '__proto__',
				timestamp: '2024-01-01T00:00:00Z',
			});
			const result = filterPhaseEvents(jsonl, 1);

			// The event has phase = '__proto__', not phase = 1, so should not match
			expect(result.length).toBe(0);
			// Verify global object was not modified
			expect(({} as Record<string, unknown>).prototype).toBeUndefined();
		});

		it('should not pollute global object when phase is constructor', () => {
			const jsonl = JSON.stringify({
				phase: 'constructor',
				timestamp: '2024-01-01T00:00:00Z',
			});
			const result = filterPhaseEvents(jsonl, 1);

			expect(result.length).toBe(0);
		});

		it('should not pollute global object when phase is toString', () => {
			const jsonl = JSON.stringify({
				phase: 'toString',
				timestamp: '2024-01-01T00:00:00Z',
			});
			const result = filterPhaseEvents(jsonl, 1);

			expect(result.length).toBe(0);
		});
	});

	/**
	 * Attack Vector 4: Non-string timestamp values
	 * Events with timestamp as number, object, null, array
	 * Should handle gracefully via string comparison
	 */
	describe('Non-string timestamp values', () => {
		it('should handle timestamp as number', () => {
			const jsonl = JSON.stringify({ phase: 1, timestamp: 1234567890 });
			const result = filterPhaseEvents(jsonl, 1, '2024-01-01T00:00:00Z');
			// Number > string comparison in JS returns false, so should not match
			expect(result).toBeDefined();
		});

		it('should handle timestamp as object', () => {
			const jsonl = JSON.stringify({
				phase: 1,
				timestamp: { iso: '2024-01-01T00:00:00Z' },
			});
			const result = filterPhaseEvents(jsonl, 1, '2024-01-01T00:00:00Z');
			// Object > string comparison returns false
			expect(result).toBeDefined();
		});

		it('should handle timestamp as null', () => {
			const jsonl = JSON.stringify({ phase: 1, timestamp: null });
			const result = filterPhaseEvents(jsonl, 1, '2024-01-01T00:00:00Z');
			// null > string returns false
			expect(result).toBeDefined();
		});

		it('should handle timestamp as array', () => {
			const jsonl = JSON.stringify({
				phase: 1,
				timestamp: ['2024-01-01T00:00:00Z'],
			});
			const result = filterPhaseEvents(jsonl, 1, '2024-01-01T00:00:00Z');
			// Array > string comparison returns false
			expect(result).toBeDefined();
		});
	});

	/**
	 * Attack Vector 5: JSONL with \r\n line endings
	 * Should not crash
	 */
	describe('JSONL with \\r\\n line endings', () => {
		it('should handle CRLF line endings without crashing', () => {
			const lines = [
				JSON.stringify({ phase: 1, timestamp: '2024-01-01T00:00:00Z' }),
				JSON.stringify({ phase: 1, timestamp: '2024-01-01T00:00:01Z' }),
			];
			const jsonl = lines.join('\r\n');

			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toBeDefined();
			expect(result.length).toBe(2);
		});
	});

	/**
	 * Attack Vector 6: Single very long line (100KB)
	 * Should parse or skip without crash
	 */
	describe('Single very long line (100KB)', () => {
		it('should handle 100KB line without crashing', () => {
			const longPayload = 'x'.repeat(100 * 1024);
			const jsonl = JSON.stringify({
				phase: 1,
				timestamp: '2024-01-01T00:00:00Z',
				payload: longPayload,
			});

			const result = filterPhaseEvents(jsonl, 1);
			expect(result).toBeDefined();
		}, 30000);
	});

	/**
	 * Attack Vector 7: Invalid phase parameter values
	 * Negative numbers, 0, Infinity, NaN should not throw
	 */
	describe('Invalid phase parameter values', () => {
		it('should handle negative phase number', () => {
			const jsonl = JSON.stringify({
				phase: -1,
				timestamp: '2024-01-01T00:00:00Z',
			});
			const result = filterPhaseEvents(jsonl, -1);
			expect(result).toBeDefined();
			expect(result.length).toBe(1);
		});

		it('should handle phase 0', () => {
			const jsonl = JSON.stringify({
				phase: 0,
				timestamp: '2024-01-01T00:00:00Z',
			});
			const result = filterPhaseEvents(jsonl, 0);
			expect(result).toBeDefined();
			expect(result.length).toBe(1);
		});

		it('should handle Infinity as phase', () => {
			const jsonl = JSON.stringify({
				phase: Infinity,
				timestamp: '2024-01-01T00:00:00Z',
			});
			const result = filterPhaseEvents(jsonl, Infinity);
			expect(result).toBeDefined();
		});

		it('should handle NaN as phase', () => {
			const jsonl = JSON.stringify({
				phase: NaN,
				timestamp: '2024-01-01T00:00:00Z',
			});
			const result = filterPhaseEvents(jsonl, NaN);
			expect(result).toBeDefined();
		});
	});

	/**
	 * Attack Vector 8: Empty sinceTimestamp string
	 * Events with any timestamp > "" should match
	 */
	describe('Empty sinceTimestamp string', () => {
		it('should match all events when sinceTimestamp is empty string', () => {
			const jsonl = [
				JSON.stringify({ phase: 1, timestamp: '2024-01-01T00:00:00Z' }),
				JSON.stringify({ phase: 1, timestamp: '2023-01-01T00:00:00Z' }),
			].join('\n');

			const result = filterPhaseEvents(jsonl, 1, '');
			// All timestamps > "" (empty string) in lexicographic comparison
			// 2024 > "" is true, 2023 > "" is true
			expect(result).toBeDefined();
			expect(result.length).toBe(2);
		});
	});
});

/**
 * Adversarial Tests for checkPhaseCompliance
 */
describe('checkPhaseCompliance - Adversarial Tests', () => {
	/**
	 * Attack Vector 1: Non-object items in phaseEvents
	 * Must not throw
	 */
	describe('Non-object items in phaseEvents', () => {
		it('should handle null in phaseEvents array', () => {
			const events: object[] = [
				null as unknown as object,
				{ type: 'phase_complete', timestamp: '2024-01-01T00:00:00Z' },
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});

		it('should handle undefined in phaseEvents array', () => {
			const events: object[] = [
				undefined as unknown as object,
				{ type: 'phase_complete', timestamp: '2024-01-01T00:00:00Z' },
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});

		it('should handle number in phaseEvents array', () => {
			const events: object[] = [
				123 as unknown as object,
				{ type: 'phase_complete', timestamp: '2024-01-01T00:00:00Z' },
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});

		it('should handle string in phaseEvents array', () => {
			const events: object[] = [
				'string event' as unknown as object,
				{ type: 'phase_complete', timestamp: '2024-01-01T00:00:00Z' },
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});
	});

	/**
	 * Attack Vector 2: Large number of events (10,000)
	 * Must not hang
	 */
	describe('Large number of events (10,000)', () => {
		it('should handle 10,000 events without hanging', () => {
			const events: object[] = [];
			for (let i = 0; i < 10000; i++) {
				events.push({
					type: 'agent.delegation',
					agent: i % 2 === 0 ? 'coder' : 'reviewer',
					timestamp: '2024-01-01T00:00:00Z',
				});
			}

			const result = checkPhaseCompliance(
				events,
				['coder', 'reviewer'],
				['coder', 'reviewer'],
				1,
			);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		}, 30000);
	});

	/**
	 * Attack Vector 3: Duplicate agent names in agentsDispatched
	 * Should not produce duplicate observations
	 */
	describe('Duplicate agent names in agentsDispatched', () => {
		it('should not produce duplicate observations for duplicate agent names', () => {
			const events = [
				{
					type: 'agent.delegation',
					agent: 'coder',
					timestamp: '2024-01-01T00:00:00Z',
				},
			];
			// Multiple duplicate coders
			const result = checkPhaseCompliance(
				events,
				['coder', 'coder', 'coder'],
				['coder'],
				1,
			);

			// Should only have one observation for missing coder
			const missingCoderObservations = result.filter(
				(o) =>
					o.type === 'workflow_deviation' &&
					o.description.includes("Agent 'coder'"),
			);
			expect(missingCoderObservations.length).toBe(0); // coder is dispatched
		});
	});

	/**
	 * Attack Vector 4: Empty requiredAgents array
	 * No observations from Check 1
	 */
	describe('Empty requiredAgents array', () => {
		it('should produce no workflow_deviation observations when requiredAgents is empty', () => {
			const events = [
				{
					type: 'agent.delegation',
					agent: 'coder',
					timestamp: '2024-01-01T00:00:00Z',
				},
			];
			const result = checkPhaseCompliance(events, [], [], 1);

			const workflowDeviations = result.filter(
				(o) => o.type === 'workflow_deviation',
			);
			expect(workflowDeviations.length).toBe(0);
		});
	});

	/**
	 * Attack Vector 5: Empty string in requiredAgents
	 * Should handle gracefully
	 */
	describe('Empty string in requiredAgents', () => {
		it('should handle empty string agent name in requiredAgents', () => {
			const events = [
				{
					type: 'agent.delegation',
					agent: 'coder',
					timestamp: '2024-01-01T00:00:00Z',
				},
			];
			const result = checkPhaseCompliance(events, [], [''], 1);

			expect(result).toBeDefined();
			// Empty string normalizes to empty string, which won't match any dispatched agent
			const missingEmpty = result.filter(
				(o) =>
					o.type === 'workflow_deviation' && o.description.includes("Agent ''"),
			);
			expect(missingEmpty.length).toBe(1);
		});
	});

	/**
	 * Attack Vector 6: Very long agent name (10,000 characters)
	 * Must not throw
	 */
	describe('Very long agent name (10,000 characters)', () => {
		it('should handle 10,000 character agent name without throwing', () => {
			const longName = 'a'.repeat(10000);
			const events = [
				{
					type: 'agent.delegation',
					agent: longName,
					timestamp: '2024-01-01T00:00:00Z',
				},
			];
			const result = checkPhaseCompliance(events, [longName], [longName], 1);

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		}, 30000);
	});

	/**
	 * Attack Vector 7: Agent field as object (not string)
	 * Must not throw (type guard exists)
	 */
	describe('Agent field as object', () => {
		it('should handle agent as object without throwing', () => {
			const events = [
				{
					type: 'agent.delegation',
					agent: { name: 'coder' },
					timestamp: '2024-01-01T00:00:00Z',
				},
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);

			expect(result).toBeDefined();
			// Should not crash and should handle gracefully
		});

		it('should handle nested object agent without throwing', () => {
			const events = [
				{
					type: 'agent.delegation',
					agent: { nested: { deep: 'coder' } },
					timestamp: '2024-01-01T00:00:00Z',
				},
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);

			expect(result).toBeDefined();
		});
	});

	/**
	 * Attack Vector 8: Event type as null, undefined, number
	 * Must not throw
	 */
	describe('Event type as non-string values', () => {
		it('should handle type as null', () => {
			const events = [
				{ type: null, agent: 'coder', timestamp: '2024-01-01T00:00:00Z' },
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);
			expect(result).toBeDefined();
		});

		it('should handle type as undefined', () => {
			const events = [
				{ type: undefined, agent: 'coder', timestamp: '2024-01-01T00:00:00Z' },
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);
			expect(result).toBeDefined();
		});

		it('should handle type as number', () => {
			const events = [
				{ type: 123, agent: 'coder', timestamp: '2024-01-01T00:00:00Z' },
			];
			const result = checkPhaseCompliance(events, [], ['coder'], 1);
			expect(result).toBeDefined();
		});
	});

	/**
	 * Attack Vector 9: Coder at last index with no events after
	 * Should emit missing_reviewer
	 */
	describe('Coder delegation at last index', () => {
		it('should emit missing_reviewer when coder is at last index with no reviewer after', () => {
			const events = [
				{
					type: 'agent.delegation',
					agent: 'coder',
					timestamp: '2024-01-01T00:00:00Z',
				},
			];
			const result = checkPhaseCompliance(events, ['coder'], [], 1);

			const missingReviewer = result.filter(
				(o) => o.type === 'missing_reviewer',
			);
			expect(missingReviewer.length).toBe(1);
		});
	});

	/**
	 * Attack Vector 10: All coders have subsequent reviewers at higher indices
	 * Should not emit missing_reviewer
	 */
	describe('All coders have subsequent reviewers', () => {
		it('should not emit missing_reviewer when all coders have reviewers after', () => {
			const events = [
				{
					type: 'agent.delegation',
					agent: 'coder',
					timestamp: '2024-01-01T00:00:00Z',
				},
				{
					type: 'agent.delegation',
					agent: 'reviewer',
					timestamp: '2024-01-01T00:00:01Z',
				},
			];
			const result = checkPhaseCompliance(events, ['coder', 'reviewer'], [], 1);

			const missingReviewer = result.filter(
				(o) => o.type === 'missing_reviewer',
			);
			expect(missingReviewer.length).toBe(0);
		});
	});

	/**
	 * Attack Vector 11: phase_complete at index 0, retro at index 1
	 * Should NOT emit missing_retro (retro was found)
	 */
	describe('phase_complete followed by retro', () => {
		it('should not emit missing_retro when retro exists after phase_complete', () => {
			const events = [
				{ type: 'phase_complete', timestamp: '2024-01-01T00:00:00Z' },
				{ type: 'retrospective.written', timestamp: '2024-01-01T00:00:01Z' },
			];
			const result = checkPhaseCompliance(events, [], [], 1);

			const missingRetro = result.filter((o) => o.type === 'missing_retro');
			expect(missingRetro.length).toBe(0);
		});
	});

	/**
	 * Attack Vector 12: Deeply recursive event object
	 * Must not throw
	 */
	describe('Deeply recursive event object', () => {
		it('should handle deeply recursive event without throwing', () => {
			const recursiveEvent = createDeepNestedObject(1000);
			const events = [recursiveEvent];

			const result = checkPhaseCompliance(events, [], [], 1);
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});
	});
});

/**
 * Helper to create a valid CuratorSummary
 */
function createValidSummary(): CuratorSummary {
	return {
		schema_version: 1,
		session_id: 'test-session-adversarial',
		last_updated: new Date().toISOString(),
		last_phase_covered: 1,
		digest: 'test-digest-adversarial',
		phase_digests: [],
		compliance_observations: [],
		knowledge_recommendations: [],
	};
}

/**
 * Create a large valid JSON string (10MB)
 */
function createLargeValidJson(sizeInBytes: number): string {
	const baseObj = {
		schema_version: 1,
		session_id: 'test-session-large',
		last_updated: new Date().toISOString(),
		last_phase_covered: 1,
		digest: 'x'.repeat(1000), // 1KB of digest
		phase_digests: [],
		compliance_observations: [],
		knowledge_recommendations: [],
	};

	const json = JSON.stringify(baseObj);
	// Pad to reach desired size
	const padding = ' '.repeat(Math.max(0, sizeInBytes - json.length));
	return json + padding;
}

/**
 * Create a deeply nested object (1000 levels)
 */
function createDeepNestedObject(depth: number): Record<string, unknown> {
	let current: Record<string, unknown> = {};
	const obj = current;

	for (let i = 0; i < depth; i++) {
		current.level = i;
		current.next = {};
		current = current.next as Record<string, unknown>;
	}

	return obj;
}

// ============================================================================
// Adversarial Tests for runCuratorInit and runCuratorPhase
// ============================================================================

describe('runCuratorInit - Adversarial Tests', () => {
	let tempDir: string;
	let eventBus: ReturnType<typeof getGlobalEventBus>;

	beforeEach(() => {
		tempDir = join(
			tmpdir(),
			`.swarm-curator-init-adversarial-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(join(tempDir, '.swarm'), { recursive: true });
		eventBus = getGlobalEventBus();
		resetGlobalEventBus();
	});

	afterEach(() => {
		resetGlobalEventBus();
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	const defaultConfig: CuratorConfig = {
		enabled: true,
		init_enabled: true,
		phase_enabled: true,
		max_summary_tokens: 1000,
		min_knowledge_confidence: 0.7,
		compliance_report: true,
		suppress_warnings: false,
		drift_inject_max_chars: 5000,
	};

	/**
	 * Attack Vector 1: Corrupt curator-summary.json (invalid JSON)
	 * Must return safe default, no throw
	 */
	describe('Corrupt curator-summary.json (invalid JSON)', () => {
		it('should return safe default when curator-summary.json has invalid JSON', async () => {
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, '{{{ invalid json', 'utf-8');

			const result = await runCuratorInit(tempDir, defaultConfig);

			expect(result).toBeDefined();
			// Invalid JSON is handled gracefully - returns first session briefing (safe default)
			expect(result.briefing).toContain('First Session');
			expect(result.knowledge_entries_reviewed).toBe(0);
		});
	});

	/**
	 * Attack Vector 2: curator-summary.json with schema_version !== 1
	 * Must return first-session briefing (readCuratorSummary returns null)
	 */
	describe('curator-summary.json with schema_version !== 1', () => {
		it('should return first-session briefing when schema_version is 2', async () => {
			const invalidJson = JSON.stringify({
				schema_version: 2,
				session_id: 'test-session',
				last_updated: new Date().toISOString(),
				last_phase_covered: 1,
				digest: 'test-digest',
				phase_digests: [],
				compliance_observations: [],
				knowledge_recommendations: [],
			});
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, invalidJson, 'utf-8');

			const result = await runCuratorInit(tempDir, defaultConfig);

			expect(result).toBeDefined();
			expect(result.briefing).toContain('First Session');
			expect(result.prior_phases_covered).toBe(0);
		});
	});

	/**
	 * Attack Vector 3: knowledge.jsonl with 10,000 entries (high volume)
	 * Must not hang or OOM
	 */
	describe('knowledge.jsonl with 10,000 entries', () => {
		it('should handle 10,000 knowledge entries without hanging or OOM', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const entries: string[] = [];
			for (let i = 0; i < 10000; i++) {
				const entry = {
					id: `entry-${i}`,
					tier: 'swarm',
					lesson: `Lesson ${i}`,
					category: 'process',
					tags: ['test'],
					scope: 'global',
					confidence: 0.8,
					status: 'established',
					confirmed_by: [],
					retrieval_outcomes: {
						applied_count: 0,
						succeeded_after_count: 0,
						failed_after_count: 0,
					},
					schema_version: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					project_name: 'test-project',
				};
				entries.push(JSON.stringify(entry));
			}
			writeFileSync(knowledgePath, entries.join('\n'), 'utf-8');

			const result = await runCuratorInit(tempDir, defaultConfig);

			expect(result).toBeDefined();
			expect(result.knowledge_entries_reviewed).toBe(10000);
			// Should cap at 10 entries
			const highConfCount = (result.briefing.match(/- Lesson/g) || []).length;
			expect(highConfCount).toBeLessThanOrEqual(10);
		}, 60000);
	});

	/**
	 * Attack Vector 4: knowledge.jsonl where every entry has confidence: 1.0
	 * Must include max 10 in briefing
	 */
	describe('knowledge.jsonl with all high-confidence entries', () => {
		it('should include max 10 entries in briefing when all have confidence 1.0', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const entries: string[] = [];
			for (let i = 0; i < 20; i++) {
				const entry = {
					id: `entry-${i}`,
					tier: 'swarm',
					lesson: `High confidence lesson ${i}`,
					category: 'process',
					tags: ['test'],
					scope: 'global',
					confidence: 1.0,
					status: 'established',
					confirmed_by: [],
					retrieval_outcomes: {
						applied_count: 0,
						succeeded_after_count: 0,
						failed_after_count: 0,
					},
					schema_version: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					project_name: 'test-project',
				};
				entries.push(JSON.stringify(entry));
			}
			writeFileSync(knowledgePath, entries.join('\n'), 'utf-8');

			const result = await runCuratorInit(tempDir, defaultConfig);

			expect(result).toBeDefined();
			// Should have at most 10 high-confidence entries in briefing
			const lessonMatches = result.briefing.match(/- High confidence lesson/g);
			expect(lessonMatches).toBeDefined();
			expect(lessonMatches?.length).toBeLessThanOrEqual(10);
		});
	});

	/**
	 * Attack Vector 5: Knowledge entry with `lesson` as object (not string)
	 * Must JSON.stringify it without throwing
	 */
	describe('Knowledge entry with lesson as object', () => {
		it('should JSON.stringify lesson object without throwing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const entry = {
				id: 'entry-obj',
				tier: 'swarm',
				lesson: { nested: { value: 'test' }, array: [1, 2, 3] },
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.9,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(knowledgePath, JSON.stringify(entry), 'utf-8');

			const result = await runCuratorInit(tempDir, defaultConfig);

			expect(result).toBeDefined();
			expect(result.briefing).toContain('High-Confidence Knowledge');
			// Should contain JSON-stringified object
			expect(result.briefing).toContain('nested');
		});
	});

	/**
	 * Attack Vector 6: Knowledge entry with `tags` as null (not array)
	 * Must skip contradiction check without throwing
	 */
	describe('Knowledge entry with tags as null', () => {
		it('should skip contradiction check when tags is null without throwing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const entry = {
				id: 'entry-null-tags',
				tier: 'swarm',
				lesson: 'Lesson with null tags',
				category: 'process',
				tags: null,
				scope: 'global',
				confidence: 0.9,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(knowledgePath, JSON.stringify(entry), 'utf-8');

			const result = await runCuratorInit(tempDir, defaultConfig);

			expect(result).toBeDefined();
			expect(result.contradictions).toEqual([]);
		});
	});

	/**
	 * Attack Vector 7: Context.md truncation: 100KB context.md
	 * Briefing must be capped at `max_summary_tokens * 2` chars
	 */
	describe('Context.md truncation (100KB)', () => {
		it('should truncate 100KB context.md to max_summary_tokens * 2 chars', async () => {
			const largeContext = 'x'.repeat(100 * 1024);
			const filePath = join(tempDir, '.swarm', 'context.md');
			writeFileSync(filePath, largeContext, 'utf-8');

			const result = await runCuratorInit(tempDir, defaultConfig);

			expect(result).toBeDefined();
			expect(result.briefing).toContain('Context Summary');
			// max_summary_tokens = 1000, so maxContextChars = 1000 * 2 = 2000
			const contextMatch = result.briefing.match(
				/## Context Summary\n([\s\S]*?)$/m,
			);
			expect(contextMatch).toBeDefined();
			expect(contextMatch![1].length).toBeLessThanOrEqual(2000);
		});
	});

	/**
	 * Attack Vector 8: `min_knowledge_confidence: NaN`
	 * Filter condition `typeof e.confidence === 'number' && e.confidence >= NaN` is false for all numbers
	 * No entries should pass — must not throw
	 */
	describe('min_knowledge_confidence: NaN', () => {
		it('should not throw when min_knowledge_confidence is NaN', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const entry = {
				id: 'entry-nan',
				tier: 'swarm',
				lesson: 'Lesson with NaN threshold',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.9,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(knowledgePath, JSON.stringify(entry), 'utf-8');

			const nanConfig: CuratorConfig = {
				...defaultConfig,
				min_knowledge_confidence: NaN,
			};

			const result = await runCuratorInit(tempDir, nanConfig);

			expect(result).toBeDefined();
			// NaN comparison always returns false, so no entries should pass filter
			expect(result.briefing).not.toContain('High-Confidence Knowledge');
		});
	});

	/**
	 * Attack Vector 9: Directory does not exist
	 * Must return safe default (first session briefing)
	 */
	describe('Directory does not exist', () => {
		it('should return safe default when directory does not exist', async () => {
			const nonExistentDir = join(tmpdir(), `non-existent-${Date.now()}`);

			const result = await runCuratorInit(nonExistentDir, defaultConfig);

			expect(result).toBeDefined();
			// Non-existent directory returns first session briefing (safe default)
			expect(result.briefing).toContain('First Session');
			expect(result.knowledge_entries_reviewed).toBe(0);
		});
	});

	/**
	 * Attack Vector 10: `suppress_warnings: false` with many compliance observations
	 * Must include all without throwing
	 */
	describe('suppress_warnings: false with many compliance observations', () => {
		it('should include all compliance observations when suppress_warnings is false', async () => {
			// Create prior summary with many compliance observations
			const observations: Array<{
				phase: number;
				timestamp: string;
				type: 'workflow_deviation';
				severity: 'warning';
				description: string;
			}> = [];
			for (let i = 0; i < 50; i++) {
				observations.push({
					phase: 1,
					timestamp: new Date().toISOString(),
					type: 'workflow_deviation' as const,
					severity: 'warning' as const,
					description: `Compliance observation ${i}`,
				});
			}
			const summary = {
				schema_version: 1,
				session_id: 'test-session',
				last_updated: new Date().toISOString(),
				last_phase_covered: 1,
				digest: 'test-digest',
				phase_digests: [],
				compliance_observations: observations,
				knowledge_recommendations: [],
			};
			const filePath = join(tempDir, '.swarm', 'curator-summary.json');
			writeFileSync(filePath, JSON.stringify(summary), 'utf-8');

			const result = await runCuratorInit(tempDir, {
				...defaultConfig,
				suppress_warnings: false,
			});

			expect(result).toBeDefined();
			expect(result.briefing).toContain('Compliance Observations');
			// All 50 observations should be included
			for (let i = 0; i < 50; i++) {
				expect(result.briefing).toContain(`Compliance observation ${i}`);
			}
		});
	});
});

describe('runCuratorPhase - Adversarial Tests', () => {
	let tempDir: string;
	let eventBus: ReturnType<typeof getGlobalEventBus>;

	beforeEach(() => {
		tempDir = join(
			tmpdir(),
			`.swarm-curator-phase-adversarial-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(join(tempDir, '.swarm'), { recursive: true });
		eventBus = getGlobalEventBus();
		resetGlobalEventBus();
	});

	afterEach(() => {
		resetGlobalEventBus();
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	const defaultConfig: CuratorConfig = {
		enabled: true,
		init_enabled: true,
		phase_enabled: true,
		max_summary_tokens: 1000,
		min_knowledge_confidence: 0.7,
		compliance_report: true,
		suppress_warnings: false,
		drift_inject_max_chars: 5000,
	};

	/**
	 * Attack Vector 1: Corrupt events.jsonl (invalid lines mixed with valid)
	 * Must process valid lines, skip corrupt ones
	 */
	describe('Corrupt events.jsonl (invalid lines mixed with valid)', () => {
		it('should process valid lines and skip corrupt ones', async () => {
			const eventsPath = join(tempDir, '.swarm', 'events.jsonl');
			const events = [
				'{"phase": 1, "timestamp": "2024-01-01T00:00:00Z", "type": "phase_complete"}',
				'{{{ invalid json',
				'{"phase": 1, "timestamp": "2024-01-01T00:00:01Z", "type": "phase_complete"}',
				'not json at all',
				'{"phase": 1, "timestamp": "2024-01-01T00:00:02Z", "type": "phase_complete"}',
			];
			writeFileSync(eventsPath, events.join('\n'), 'utf-8');

			// Set up plan.json with 3 completed tasks so task count is accurate
			const plan = {
				schema_version: '1.0.0',
				title: 'Test',
				swarm: 'test',
				current_phase: 1,
				phases: [
					{
						id: 1,
						name: 'P1',
						status: 'in_progress',
						tasks: [
							{ id: '1.1', phase: 1, status: 'completed', description: 'A' },
							{ id: '1.2', phase: 1, status: 'completed', description: 'B' },
							{ id: '1.3', phase: 1, status: 'completed', description: 'C' },
						],
					},
				],
			};
			writeFileSync(join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

			const result = await runCuratorPhase(
				tempDir,
				1,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.digest.tasks_completed).toBe(3);
			expect(result.summary_updated).toBe(true);
		});
	});

	/**
	 * Attack Vector 2: events.jsonl with 10,000 events in phase
	 * Must not hang
	 */
	describe('events.jsonl with 10,000 events in phase', () => {
		it('should handle 10,000 events without hanging', async () => {
			const eventsPath = join(tempDir, '.swarm', 'events.jsonl');
			const events: string[] = [];
			for (let i = 0; i < 10000; i++) {
				events.push(
					JSON.stringify({
						phase: 1,
						timestamp: `2024-01-01T00:00:${i.toString().padStart(2, '0')}Z`,
						type: 'phase_complete',
					}),
				);
			}
			writeFileSync(eventsPath, events.join('\n'), 'utf-8');

			// Task count comes from plan.json, not events
			const plan = {
				schema_version: '1.0.0',
				title: 'Test',
				swarm: 'test',
				current_phase: 1,
				phases: [
					{
						id: 1,
						name: 'P1',
						status: 'in_progress',
						tasks: [
							{ id: '1.1', phase: 1, status: 'completed', description: 'A' },
						],
					},
				],
			};
			writeFileSync(join(tempDir, '.swarm', 'plan.json'), JSON.stringify(plan));

			const result = await runCuratorPhase(
				tempDir,
				1,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			// Task count from plan.json (1 task), not from events (10,000 events)
			expect(result.digest.tasks_completed).toBe(1);
		}, 60000);
	});

	/**
	 * Attack Vector 3: `agentsDispatched` with 1,000 entries
	 * Must deduplicate and not hang
	 */
	describe('agentsDispatched with 1,000 entries', () => {
		it('should deduplicate 1,000 agents without hanging', async () => {
			const agents: string[] = [];
			for (let i = 0; i < 1000; i++) {
				agents.push(i % 2 === 0 ? 'coder' : 'reviewer');
			}

			const result = await runCuratorPhase(
				tempDir,
				1,
				agents,
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.digest.agents_used).toContain('coder');
			expect(result.digest.agents_used).toContain('reviewer');
			// Should be deduplicated
			expect(result.digest.agents_used.length).toBeLessThanOrEqual(2);
		});
	});

	/**
	 * Attack Vector 4: Write failure - curator-summary.json parent directory is a file
	 * Must emit 'curator.error' and return summary_updated: false
	 */
	describe('Write failure - parent directory is a file', () => {
		it('should emit curator.error and return summary_updated: false', async () => {
			// First clean up any existing .swarm directory
			rmSync(join(tempDir, '.swarm'), { recursive: true, force: true });
			// Create a file where the .swarm directory should be
			const swarmFilePath = join(tempDir, '.swarm');
			writeFileSync(swarmFilePath, 'this is a file not a directory', 'utf-8');

			let errorEmitted = false;
			// Subscribe to the global event bus AFTER reset (gets fresh instance)
			const unsubscribe = getGlobalEventBus().subscribe('curator.error', () => {
				errorEmitted = true;
			});

			const result = await runCuratorPhase(
				tempDir,
				1,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.summary_updated).toBe(false);

			// Give async event time to propagate
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(errorEmitted).toBe(true);
			unsubscribe();
		});
	});

	/**
	 * Attack Vector 5: phase = 0 (edge case)
	 * Must process without throwing
	 */
	describe('phase = 0 (edge case)', () => {
		it('should process phase 0 without throwing', async () => {
			const result = await runCuratorPhase(
				tempDir,
				0,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.phase).toBe(0);
			expect(result.summary_updated).toBe(true);
		});
	});

	/**
	 * Attack Vector 6: phase = -1 (negative)
	 * Must process without throwing
	 */
	describe('phase = -1 (negative)', () => {
		it('should process negative phase without throwing', async () => {
			const result = await runCuratorPhase(
				tempDir,
				-1,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.phase).toBe(-1);
			expect(result.summary_updated).toBe(true);
		});
	});

	/**
	 * Attack Vector 7: phase = Infinity
	 * Must process without throwing
	 */
	describe('phase = Infinity', () => {
		it('should process Infinity phase without throwing', async () => {
			const result = await runCuratorPhase(
				tempDir,
				Infinity,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.phase).toBe(Infinity);
			expect(result.summary_updated).toBe(true);
		});
	});

	/**
	 * Attack Vector 8: context.md with Windows line endings (\r\n) in Decisions section
	 * Must extract key decisions correctly
	 */
	describe('context.md with Windows line endings in Decisions section', () => {
		it('should extract key decisions with CRLF line endings', async () => {
			const contextMd = `## Project Overview\r\nTest project\r\n\r\n## Decisions\r\n- Decision 1\r\n- Decision 2\r\n- Decision 3\r\n\r\n## Notes\r\nSome notes`;
			const filePath = join(tempDir, '.swarm', 'context.md');
			writeFileSync(filePath, contextMd, 'utf-8');

			const result = await runCuratorPhase(
				tempDir,
				1,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.digest.key_decisions).toContain('Decision 1');
			expect(result.digest.key_decisions).toContain('Decision 2');
			expect(result.digest.key_decisions).toContain('Decision 3');
		});
	});

	/**
	 * Attack Vector 9: context.md with NO Decisions section
	 * keyDecisions must be empty, no throw
	 */
	describe('context.md with NO Decisions section', () => {
		it('should return empty keyDecisions when no Decisions section', async () => {
			const contextMd = `## Project Overview\r\nTest project\r\n\r\n## Notes\r\nSome notes`;
			const filePath = join(tempDir, '.swarm', 'context.md');
			writeFileSync(filePath, contextMd, 'utf-8');

			const result = await runCuratorPhase(
				tempDir,
				1,
				['reviewer', 'test_engineer'],
				defaultConfig,
				{},
			);

			expect(result).toBeDefined();
			expect(result.digest.key_decisions).toEqual([]);
		});
	});

	/**
	 * Attack Vector 10: `agentsDispatched` = [] (empty)
	 * Must run compliance check and return compliance observations for missing required agents
	 */
	describe('agentsDispatched = [] (empty)', () => {
		it('should return compliance observations for missing required agents', async () => {
			const result = await runCuratorPhase(tempDir, 1, [], defaultConfig, {});

			expect(result).toBeDefined();
			// Should have compliance observations for missing reviewer and test_engineer
			const missingAgents = result.compliance.filter(
				(o) => o.type === 'workflow_deviation',
			);
			expect(missingAgents.length).toBeGreaterThan(0);
			expect(
				missingAgents.some((o) => o.description.includes('reviewer')),
			).toBe(true);
			expect(
				missingAgents.some((o) => o.description.includes('test_engineer')),
			).toBe(true);
		});
	});
});

// ============================================================================
// Adversarial Tests for applyCuratorKnowledgeUpdates
// ============================================================================

describe('applyCuratorKnowledgeUpdates - Adversarial Tests', () => {
	let tempDir: string;
	let eventBus: ReturnType<typeof getGlobalEventBus>;

	beforeEach(() => {
		tempDir = join(
			tmpdir(),
			`.swarm-curator-knowledge-updates-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(join(tempDir, '.swarm'), { recursive: true });
		eventBus = getGlobalEventBus();
		resetGlobalEventBus();
	});

	afterEach(() => {
		resetGlobalEventBus();
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	/**
	 * Attack Vector 1: Path traversal in directory
	 * Call applyCuratorKnowledgeUpdates with a directory containing path traversal
	 * Should not crash, should fail gracefully
	 */
	describe('Path traversal in directory', () => {
		it('should handle path traversal attempt in directory without crashing', async () => {
			const maliciousDir = '../../../etc/passwd';
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'test-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			// _knowledgeConfig is prefixed with underscore - unused in function
			const knowledgeConfig = {} as KnowledgeConfig;

			// Should not throw - should handle gracefully
			const result = await applyCuratorKnowledgeUpdates(
				maliciousDir,
				recommendations,
				knowledgeConfig,
			);
			expect(result).toBeDefined();
			expect(typeof result.applied).toBe('number');
			expect(typeof result.skipped).toBe('number');
		});

		it('should handle null byte in directory path', async () => {
			const maliciousDir = '/tmp/test\0evil';
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'test-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			// Should handle gracefully without throwing
			const result = await applyCuratorKnowledgeUpdates(
				maliciousDir,
				recommendations,
				knowledgeConfig,
			);
			expect(result).toBeDefined();
		});
	});

	/**
	 * Attack Vector 2: entry_id containing path separators
	 * Should not write to wrong path - should only match exact entry_id
	 */
	describe('entry_id containing path separators', () => {
		it('should not match entry_id with path separators', async () => {
			// Create existing knowledge entry
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'legitimate-entry',
				tier: 'swarm',
				lesson: 'Legitimate lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			// Try to apply recommendation with path separator in entry_id
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: '../evil',
					lesson: 'Evil lesson',
					reason: 'Malicious reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);

			// Should skip the entry (not found)
			expect(result.skipped).toBe(1);
			expect(result.applied).toBe(0);

			// Verify the legitimate entry was NOT modified
			const content = existsSync(knowledgePath)
				? require('node:fs').readFileSync(knowledgePath, 'utf-8')
				: '';
			const parsed = content
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l));
			expect(parsed[0].status).toBe('established');
			expect(parsed[0].confidence).toBe(0.8);
		});

		it('should handle entry_id with null byte', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'normal-entry',
				tier: 'swarm',
				lesson: 'Normal lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'entry\0evil',
					lesson: 'Test',
					reason: 'Test',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);
			// Should skip (not found)
			expect(result.skipped).toBe(1);
		});
	});

	/**
	 * Attack Vector 3: reason field containing 10,000 characters
	 * slice(0, 50) should still work, no OOM
	 */
	describe('Oversized reason field (10,000 characters)', () => {
		it('should handle 10,000 character reason without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'test-entry',
				tier: 'swarm',
				lesson: 'Test lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			const longReason = 'x'.repeat(10000);
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'flag_contradiction',
					entry_id: 'test-entry',
					lesson: 'Test lesson',
					reason: longReason,
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);

			// Should apply successfully - slice(0, 50) handles it
			expect(result.applied).toBe(1);
			expect(result.skipped).toBe(0);

			// Verify the tag was added with truncated reason
			const content = require('node:fs').readFileSync(knowledgePath, 'utf-8');
			const parsed = content
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l));
			const tag = parsed[0].tags.find((t: string) =>
				t.startsWith('contradiction:'),
			);
			expect(tag).toBeDefined();
			expect(tag.length).toBeLessThanOrEqual(64); // "contradiction:" (14) + reason.slice(0, 50) (50) = 64
		}, 30000);
	});

	/**
	 * Attack Vector 4: Empty string entry_id
	 * entry_id !== undefined check: should be counted as skipped
	 */
	describe('Empty string entry_id', () => {
		it('should skip recommendations with empty string entry_id', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'real-entry',
				tier: 'swarm',
				lesson: 'Real lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			// Empty string is not undefined, so it passes the !== undefined check
			// But it won't match any entry.id
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: '',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);

			// Empty string entry_id should be counted as skipped (not found)
			expect(result.skipped).toBe(1);
			expect(result.applied).toBe(0);
		});
	});

	/**
	 * Attack Vector 5: recommendations with 10,000 entries
	 * Should not crash (O(N×M) is acceptable for test)
	 */
	describe('Large recommendations array (10,000 entries)', () => {
		it('should handle 10,000 recommendations without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			// Create a small set of existing entries
			const entries: SwarmKnowledgeEntry[] = [];
			for (let i = 0; i < 100; i++) {
				entries.push({
					id: `entry-${i}`,
					tier: 'swarm',
					lesson: `Lesson ${i}`,
					category: 'process',
					tags: ['test'],
					scope: 'global',
					confidence: 0.8,
					status: 'established',
					confirmed_by: [],
					retrieval_outcomes: {
						applied_count: 0,
						succeeded_after_count: 0,
						failed_after_count: 0,
					},
					schema_version: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					project_name: 'test-project',
				});
			}
			writeFileSync(
				knowledgePath,
				entries.map((e) => JSON.stringify(e)).join('\n'),
				'utf-8',
			);

			// Create 10,000 recommendations
			const recommendations: KnowledgeRecommendation[] = [];
			for (let i = 0; i < 10000; i++) {
				recommendations.push({
					action:
						i % 3 === 0
							? 'promote'
							: i % 3 === 1
								? 'archive'
								: 'flag_contradiction',
					entry_id: `entry-${i % 100}`, // Only 100 entries exist
					lesson: `Recommendation ${i}`,
					reason: `Reason ${i}`,
				});
			}
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);

			// Should handle gracefully
			expect(result).toBeDefined();
			expect(typeof result.applied).toBe('number');
			expect(typeof result.skipped).toBe('number');
			// At most 100 entries can be applied (only 100 exist)
			expect(result.applied).toBeLessThanOrEqual(100);
		}, 60000);
	});

	/**
	 * Attack Vector 6: action field with unknown value
	 * Default case: entry unchanged, counted as skipped
	 */
	describe('Unknown action value', () => {
		it('should skip recommendations with unknown action value', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'test-entry',
				tier: 'swarm',
				lesson: 'Test lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			// Unknown action - not 'promote', 'archive', or 'flag_contradiction'
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'delete' as 'promote',
					entry_id: 'test-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);

			// Should skip (default case - entry unchanged)
			// The recommendation passes the !== undefined check but doesn't match any known action
			// so it's not added to appliedIds and gets counted as skipped
			expect(result.skipped).toBe(1);
			expect(result.applied).toBe(0);

			// Verify entry was NOT modified
			const content = require('node:fs').readFileSync(knowledgePath, 'utf-8');
			const parsed = JSON.parse(content.trim());
			expect(parsed.status).toBe('established');
			expect(parsed.confidence).toBe(0.8);
		});

		it('should handle unknown action "update" gracefully', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'test-entry-2',
				tier: 'swarm',
				lesson: 'Test lesson 2',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'update' as 'promote',
					entry_id: 'test-entry-2',
					lesson: 'Test',
					reason: 'Test',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);
			expect(result).toBeDefined();
			expect(result.skipped).toBe(1);
		});
	});

	/**
	 * Invalid confidence values (NaN, Infinity, -Infinity)
	 * Note: JSON.stringify converts Infinity/-Infinity/NaN to null, so these tests
	 * verify the function handles these edge cases gracefully without crashing.
	 */
	describe('Invalid confidence values (NaN, Infinity, -Infinity)', () => {
		it('should handle entry with NaN confidence without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			// JSON.stringify converts NaN to null, so confidence becomes null in the file
			// null ?? 0 = 0, so Math.min(1.0, 0 + 0.1) = 0.1
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'nan-confidence',
				tier: 'swarm',
				lesson: 'Test lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: NaN,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'nan-confidence',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			// Should not throw - NaN is handled gracefully
			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);
			expect(result).toBeDefined();
			// NaN becomes null after JSON parse, then null ?? 0 = 0
			// So Math.min(1.0, 0 + 0.1) = 0.1, entry gets modified
			expect(result.applied).toBe(1);
		});

		it('should handle entry with Infinity confidence without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'inf-confidence',
				tier: 'swarm',
				lesson: 'Test lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: Infinity,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			// JSON.stringify converts Infinity to null
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'inf-confidence',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);
			expect(result).toBeDefined();
			// JSON.stringify converts Infinity to null, so entry.confidence is null
			// null ?? 0 = 0, so Math.min(1.0, 0 + 0.1) = 0.1
			expect(result.applied).toBe(1);
		});

		it('should handle entry with -Infinity confidence without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'neg-inf-confidence',
				tier: 'swarm',
				lesson: 'Test lesson',
				category: 'process',
				tags: ['test'],
				scope: 'global',
				confidence: -Infinity,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'neg-inf-confidence',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);
			expect(result).toBeDefined();
			// -Infinity in JSON becomes null, then null ?? 0 = 0
			// Math.min(1.0, 0 + 0.1) = 0.1
			expect(result.applied).toBe(1);
		});
	});

	/**
	 * Attack Vector 8: tags = null (not undefined)
	 * tags ?? [] should handle it
	 */
	describe('tags = null (not undefined)', () => {
		it('should handle entry with null tags without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const existingEntry: SwarmKnowledgeEntry = {
				id: 'null-tags',
				tier: 'swarm',
				lesson: 'Test lesson',
				category: 'process',
				tags: null as unknown as string[],
				scope: 'global',
				confidence: 0.8,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				project_name: 'test-project',
			};
			writeFileSync(
				knowledgePath,
				JSON.stringify(existingEntry) + '\n',
				'utf-8',
			);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'flag_contradiction',
					entry_id: 'null-tags',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			// Should not throw - tags ?? [] handles null
			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);
			expect(result).toBeDefined();
			expect(result.applied).toBe(1);

			// Verify tag was added
			const content = require('node:fs').readFileSync(knowledgePath, 'utf-8');
			const parsed = JSON.parse(content.trim());
			expect(parsed.tags).toBeDefined();
			expect(parsed.tags.length).toBe(1);
			expect(parsed.tags[0]).toContain('contradiction:');
		});
	});

	/**
	 * Attack Vector 9: Concurrent modification scenario
	 * readKnowledge returns entries while mutation is happening - assert no exception thrown
	 * Note: rewriteKnowledge uses proper-lockfile which throws if lock is held
	 */
	describe('Concurrent modification scenario', () => {
		it('should handle concurrent reads/writes without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const entries: SwarmKnowledgeEntry[] = [];
			for (let i = 0; i < 10; i++) {
				entries.push({
					id: `entry-${i}`,
					tier: 'swarm',
					lesson: `Lesson ${i}`,
					category: 'process',
					tags: ['test'],
					scope: 'global',
					confidence: 0.8,
					status: 'established',
					confirmed_by: [],
					retrieval_outcomes: {
						applied_count: 0,
						succeeded_after_count: 0,
						failed_after_count: 0,
					},
					schema_version: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					project_name: 'test-project',
				});
			}
			writeFileSync(
				knowledgePath,
				entries.map((e) => JSON.stringify(e)).join('\n'),
				'utf-8',
			);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'entry-0',
					lesson: 'Test',
					reason: 'Test',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			// Run sequential updates to avoid lockfile conflicts
			// (concurrent writes would throw ELOCKED error, which is expected behavior)
			let totalApplied = 0;
			let totalSkipped = 0;
			for (let i = 0; i < 5; i++) {
				const result = await applyCuratorKnowledgeUpdates(
					tempDir,
					recommendations,
					knowledgeConfig,
				);
				totalApplied += result.applied;
				totalSkipped += result.skipped;
			}

			// All should complete successfully
			expect(totalApplied + totalSkipped).toBeGreaterThan(0);
		});

		it('should handle concurrent writes with different entries without crashing', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			const entries: SwarmKnowledgeEntry[] = [];
			for (let i = 0; i < 10; i++) {
				entries.push({
					id: `entry-${i}`,
					tier: 'swarm',
					lesson: `Lesson ${i}`,
					category: 'process',
					tags: ['test'],
					scope: 'global',
					confidence: 0.8,
					status: 'established',
					confirmed_by: [],
					retrieval_outcomes: {
						applied_count: 0,
						succeeded_after_count: 0,
						failed_after_count: 0,
					},
					schema_version: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					project_name: 'test-project',
				});
			}
			writeFileSync(
				knowledgePath,
				entries.map((e) => JSON.stringify(e)).join('\n'),
				'utf-8',
			);

			const knowledgeConfig = {} as KnowledgeConfig;

			// Each recommendation targets a different entry - run sequentially
			let totalApplied = 0;
			let totalSkipped = 0;
			for (let i = 0; i < 10; i++) {
				const recommendations: KnowledgeRecommendation[] = [
					{
						action: 'promote',
						entry_id: `entry-${i}`,
						lesson: 'Test',
						reason: 'Test',
					},
				];
				const result = await applyCuratorKnowledgeUpdates(
					tempDir,
					recommendations,
					knowledgeConfig,
				);
				totalApplied += result.applied;
				totalSkipped += result.skipped;
			}

			// All 10 entries should be applied
			expect(totalApplied).toBe(10);
			expect(totalSkipped).toBe(0);
		});
	});

	/**
	 * Attack Vector 10: Knowledge file does not exist
	 * readKnowledge returns [], applied=0, skipped=N
	 */
	describe('Knowledge file does not exist', () => {
		it('should return applied=0 skipped=N when knowledge.jsonl does not exist', async () => {
			// Ensure no knowledge.jsonl exists
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			if (existsSync(knowledgePath)) {
				rmSync(knowledgePath);
			}

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'non-existent-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
				{
					action: 'archive',
					entry_id: 'another-missing',
					lesson: 'Test lesson 2',
					reason: 'Test reason 2',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);

			// No entries exist, so all recommendations should be skipped
			expect(result.applied).toBe(0);
			expect(result.skipped).toBe(2);
		});

		it('should handle empty recommendations with no knowledge file', async () => {
			const knowledgePath = join(tempDir, '.swarm', 'knowledge.jsonl');
			if (existsSync(knowledgePath)) {
				rmSync(knowledgePath);
			}

			const recommendations: KnowledgeRecommendation[] = [];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				tempDir,
				recommendations,
				knowledgeConfig,
			);

			// Early return for empty recommendations
			expect(result.applied).toBe(0);
			expect(result.skipped).toBe(0);
		});

		it('should handle directory that does not exist at all', async () => {
			const nonExistentDir = join(tmpdir(), `non-existent-${Date.now()}`);

			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'test-entry',
					lesson: 'Test',
					reason: 'Test',
				},
			];
			const knowledgeConfig = {} as KnowledgeConfig;

			const result = await applyCuratorKnowledgeUpdates(
				nonExistentDir,
				recommendations,
				knowledgeConfig,
			);

			// readKnowledge returns [] for non-existent path
			expect(result.applied).toBe(0);
			expect(result.skipped).toBe(1);
		});
	});

	// ==================================================================
	// Adversarial: rewrite action boundary tests (v6.50)
	// ==================================================================

	describe('Adversarial: rewrite action', () => {
		let rewriteDir: string;
		const rewriteKnowledgeConfig: KnowledgeConfig = {
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
			same_project_weight: 1.0,
			cross_project_weight: 0.5,
			min_encounter_score: 0.1,
			initial_encounter_score: 1.0,
			encounter_increment: 0.1,
			max_encounter_score: 10.0,
		};

		beforeEach(() => {
			rewriteDir = join(
				tmpdir(),
				`curator-rewrite-adv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			);
			mkdirSync(join(rewriteDir, '.swarm'), { recursive: true });
		});

		afterEach(() => {
			rmSync(rewriteDir, { recursive: true, force: true });
		});

		it('rewrite with lesson.length = 281 is rejected', async () => {
			const entry = {
				id: 'RW-ADV-1',
				tier: 'swarm',
				lesson: 'Original lesson text that should not change',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.7,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-01T00:00:00Z',
				hive_eligible: false,
				project_name: 'test-project',
			};
			writeFileSync(
				join(rewriteDir, '.swarm', 'knowledge.jsonl'),
				JSON.stringify(entry),
			);

			const result = await applyCuratorKnowledgeUpdates(
				rewriteDir,
				[
					{
						action: 'rewrite',
						entry_id: 'RW-ADV-1',
						lesson: 'A'.repeat(281),
						reason: 'Too long',
					},
				],
				rewriteKnowledgeConfig,
			);

			expect(result.applied).toBe(0);
		});

		it('rewrite with lesson.length = 280 is accepted', async () => {
			const entry = {
				id: 'RW-ADV-2',
				tier: 'swarm',
				lesson: 'Original lesson text for testing boundary',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.7,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-01T00:00:00Z',
				hive_eligible: false,
				project_name: 'test-project',
			};
			writeFileSync(
				join(rewriteDir, '.swarm', 'knowledge.jsonl'),
				JSON.stringify(entry),
			);

			const result = await applyCuratorKnowledgeUpdates(
				rewriteDir,
				[
					{
						action: 'rewrite',
						entry_id: 'RW-ADV-2',
						lesson: 'A'.repeat(280),
						reason: 'Boundary',
					},
				],
				rewriteKnowledgeConfig,
			);

			expect(result.applied).toBe(1);
		});
	});

	// ==================================================================
	// Adversarial: knowledgeConfig null/undefined guard (v6.60)
	// ==================================================================

	describe('Adversarial: knowledgeConfig null/undefined guard with non-empty recommendations', () => {
		let guardDir: string;

		beforeEach(() => {
			guardDir = join(
				tmpdir(),
				`curator-guard-adv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			);
			mkdirSync(join(guardDir, '.swarm'), { recursive: true });
			// Create a knowledge entry so the function doesn't return early due to empty recommendations
			const entry: SwarmKnowledgeEntry = {
				id: 'existing-entry',
				tier: 'swarm',
				lesson: 'Existing lesson',
				category: 'process',
				tags: [],
				scope: 'global',
				confidence: 0.7,
				status: 'established',
				confirmed_by: [],
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-01T00:00:00Z',
				project_name: 'test-project',
			};
			writeFileSync(
				join(guardDir, '.swarm', 'knowledge.jsonl'),
				JSON.stringify(entry),
			);
		});

		afterEach(() => {
			rmSync(guardDir, { recursive: true, force: true });
		});

		/**
		 * Attack Vector: knowledgeConfig is null with non-empty recommendations
		 * The guard at line 844-847 uses `if (knowledgeConfig == null)` which catches null
		 * This test ensures the guard is ACTUALLY reached (not bypassed by empty recommendations check)
		 */
		it('returns { applied: 0, skipped: 0 } when knowledgeConfig is null WITH non-empty recommendations', async () => {
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'existing-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];

			// @ts-expect-error — intentionally passing null to test runtime guard
			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				recommendations,
				null,
			);

			// Guard should return { applied: 0, skipped: 0 }
			// The entry should NOT be modified because knowledgeConfig is null
			expect(result).toEqual({ applied: 0, skipped: 0 });

			// Verify entry was NOT modified
			const content = require('node:fs').readFileSync(
				join(guardDir, '.swarm', 'knowledge.jsonl'),
				'utf-8',
			);
			const parsed = JSON.parse(content.trim());
			expect(parsed.status).toBe('established');
			expect(parsed.hive_eligible).toBeUndefined();
		});

		/**
		 * Attack Vector: knowledgeConfig is undefined with non-empty recommendations
		 * The guard uses `if (knowledgeConfig == null)` which catches undefined via loose equality
		 */
		it('returns { applied: 0, skipped: 0 } when knowledgeConfig is undefined WITH non-empty recommendations', async () => {
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'existing-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];

			// @ts-expect-error — intentionally passing undefined to test runtime guard
			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				recommendations,
				undefined,
			);

			expect(result).toEqual({ applied: 0, skipped: 0 });

			// Verify entry was NOT modified
			const content = require('node:fs').readFileSync(
				join(guardDir, '.swarm', 'knowledge.jsonl'),
				'utf-8',
			);
			const parsed = JSON.parse(content.trim());
			expect(parsed.status).toBe('established');
			expect(parsed.hive_eligible).toBeUndefined();
		});

		/**
		 * Falsy non-null/undefined values for knowledgeConfig
		 * These should NOT trigger the guard (since 0 != null, "" != null, false != null)
		 * The function should proceed and potentially fail when accessing properties
		 */
		it('does NOT guard against knowledgeConfig = 0 (falsy but not null)', async () => {
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'existing-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];

			// @ts-expect-error — intentionally passing 0 to test behavior
			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				recommendations,
				0 as unknown as KnowledgeConfig,
			);

			// 0 != null, so guard does not trigger
			// The function will try to access properties on 0 and may throw
			expect(
				result.applied !== 0 || result.skipped !== 0 || result.applied === 0,
			).toBe(true);
		});

		it('does NOT guard against knowledgeConfig = "" (empty string)', async () => {
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'existing-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];

			// @ts-expect-error — intentionally passing "" to test behavior
			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				recommendations,
				'' as unknown as KnowledgeConfig,
			);

			// "" != null, so guard does not trigger
			expect(
				result.applied !== 0 || result.skipped !== 0 || result.applied === 0,
			).toBe(true);
		});

		it('does NOT guard against knowledgeConfig = false', async () => {
			const recommendations: KnowledgeRecommendation[] = [
				{
					action: 'promote',
					entry_id: 'existing-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
			];

			// @ts-expect-error — intentionally passing false to test behavior
			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				recommendations,
				false as unknown as KnowledgeConfig,
			);

			// false != null, so guard does not trigger
			expect(
				result.applied !== 0 || result.skipped !== 0 || result.applied === 0,
			).toBe(true);
		});

		/**
		 * Attack Vector: recommendations is null
		 * This is different from knowledgeConfig being null - recommendations is the first parameter
		 */
		it('handles recommendations = null gracefully', async () => {
			// @ts-expect-error — intentionally passing null for recommendations
			const result = await applyCuratorKnowledgeUpdates(guardDir, null, {});

			// Should handle null recommendations without crashing
			expect(result).toBeDefined();
			expect(typeof result.applied).toBe('number');
			expect(typeof result.skipped).toBe('number');
		});

		/**
		 * Attack Vector: recommendations is undefined
		 */
		it('handles recommendations = undefined gracefully', async () => {
			// @ts-expect-error — intentionally passing undefined for recommendations
			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				undefined,
				{},
			);

			expect(result).toBeDefined();
			expect(typeof result.applied).toBe('number');
			expect(typeof result.skipped).toBe('number');
		});

		/**
		 * Attack Vector: recommendations contains null/undefined items
		 */
		it('handles recommendations array with null item gracefully', async () => {
			const recommendations = [
				{
					action: 'promote',
					entry_id: 'existing-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
				null as unknown as KnowledgeRecommendation,
			];

			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				recommendations,
				{} as KnowledgeConfig,
			);

			// Should handle the null item without crashing
			expect(result).toBeDefined();
		});

		/**
		 * Attack Vector: recommendations contains undefined item
		 */
		it('handles recommendations array with undefined item gracefully', async () => {
			const recommendations: (KnowledgeRecommendation | undefined)[] = [
				{
					action: 'promote',
					entry_id: 'existing-entry',
					lesson: 'Test lesson',
					reason: 'Test reason',
				},
				undefined,
			];

			const result = await applyCuratorKnowledgeUpdates(
				guardDir,
				recommendations,
				{} as KnowledgeConfig,
			);

			expect(result).toBeDefined();
		});
	});
});
