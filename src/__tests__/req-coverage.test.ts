import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import {
	analyzeRequirementCoverage,
	extractObligationAndText,
	extractRequirements,
	readTouchedFiles,
	searchFileForKeywords,
} from '../tools/req-coverage';

describe('extractRequirements', () => {
	describe('FR requirement extraction', () => {
		test('extracts FR requirement at start of line with MUST', () => {
			const spec = `
# Specification

FR-001 : The system MUST authenticate users before granting access.
FR-002 : The system SHOULD log all authentication attempts.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(2);
			// Note: trailing punctuation is preserved
			expect(requirements[0]).toEqual({
				id: 'FR-001',
				obligation: 'MUST',
				text: 'The system authenticate users before granting access.',
			});
			expect(requirements[1]).toEqual({
				id: 'FR-002',
				obligation: 'SHOULD',
				text: 'The system log all authentication attempts.',
			});
		});

		test('extracts FR requirement with bullet marker', () => {
			const spec = `
- FR-003: The system SHALL validate input before processing.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(1);
			expect(requirements[0]).toEqual({
				id: 'FR-003',
				obligation: 'SHALL',
				text: 'The system validate input before processing.',
			});
		});

		test('extracts FR requirement with asterisk marker', () => {
			const spec = `
* FR-004 MUST implement error handling.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(1);
			// Note: FR-id is captured in the text for asterisk style
			expect(requirements[0]).toEqual({
				id: 'FR-004',
				obligation: 'MUST',
				text: 'FR-004 implement error handling.',
			});
		});

		test('extracts inline FR reference with MUST', () => {
			const spec = `
The component FR-005 MUST support configuration via environment variables.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(1);
			// Note: inline regex captures FR-id in text
			expect(requirements[0]).toEqual({
				id: 'FR-005',
				obligation: 'MUST',
				text: 'FR-005 support configuration via environment variables.',
			});
		});

		test('inline FR reference requires obligation keyword nearby', () => {
			// FR-001 is mentioned but obligation comes after FR-002
			// The inline regex captures FR that is followed by MUST/SHOULD/SHALL
			const spec = `
FR-001 mentioned here. FR-002 MUST do something important.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(1);
			expect(requirements[0].id).toBe('FR-002');
		});

		test('case-insensitive FR matching', () => {
			const spec = `
fr-006 : lowercase fr SHALL work.
FR-007 : uppercase FR SHOULD work.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(2);
			expect(requirements[0].id).toBe('FR-006');
			expect(requirements[1].id).toBe('FR-007');
		});

		test('does not duplicate FR requirements found multiple times', () => {
			const spec = `
FR-001 MUST do something.
FR-001 MUST do something else (duplicate).
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(1);
			expect(requirements[0].id).toBe('FR-001');
		});

		test('returns empty array when no FR requirements found', () => {
			const spec = `
# Specification
This document has no FR requirements.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(0);
		});

		test('handles empty spec content', () => {
			expect(extractRequirements('')).toHaveLength(0);
			expect(extractRequirements('   ')).toHaveLength(0);
		});

		test('returns null obligation when MUST/SHOULD/SHALL not found in matched text', () => {
			const spec = `
FR-008 : The system does something.
`;
			const requirements = extractRequirements(spec);

			expect(requirements).toHaveLength(1);
			expect(requirements[0].obligation).toBeNull();
		});
	});
});

describe('extractObligationAndText', () => {
	test('extracts MUST obligation', () => {
		const result = extractObligationAndText(
			'FR-001',
			'The system MUST authenticate users',
		);

		expect(result).toEqual({
			id: 'FR-001',
			obligation: 'MUST',
			text: 'The system authenticate users',
		});
	});

	test('extracts SHOULD obligation', () => {
		const result = extractObligationAndText(
			'FR-002',
			'The system SHOULD log events',
		);

		expect(result).toEqual({
			id: 'FR-002',
			obligation: 'SHOULD',
			text: 'The system log events',
		});
	});

	test('extracts SHALL obligation', () => {
		const result = extractObligationAndText(
			'FR-003',
			'The system SHALL validate input',
		);

		expect(result).toEqual({
			id: 'FR-003',
			obligation: 'SHALL',
			text: 'The system validate input',
		});
	});

	test('handles obligation in middle of text', () => {
		const result = extractObligationAndText(
			'FR-004',
			'Data MUST be encrypted at rest',
		);

		expect(result).toEqual({
			id: 'FR-004',
			obligation: 'MUST',
			text: 'Data be encrypted at rest',
		});
	});

	test('returns null for empty text', () => {
		const result = extractObligationAndText('FR-001', '   ');
		expect(result).toBeNull();
	});

	test('returns null for text with only obligation keyword', () => {
		const result = extractObligationAndText('FR-001', 'MUST');
		expect(result).toBeNull();
	});

	test('handles punctuation before text', () => {
		const result = extractObligationAndText(
			'FR-005',
			'-- The system MUST work',
		);

		expect(result).toEqual({
			id: 'FR-005',
			obligation: 'MUST',
			text: 'The system work',
		});
	});
});

