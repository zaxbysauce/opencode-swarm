/**
 * Tests for the isWriteToEvidenceFile predicate in knowledge-curator.ts
 * Tests path matching for evidence file writes across different scenarios.
 */

import { describe, test, expect } from 'vitest';
import { isWriteToEvidenceFile } from '../../../src/hooks/knowledge-curator.js';

// ============================================================================
// Positive matches (should return true)
// ============================================================================

describe('isWriteToEvidenceFile - positive matches', () => {
	test('write to .swarm/evidence/retro-3/evidence.json', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('edit to .swarm/evidence/retro-phase1/evidence.json', () => {
		const input = { toolName: 'edit', file: '.swarm/evidence/retro-phase1/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('apply_patch to .swarm/evidence/retro-99/evidence.json', () => {
		const input = { toolName: 'apply_patch', path: '.swarm/evidence/retro-99/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('Windows path with backslashes: .swarm\\evidence\\retro-3\\evidence.json', () => {
		const input = { toolName: 'write', path: '.swarm\\evidence\\retro-3\\evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('absolute Windows path with .swarm in it: C:\\project\\.swarm\\evidence\\retro-1\\evidence.json', () => {
		const input = { toolName: 'write', path: 'C:\\project\\.swarm\\evidence\\retro-1\\evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('write to .swarm/evidence/retro-123/evidence.json (three-digit retro)', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-123/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('edit with retro prefix containing letters: .swarm/evidence/retro-phase-alpha/evidence.json', () => {
		const input = { toolName: 'edit', file: '.swarm/evidence/retro-phase-alpha/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('write to .swarm/evidence/retro-3/evidence.json with extra path segments', () => {
		const input = { toolName: 'write', path: 'prefix/.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});
});

// ============================================================================
// Negative matches (should return false)
// ============================================================================

describe('isWriteToEvidenceFile - negative matches', () => {
	test('write to .swarm/plan.md - wrong file', () => {
		const input = { toolName: 'write', path: '.swarm/plan.md' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('write to .swarm/evidence/other.json - no retro- prefix', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/other.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('write to .swarm/evidence/retro-3/other.json - wrong filename', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-3/other.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('read to .swarm/evidence/retro-3/evidence.json - read is not a write op', () => {
		const input = { toolName: 'read', path: '.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('null input', () => {
		expect(isWriteToEvidenceFile(null)).toBe(false);
	});

	test('undefined input', () => {
		expect(isWriteToEvidenceFile(undefined)).toBe(false);
	});

	test('number input (42)', () => {
		expect(isWriteToEvidenceFile(42)).toBe(false);
	});

	test('string input', () => {
		expect(isWriteToEvidenceFile('.swarm/evidence/retro-3/evidence.json')).toBe(false);
	});

	test('empty object - missing toolName', () => {
		const input = {};
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('object with null toolName', () => {
		const input = { toolName: null, path: '.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('object with undefined toolName', () => {
		const input = { toolName: undefined, path: '.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('object with string toolName but not write/edit/apply_patch', () => {
		const input = { toolName: 'delete', path: '.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('object with toolName but no path or file', () => {
		const input = { toolName: 'write' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('write to .swarm/evidence.json - missing retro- subdirectory', () => {
		const input = { toolName: 'write', path: '.swarm/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('write to .swarm/evidence/retro-3/ - directory path without file', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-3/' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('write to .swarm/evidence/retro-/evidence.json - empty retro identifier', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('write to .swarm/evidence/retro-3/evidence.json.md - wrong extension', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-3/evidence.json.md' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('write to evidence.json - missing .swarm prefix', () => {
		const input = { toolName: 'write', path: 'evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('array input', () => {
		const input = ['toolName', 'write'];
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('boolean input', () => {
		expect(isWriteToEvidenceFile(true)).toBe(false);
		expect(isWriteToEvidenceFile(false)).toBe(false);
	});
});

// ============================================================================
// Edge cases
// ============================================================================

describe('isWriteToEvidenceFile - edge cases', () => {
	test('mixed slashes in path', () => {
		const input = { toolName: 'write', path: '.swarm/evidence\\retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('path with trailing slash', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-3/' };
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('path with leading slash', () => {
		const input = { toolName: 'write', path: '/.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('both path and file fields present - path takes precedence', () => {
		const input = {
			toolName: 'write',
			path: '.swarm/evidence/retro-3/evidence.json',
			file: 'other.txt',
		};
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('path field is evidence file, file field is not - should match via path', () => {
		const input = {
			toolName: 'write',
			path: '.swarm/evidence/retro-3/evidence.json',
			file: '.swarm/plan.md',
		};
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('file field is evidence file, path field is not - should match via file', () => {
		const input = {
			toolName: 'write',
			path: '.swarm/plan.md',
			file: '.swarm/evidence/retro-3/evidence.json',
		};
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('retro identifier with special characters: retro-3_2', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-3_2/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('retro identifier with hyphens: retro-phase-1-complete', () => {
		const input = { toolName: 'write', path: '.swarm/evidence/retro-phase-1-complete/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('path with double backslashes (escaped) - should not match', () => {
		const input = { toolName: 'write', path: '.swarm\\\\evidence\\\\retro-3\\\\evidence.json' };
		// Literal double backslashes are not valid paths, so this correctly returns false
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('object with extra properties should still match', () => {
		const input = {
			toolName: 'write',
			path: '.swarm/evidence/retro-3/evidence.json',
			extra: 'property',
			sessionID: 'test',
		};
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('edit tool with evidence file', () => {
		const input = { toolName: 'edit', path: '.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('apply_patch tool with evidence file', () => {
		const input = { toolName: 'apply_patch', path: '.swarm/evidence/retro-3/evidence.json' };
		expect(isWriteToEvidenceFile(input)).toBe(true);
	});

	test('WRITE tool (uppercase) should work - check case sensitivity', () => {
		const input = { toolName: 'WRITE', path: '.swarm/evidence/retro-3/evidence.json' };
		// The function checks exact string matches in array, so uppercase should fail
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});

	test('Write tool (mixed case) should work - check case sensitivity', () => {
		const input = { toolName: 'Write', path: '.swarm/evidence/retro-3/evidence.json' };
		// The function checks exact string matches in array, so mixed case should fail
		expect(isWriteToEvidenceFile(input)).toBe(false);
	});
});
