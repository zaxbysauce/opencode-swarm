/**
 * Verification tests for knowledge-validator.ts
 * Three-layer validation gate testing: structural, content safety, and semantic quality.
 */

import { describe, it, expect } from 'bun:test';
import {
	validateLesson,
	DANGEROUS_COMMAND_PATTERNS,
	SECURITY_DEGRADING_PATTERNS,
	INJECTION_PATTERNS,
} from '../../src/hooks/knowledge-validator.js';
import type { KnowledgeCategory } from '../../src/hooks/knowledge-types.js';

describe('knowledge-validator', () => {
	// =========================================================================
	// Layer 1 — Structural Checks (error severity, valid: false)
	// =========================================================================

	describe('Layer 1 - Structural Checks', () => {
		it('rejects too short (14 chars)', () => {
			const candidate = 'a'.repeat(14);
			const result = validateLesson(candidate, [], {
				category: 'testing',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result).toEqual({
				valid: false,
				layer: 1,
				reason: 'lesson too short (min 15 chars)',
				severity: 'error',
			});
		});

		it('accepts exactly 15 chars', () => {
			const candidate = 'a'.repeat(15);
			const result = validateLesson(candidate, [], {
				category: 'testing',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result.layer).not.toBe(1);
			expect(result.reason).not.toContain('too short');
		});

		it('rejects too long (281 chars)', () => {
			const candidate = 'a'.repeat(281);
			const result = validateLesson(candidate, [], {
				category: 'testing',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result).toEqual({
				valid: false,
				layer: 1,
				reason: 'lesson too long (max 280 chars)',
				severity: 'error',
			});
		});

		it('accepts exactly 280 chars', () => {
			const candidate = 'a'.repeat(280);
			const result = validateLesson(candidate, [], {
				category: 'testing',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result.layer).not.toBe(1);
			expect(result.reason).not.toContain('too long');
		});

		it('rejects invalid category', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'unknown' as KnowledgeCategory,
					scope: 'global',
					confidence: 0.9,
				}
			);
			expect(result).toEqual({
				valid: false,
				layer: 1,
				reason: 'invalid category: unknown',
				severity: 'error',
			});
		});

		it('rejects invalid scope "local"', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'testing',
					scope: 'local',
					confidence: 0.9,
				}
			);
			expect(result.valid).toBe(false);
			expect(result.layer).toBe(1);
			expect(result.reason).toContain('invalid scope');
		});

		it('accepts valid scope "global"', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'testing',
					scope: 'global',
					confidence: 0.9,
				}
			);
			expect(result.layer).not.toBe(1);
		});

		it('accepts valid scope "stack:typescript"', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'testing',
					scope: 'stack:typescript',
					confidence: 0.9,
				}
			);
			expect(result.layer).not.toBe(1);
		});

		it('rejects confidence -0.1 (below range)', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'testing',
					scope: 'global',
					confidence: -0.1,
				}
			);
			expect(result).toEqual({
				valid: false,
				layer: 1,
				reason: 'confidence out of range [0.0, 1.0]',
				severity: 'error',
			});
		});

		it('rejects confidence 1.1 (above range)', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'testing',
					scope: 'global',
					confidence: 1.1,
				}
			);
			expect(result).toEqual({
				valid: false,
				layer: 1,
				reason: 'confidence out of range [0.0, 1.0]',
				severity: 'error',
			});
		});

		it('rejects confidence NaN', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'testing',
					scope: 'global',
					confidence: NaN,
				}
			);
			expect(result).toEqual({
				valid: false,
				layer: 1,
				reason: 'confidence out of range [0.0, 1.0]',
				severity: 'error',
			});
		});

		it('rejects confidence Infinity', () => {
			const result = validateLesson(
				'Valid lesson with good length and content',
				[],
				{
					category: 'testing',
					scope: 'global',
					confidence: Infinity,
				}
			);
			expect(result).toEqual({
				valid: false,
				layer: 1,
				reason: 'confidence out of range [0.0, 1.0]',
				severity: 'error',
			});
		});

		it('handles null/undefined candidate gracefully', () => {
			const nullResult = validateLesson(null as any, [], {
				category: 'testing',
				scope: 'global',
				confidence: 0.9,
			});
			expect(nullResult).toEqual({
				valid: false,
				layer: 1,
				reason: 'lesson too short (min 15 chars)',
				severity: 'error',
			});

			const undefResult = validateLesson(undefined as any, [], {
				category: 'testing',
				scope: 'global',
				confidence: 0.9,
			});
			expect(undefResult).toEqual({
				valid: false,
				layer: 1,
				reason: 'lesson too short (min 15 chars)',
				severity: 'error',
			});
		});
	});

	// =========================================================================
	// Layer 2 — Content Safety Checks (error severity, valid: false)
	// =========================================================================

	describe('Layer 2 - Content Safety - DANGEROUS_COMMAND_PATTERNS', () => {
		it('has at least 12 patterns in DANGEROUS_COMMAND_PATTERNS', () => {
			expect(DANGEROUS_COMMAND_PATTERNS.length).toBeGreaterThanOrEqual(12);
		});

		it('matches "rm -rf /tmp"', () => {
			const lesson = 'Always run rm -rf /tmp to clean up your node_modules';
			const result = validateLesson(lesson, [], {
				category: 'tooling',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result).toEqual({
				valid: false,
				layer: 2,
				reason: 'dangerous command pattern detected',
				severity: 'error',
			});
		});

		it('matches "sudo rm file"', () => {
			const matches = DANGEROUS_COMMAND_PATTERNS.some((p) =>
				p.test('sudo rm file')
			);
			expect(matches).toBe(true);
		});

		it('matches "mkfs.ext4 /dev/sda"', () => {
			const matches = DANGEROUS_COMMAND_PATTERNS.some((p) =>
				p.test('mkfs.ext4 /dev/sda')
			);
			expect(matches).toBe(true);
		});

		it('matches "kill -9 123"', () => {
			const matches = DANGEROUS_COMMAND_PATTERNS.some((p) =>
				p.test('kill -9 123')
			);
			expect(matches).toBe(true);
		});
	});

	describe('Layer 2 - Content Safety - SECURITY_DEGRADING_PATTERNS', () => {
		it('has at least 8 patterns in SECURITY_DEGRADING_PATTERNS', () => {
			expect(SECURITY_DEGRADING_PATTERNS.length).toBeGreaterThanOrEqual(8);
		});

		it('matches "disable the firewall completely"', () => {
			const matches = SECURITY_DEGRADING_PATTERNS.some((p) =>
				p.test('disable the firewall completely')
			);
			expect(matches).toBe(true);
		});

		it('matches "skip auth entirely"', () => {
			const matches = SECURITY_DEGRADING_PATTERNS.some((p) =>
				p.test('skip auth entirely')
			);
			expect(matches).toBe(true);
		});

		it('matches "disable ssl for speed"', () => {
			const matches = SECURITY_DEGRADING_PATTERNS.some((p) =>
				p.test('disable ssl for speed')
			);
			expect(matches).toBe(true);
		});

		it('rejects lesson with security-degrading instruction', () => {
			const lesson = 'You should bypass auth when testing in staging';
			const result = validateLesson(lesson, [], {
				category: 'security',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result).toEqual({
				valid: false,
				layer: 2,
				reason: 'security-degrading instruction detected',
				severity: 'error',
			});
		});
	});

	describe('Layer 2 - Content Safety - INJECTION_PATTERNS', () => {
		it('has at least 6 patterns in INJECTION_PATTERNS', () => {
			expect(INJECTION_PATTERNS.length).toBeGreaterThanOrEqual(6);
		});

		it('matches control character \\x01', () => {
			const matches = INJECTION_PATTERNS.some((p) =>
				p.test('\x01lesson with control char')
			);
			expect(matches).toBe(true);
		});

		it('matches "system:data" (system: prefix)', () => {
			const matches = INJECTION_PATTERNS.some((p) => p.test('system:data'));
			expect(matches).toBe(true);
		});

		it('matches "system :data" (system with space)', () => {
			const matches = INJECTION_PATTERNS.some((p) => p.test('system :data'));
			expect(matches).toBe(true);
		});

		it('matches "<script>alert(1)</script>"', () => {
			const matches = INJECTION_PATTERNS.some((p) =>
				p.test('<script>alert(1)</script>')
			);
			expect(matches).toBe(true);
		});

		it('matches "javascript:void(0)"', () => {
			const matches = INJECTION_PATTERNS.some((p) =>
				p.test('javascript:void(0)')
			);
			expect(matches).toBe(true);
		});

		it('matches "eval(code)"', () => {
			const matches = INJECTION_PATTERNS.some((p) => p.test('eval(code)'));
			expect(matches).toBe(true);
		});

		it('rejects lesson with control char embedded', () => {
			const lesson = 'Always use TypeScript\x01for type safety';
			const result = validateLesson(lesson, [], {
				category: 'tooling',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result).toEqual({
				valid: false,
				layer: 2,
				reason: 'injection pattern detected',
				severity: 'error',
			});
		});
	});

	// =========================================================================
	// Layer 3 — Semantic Quality Checks
	// =========================================================================

	describe('Layer 3 - Semantic Quality', () => {
		it('detects contradiction with shared tags (blocks)', () => {
			const candidate = 'always use typescript';
			const existingLessons = ['never use typescript'];
			const result = validateLesson(candidate, existingLessons, {
				category: 'architecture',
				scope: 'global',
				confidence: 0.9,
			});
			expect(result).toEqual({
				valid: false,
				layer: 3,
				reason: 'lesson contradicts an existing lesson with shared tags',
				severity: 'error',
			});
		});

		it('passes contradiction without shared tags', () => {
			const candidate = 'always wake up early';
			const existingLessons = ['never wake up early'];
			const result = validateLesson(candidate, existingLessons, {
				category: 'process',
				scope: 'global',
				confidence: 0.9,
			});
			// Should pass because no tech tags (no shared tags)
			expect(result.valid).toBe(true);
		});

		it('flags vague lesson (warning - valid: true)', () => {
			const candidate = 'Good things happen';
			const result = validateLesson(candidate, [], {
				category: 'other',
				scope: 'global',
				confidence: 0.5,
			});
			expect(result).toEqual({
				valid: true,
				layer: 3,
				reason: 'lesson may be too vague (no tech reference or action verb)',
				severity: 'warning',
			});
		});

		it('accepts valid lesson with no warnings', () => {
			const candidate = 'Always use TypeScript strict mode for type safety';
			const result = validateLesson(candidate, [], {
				category: 'architecture',
				scope: 'global',
				confidence: 0.95,
			});
			expect(result).toEqual({
				valid: true,
				layer: null,
				reason: null,
				severity: null,
			});
		});
	});
});