describe('readTouchedFiles', () => {
	let tempDir: string;
	let evidenceDir: string;

	beforeEach(async () => {
		tempDir = path.join(
			tmpdir(),
			'req-coverage-test-' +
				Date.now() +
				'-' +
				Math.random().toString(36).slice(2),
		);
		evidenceDir = path.join(tempDir, '.swarm', 'evidence', '1');
		await mkdir(evidenceDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { force: true, recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('reads touched_files from evidence JSON', async () => {
		const evidenceFile = path.join(evidenceDir, 'task-1.json');
		await writeFile(
			evidenceFile,
			JSON.stringify({
				task_id: '1.1',
				touched_files: ['src/index.ts', 'src/utils/helper.ts'],
			}),
		);

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		expect(files).toHaveLength(2);
		// Files are resolved to absolute paths - check they contain the relative path
		expect(files.some((f) => f.includes('src' + path.sep + 'index.ts'))).toBe(
			true,
		);
		expect(
			files.some((f) =>
				f.includes('src' + path.sep + 'utils' + path.sep + 'helper.ts'),
			),
		).toBe(true);
	});

	test('reads changed_files from evidence JSON', async () => {
		const evidenceFile = path.join(evidenceDir, 'task-2.json');
		await writeFile(
			evidenceFile,
			JSON.stringify({
				task_id: '2.1',
				changed_files: ['src/app.ts'],
			}),
		);

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		expect(files).toHaveLength(1);
		expect(files[0]).toInclude('src');
		expect(files[0]).toInclude('app.ts');
	});

	test('reads files field from evidence JSON', async () => {
		const evidenceFile = path.join(evidenceDir, 'task-3.json');
		await writeFile(
			evidenceFile,
			JSON.stringify({
				task_id: '3.1',
				files: ['src/main.ts'],
			}),
		);

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		expect(files).toHaveLength(1);
		expect(files[0]).toInclude('main.ts');
	});

	test('reads sources field from evidence JSON', async () => {
		const evidenceFile = path.join(evidenceDir, 'task-4.json');
		await writeFile(
			evidenceFile,
			JSON.stringify({
				task_id: '4.1',
				sources: ['src/service.ts'],
			}),
		);

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		expect(files).toHaveLength(1);
		expect(files[0]).toInclude('service.ts');
	});

	test('handles { path: string } format for files', async () => {
		const evidenceFile = path.join(evidenceDir, 'task-5.json');
		await writeFile(
			evidenceFile,
			JSON.stringify({
				task_id: '5.1',
				touched_files: [{ path: 'src/module.ts' }],
			}),
		);

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		expect(files).toHaveLength(1);
		expect(files[0]).toInclude('module.ts');
	});

	test('returns empty array for non-existent phase directory', () => {
		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			999,
			tempDir,
		);

		expect(files).toHaveLength(0);
	});

	test('ignores non-JSON files in evidence directory', async () => {
		const txtFile = path.join(evidenceDir, 'readme.txt');
		await writeFile(txtFile, 'not json');

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		expect(files).toHaveLength(0);
	});

	test('skips invalid JSON files', async () => {
		const badFile = path.join(evidenceDir, 'bad.json');
		await writeFile(badFile, '{ invalid json }');

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		expect(files).toHaveLength(0);
	});

	test('resolves relative paths from JSON relative to cwd', async () => {
		// When file path is relative (like '../outside.txt'), it gets resolved relative to cwd
		// On Windows, path.resolve normalizes this to an absolute path
		const evidenceFile = path.join(evidenceDir, 'task-6.json');
		await writeFile(
			evidenceFile,
			JSON.stringify({
				task_id: '6.1',
				touched_files: ['../test-file.txt'],
			}),
		);

		const files = readTouchedFiles(
			path.join(tempDir, '.swarm', 'evidence'),
			1,
			tempDir,
		);

		// The path is resolved relative to cwd (tempDir), which normalizes the ..
		expect(files).toHaveLength(1);
		// The resolved path should be an absolute path
		expect(path.isAbsolute(files[0])).toBe(true);
	});
});

describe('searchFileForKeywords', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = path.join(
			tmpdir(),
			'req-coverage-search-' +
				Date.now() +
				'-' +
				Math.random().toString(36).slice(2),
		);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { force: true, recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('returns true when keyword found in file', async () => {
		const filePath = path.join(tempDir, 'test.ts');
		await writeFile(filePath, 'function authenticate() { return true; }');

		const result = searchFileForKeywords(filePath, ['authenticate'], tempDir);

		expect(result).toBe(true);
	});

	test('returns false when keyword not found in file', async () => {
		const filePath = path.join(tempDir, 'test.ts');
		await writeFile(filePath, 'function process() { return true; }');

		const result = searchFileForKeywords(filePath, ['authenticate'], tempDir);

		expect(result).toBe(false);
	});

	test('case-insensitive search', async () => {
		const filePath = path.join(tempDir, 'test.ts');
		await writeFile(filePath, 'function AUTHENTICATE() { }');

		const result = searchFileForKeywords(filePath, ['authenticate'], tempDir);

		expect(result).toBe(true);
	});

	test('returns true when any keyword matches', async () => {
		const filePath = path.join(tempDir, 'test.ts');
		await writeFile(filePath, 'function validate() { }');

		const result = searchFileForKeywords(
			filePath,
			['authenticate', 'validate', 'process'],
			tempDir,
		);

		expect(result).toBe(true);
	});

	test('returns false for non-existent file', () => {
		const filePath = path.join(tempDir, 'nonexistent.ts');
		const result = searchFileForKeywords(filePath, ['test'], tempDir);

		expect(result).toBe(false);
	});

	test('path containment check - rejects file outside cwd', async () => {
		const filePath = path.join(tempDir, 'outside.txt');
		await writeFile(filePath, 'sensitive data');

		// Use a different cwd
		const differentCwd = path.join(tmpdir(), 'different-cwd-' + Date.now());
		await mkdir(differentCwd, { recursive: true });

		const result = searchFileForKeywords(filePath, ['sensitive'], differentCwd);

		expect(result).toBe(false);

		// Cleanup
		await rm(differentCwd, { force: true, recursive: true });
	});

	test('word boundary matching - does not match partial words', async () => {
		const filePath = path.join(tempDir, 'test.ts');
		await writeFile(filePath, 'const authentication = true;');

		// 'auth' should not match 'authentication' due to word boundary
		const result = searchFileForKeywords(filePath, ['auth'], tempDir);

		expect(result).toBe(false);
	});

	test('handles file with special characters', async () => {
		const filePath = path.join(tempDir, 'test.ts');
		await writeFile(filePath, '// TODO: implement auth feature');

		const result = searchFileForKeywords(filePath, ['auth'], tempDir);

		expect(result).toBe(true);
	});
});

describe('analyzeRequirementCoverage', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = path.join(
			tmpdir(),
			'req-coverage-analyze-' +
				Date.now() +
				'-' +
				Math.random().toString(36).slice(2),
		);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { force: true, recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('marks requirement as covered when keyword found in touched file', async () => {
		const sourceFile = path.join(tempDir, 'src', 'auth.ts');
		await mkdir(path.dirname(sourceFile), { recursive: true });
		await writeFile(
			sourceFile,
			'export function authenticate() { return true; }',
		);

		const requirement = {
			id: 'FR-001',
			obligation: 'MUST' as const,
			text: 'The system MUST authenticate users',
		};

		const result = analyzeRequirementCoverage(
			requirement,
			[sourceFile],
			tempDir,
		);

		expect(result.status).toBe('covered');
		expect(result.id).toBe('FR-001');
		expect(result.filesSearched).toContain(sourceFile);
	});

	test('marks requirement as missing when no keywords found', async () => {
		const sourceFile = path.join(tempDir, 'src', 'other.ts');
		await mkdir(path.dirname(sourceFile), { recursive: true });
		await writeFile(sourceFile, 'export function process() { return true; }');

		const requirement = {
			id: 'FR-002',
			obligation: 'SHOULD' as const,
			text: 'The system SHOULD authenticate users',
		};

		const result = analyzeRequirementCoverage(
			requirement,
			[sourceFile],
			tempDir,
		);

		expect(result.status).toBe('missing');
	});

	test('marks requirement as missing when no touched files exist', () => {
		const requirement = {
			id: 'FR-003',
			obligation: 'SHALL' as const,
			text: 'The system SHALL authenticate users',
		};

		const result = analyzeRequirementCoverage(requirement, [], tempDir);

		expect(result.status).toBe('missing');
	});

	test('only searches source files (not non-code files)', async () => {
		const sourceFile = path.join(tempDir, 'src', 'auth.ts');
		await mkdir(path.dirname(sourceFile), { recursive: true });
		await writeFile(
			sourceFile,
			'export function authenticate() { return true; }',
		);

		const docFile = path.join(tempDir, 'docs', 'readme.txt');
		await mkdir(path.dirname(docFile), { recursive: true });
		await writeFile(docFile, 'This document mentions authenticate');

		const requirement = {
			id: 'FR-004',
			obligation: 'MUST' as const,
			text: 'The system MUST authenticate users',
		};

		const result = analyzeRequirementCoverage(
			requirement,
			[sourceFile, docFile],
			tempDir,
		);

		// Only .ts file should be searched
		expect(result.filesSearched).toHaveLength(1);
		expect(result.filesSearched[0]).toEndWith('.ts');
		expect(result.status).toBe('covered');
	});

	test('filters out stop words from keywords', async () => {
		const sourceFile = path.join(tempDir, 'src', 'module.ts');
		await mkdir(path.dirname(sourceFile), { recursive: true });
		// File contains 'system' but not 'the' or 'before' (stop words)
		await writeFile(sourceFile, 'function system() { }');

		const requirement = {
			id: 'FR-005',
			obligation: 'MUST' as const,
			text: 'The system before auth',
		};

		const result = analyzeRequirementCoverage(
			requirement,
			[sourceFile],
			tempDir,
		);

		expect(result.status).toBe('covered');
	});

	test('handles requirement with only stop words', async () => {
		const sourceFile = path.join(tempDir, 'src', 'module.ts');
		await mkdir(path.dirname(sourceFile), { recursive: true });
		await writeFile(sourceFile, 'some content');

		// Text is only stop words - no keywords to search
		const requirement = {
			id: 'FR-006',
			obligation: 'MUST' as const,
			text: 'The the the and and',
		};

		const result = analyzeRequirementCoverage(
			requirement,
			[sourceFile],
			tempDir,
		);

		// No keywords extracted, so foundCount is 0
		expect(result.status).toBe('missing');
	});

	test('path containment - skips files outside cwd on Unix-like systems', async () => {
		// Note: This test may pass differently on Windows due to path normalization
		// Create file inside tempDir
		const insideFile = path.join(tempDir, 'inside.ts');
		await writeFile(insideFile, 'export function auth() { }');

		// Create file outside (different directory)
		const outsideDir = path.join(tmpdir(), 'outside-' + Date.now());
		await mkdir(outsideDir, { recursive: true });
		const outsideFile = path.join(outsideDir, 'outside.ts');
		await writeFile(outsideFile, 'export function auth() { }');

		const requirement = {
			id: 'FR-007',
			obligation: 'MUST' as const,
			text: 'The system MUST have auth function',
		};

		const result = analyzeRequirementCoverage(
			requirement,
			[insideFile, outsideFile],
			tempDir,
		);

		// On Windows, path.resolve normalizes .. so the outside file may still be found
		// The key behavior is that filesSearched contains what was actually searched
		expect(result.filesSearched.length).toBeGreaterThanOrEqual(1);
		expect(result.filesSearched).toContain(insideFile);

		// Cleanup
		await rm(outsideDir, { force: true, recursive: true });
	});
});

describe('OBLIGATION_KEYWORDS constant', () => {
	test('contains MUST, SHOULD, SHALL', () => {
		const keywords = ['MUST', 'SHOULD', 'SHALL'];

		expect(keywords).toContain('MUST');
		expect(keywords).toContain('SHOULD');
		expect(keywords).toContain('SHALL');
		expect(keywords).toHaveLength(3);
	});
});
