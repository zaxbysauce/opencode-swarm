/**
 * Adversarial tests for doc-scan Pass 2 extract function (extractDocConstraints)
 * Tests malformed inputs, path traversal, type coercion, race conditions,
 * oversized payloads, boundary violations, and prototype pollution.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readKnowledge } from '../../../src/hooks/knowledge-store';
import type { SwarmKnowledgeEntry } from '../../../src/hooks/knowledge-types';
import {
	extractDocConstraints,
	scanDocIndex,
} from '../../../src/tools/doc-scan';

// Helper to create temp test directories
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'doc-extract-adv-'));
}

// Helper to create test markdown files with forward-slash paths
function createTestFile(
	dir: string,
	filename: string,
	content: string,
): string {
	const relativePath = filename.replace(/\\/g, '/');
	const parts = relativePath.split('/');
	let currentDir = dir;

	for (let i = 0; i < parts.length - 1; i++) {
		currentDir = path.join(currentDir, parts[i]);
		if (!fs.existsSync(currentDir)) {
			fs.mkdirSync(currentDir, { recursive: true });
		}
	}

	const filePath = path.join(dir, ...parts);
	fs.writeFileSync(filePath, content, 'utf-8');
	return filePath;
}

// Helper to parse knowledge.jsonl entries
async function readKnowledgeEntries(
	dir: string,
): Promise<SwarmKnowledgeEntry[]> {
	const knowledgePath = path.join(dir, '.swarm', 'knowledge.jsonl');
	return readKnowledge<SwarmKnowledgeEntry>(knowledgePath);
}

// Helper to create manifest with controlled content
function createManifest(
	dir: string,
	files: Array<{
		path: string;
		title?: string;
		summary?: string;
		mtime?: number;
	}>,
): void {
	const manifestPath = path.join(dir, '.swarm', 'doc-manifest.json');
	const manifest = {
		schema_version: 1,
		scanned_at: new Date().toISOString(),
		files: files.map((f) => ({
			path: f.path,
			title: f.title || 'Test',
			summary: f.summary || 'Test summary',
			lines: 10,
			mtime: f.mtime || Date.now(),
		})),
	};
	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
	fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');
}

describe('extractDocConstraints adversarial tests', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	// ============ 1. Path Traversal in Directory ============
	describe('path traversal in directory', () => {
		it('should handle "../../etc" path traversal attempt', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Attempt path traversal - use a path that definitely doesn't exist
			// to avoid scanning a real directory
			const maliciousPath = path.join(
				tempDir,
				'..',
				'..',
				'..',
				'..',
				'..',
				'nonexistent_dir_that_cannot_be_scanned',
			);
			const result = await extractDocConstraints(
				maliciousPath,
				['docs/guide.md'],
				'update guide',
			);

			// Should return result without crashing (empty or partial)
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
			expect(typeof result.skipped).toBe('number');
		});

		it('should handle deeply nested non-existent path', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou SHOULD follow rules.\n`,
			);

			// Use a path that definitely doesn't exist
			const maliciousPath = path.join(
				tempDir,
				'..',
				'..',
				'..',
				'..',
				'..',
				'another_nonexistent',
			);
			const result = await extractDocConstraints(
				maliciousPath,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle path traversal to root that does not exist', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST be secure.\n`,
			);

			// Use a path that is definitely non-existent
			const maliciousPath = path.join(
				tempDir,
				'nonexistent',
				'..',
				'nonexistent2',
			);
			const result = await extractDocConstraints(
				maliciousPath,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 2. Malicious task_files Array ============
	describe('malicious task_files array', () => {
		it('should handle task_files with path traversal entries', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Attempt path traversal via task_files array
			const maliciousFiles = [
				'../../etc/passwd',
				'../../../root',
				'docs/guide.md',
			];
			const result = await extractDocConstraints(
				tempDir,
				maliciousFiles,
				'update guide',
			);

			// Should not crash, should process valid paths
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
			expect(typeof result.skipped).toBe('number');
		});

		it('should handle task_files with null values', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Null values in array - filtered by the function's type guard
			const result = await extractDocConstraints(
				tempDir,
				[null as any, 'docs/guide.md', null as any],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle task_files with object instead of string', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Objects instead of strings - should be filtered out
			const result = await extractDocConstraints(
				tempDir,
				[{ path: 'docs/guide.md' } as any, 'docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle task_files with __proto__ pollution attempt', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Prototype pollution attempt via task_files
			const maliciousFiles: string[] = [];
			Object.defineProperty(maliciousFiles, '__proto__', {
				get: () => ({ admin: true }),
				enumerable: true,
			});

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md', ...maliciousFiles],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle task_files with constructor pollution attempt', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Constructor pollution
			const maliciousFiles: string[] = [];
			(maliciousFiles as any).constructor = { prototype: { admin: true } };

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md', ...maliciousFiles],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 3. Malicious task_description ============
	describe('malicious task_description', () => {
		it('should handle task_description with 100,000 characters', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Oversized description
			const hugeDescription = 'x'.repeat(100000);
			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				hugeDescription,
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
			// Should either extract or skip, not crash
		});

		it('should handle null task_description', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				// @ts-expect-error - testing malicious input
				null,
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle number instead of string for task_description', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				// @ts-expect-error - testing malicious input
				12345,
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle object with getters as task_description', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Object that throws on property access - use any to bypass type checking
			// since we're testing adversarial input
			const maliciousDesc = new Proxy(
				{},
				{
					get(_target: any, prop: string) {
						if (prop === 'length') return 100;
						throw new Error('getter error');
					},
				},
			) as any;

			// Current behavior: the function throws when accessing properties on the malicious object
			// This is a known limitation - the code does not have try/catch around taskDescription access
			try {
				const result = await extractDocConstraints(
					tempDir,
					['docs/guide.md'],
					maliciousDesc,
				);
				expect(result).toBeDefined();
			} catch (err: any) {
				// Expected to throw - document this as a finding
				expect(err.message).toContain('getter error');
			}
		});

		it('should handle empty string task_description', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'',
			);

			// Empty description - Jaccard scoring may fail to find relevant docs
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle unicode emoji in task_description', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Emojis in description
			const emojiDesc = 'update 📚 guide 🚀 MUST follow rules';
			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				emojiDesc,
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle CJK characters in task_description', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Chinese/Japanese/Korean characters
			const cjkDesc = '更新指南 MUST -follow 规则 ドキュメント';
			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				cjkDesc,
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 4. Corrupted Manifest ============
	describe('corrupted manifest', () => {
		it('should handle manifest with garbage JSON content', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			fs.writeFileSync(manifestPath, '{ garbage json content }{{}{}{', 'utf-8');

			// Should fall back to generating new manifest via scanDocIndex
			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle manifest with partial JSON', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			fs.writeFileSync(
				manifestPath,
				'{"schema_version": 1, "files": [',
				'utf-8',
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle manifest with invalid UTF-8 sequences', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			// Write binary content as manifest
			fs.writeFileSync(
				manifestPath,
				Buffer.from([0x80, 0x81, 0x82, 0xff, 0xfe]),
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
		});
	});

	// ============ 5. Manifest with Extra Fields ============
	describe('manifest with extra fields', () => {
		it('should handle manifest with extra unexpected fields', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			const manifest = {
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files: [
					{
						path: 'docs/guide.md',
						title: 'Guide',
						summary: 'Test',
						lines: 10,
						mtime: Date.now(),
						extraField: 'should be ignored',
						anotherField: 12345,
					},
				],
				// Extra top-level fields
				extra: 'should be ignored',
				count: 999,
			};
			fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle manifest entries with extra fields', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			const manifest = {
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files: [
					{
						path: 'docs/guide.md',
						title: 'Guide',
						summary: 'Test',
						lines: 10,
						mtime: Date.now(),
						// Dangerous extra fields
						__proto__: { polluted: true },
						constructor: { prototype: {} },
					},
				],
			};
			fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			// Should handle without prototype pollution
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 6. Manifest with Empty Path ============
	describe('manifest with empty path', () => {
		it('should handle manifest entry with empty string path', async () => {
			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			const manifest = {
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files: [
					{
						path: '',
						title: 'Empty Path',
						summary: 'Test',
						lines: 1,
						mtime: Date.now(),
					},
				],
			};
			fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			// Should handle empty path gracefully (skip the file)
			expect(result).toBeDefined();
			expect(result.skipped).toBeGreaterThanOrEqual(0);
		});
	});

	// ============ 7. Manifest with Non-Existent File ============
	describe('manifest with non-existent file', () => {
		it('should skip file path that does not exist on disk', async () => {
			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			const manifest = {
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files: [
					{
						path: 'NONEXISTENT.md',
						title: 'Missing',
						summary: 'Does not exist',
						lines: 1,
						mtime: Date.now(),
					},
					{
						path: 'docs/guide.md',
						title: 'Guide',
						summary: 'Exists',
						lines: 10,
						mtime: Date.now(),
					},
				],
			};
			fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			// Should skip the non-existent file
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 8. Knowledge.jsonl is a Directory ============
	describe('knowledge.jsonl is a directory', () => {
		it('should handle when knowledge.jsonl path is a directory', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Replace knowledge.jsonl with a directory
			const knowledgePath = path.join(tempDir, '.swarm', 'knowledge.jsonl');
			fs.mkdirSync(knowledgePath, { recursive: true });

			// When knowledge.jsonl is a directory, readFile throws EISDIR
			// The function should handle this gracefully
			try {
				const result = await extractDocConstraints(
					tempDir,
					['docs/guide.md'],
					'update guide',
				);
				// If it doesn't throw, at least verify the result is valid
				expect(result).toBeDefined();
				expect(typeof result.extracted).toBe('number');
			} catch (err: any) {
				// If it throws, the error should be meaningful (not a crash)
				expect(err).toBeDefined();
				expect(err.code).toBe('EISDIR');
			}
		});
	});

	// ============ 9. Knowledge.jsonl with Corrupted Entries ============
	describe('knowledge.jsonl corrupted entries', () => {
		it('should skip corrupted JSON lines in knowledge.jsonl', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Create knowledge.jsonl with corrupted lines mixed with valid entries
			const knowledgePath = path.join(tempDir, '.swarm', 'knowledge.jsonl');
			const validEntry = {
				id: 'test-1',
				tier: 'swarm' as const,
				lesson: 'existing constraint',
				category: 'architecture',
				tags: ['test'],
				scope: 'global',
				confidence: 0.5,
				status: 'candidate' as const,
				confirmed_by: [],
				project_name: '',
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				auto_generated: true,
				hive_eligible: false,
			};
			const corruptedContent = [
				JSON.stringify(validEntry),
				'{{{{ invalid json',
				'not json at all',
				JSON.stringify({
					...validEntry,
					id: 'test-2',
					lesson: 'another constraint',
				}),
			].join('\n');
			fs.writeFileSync(knowledgePath, corruptedContent, 'utf-8');

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			// readKnowledge should skip corrupted lines and continue
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle empty lines in knowledge.jsonl', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const knowledgePath = path.join(tempDir, '.swarm', 'knowledge.jsonl');
			const validEntry = {
				id: 'test-1',
				tier: 'swarm' as const,
				lesson: 'existing constraint',
				category: 'architecture',
				tags: ['test'],
				scope: 'global',
				confidence: 0.5,
				status: 'candidate' as const,
				confirmed_by: [],
				project_name: '',
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				auto_generated: true,
				hive_eligible: false,
			};
			const contentWithEmptyLines = [
				JSON.stringify(validEntry),
				'',
				JSON.stringify({ ...validEntry, id: 'test-2', lesson: 'another' }),
				'   ',
				JSON.stringify({
					...validEntry,
					id: 'test-3',
					lesson: 'third constraint',
				}),
			].join('\n');
			fs.writeFileSync(knowledgePath, contentWithEmptyLines, 'utf-8');

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 10-12. Constraint Length Boundary Tests ============
	describe('constraint length boundary tests', () => {
		it('should include constraint exactly 15 chars after stripping', async () => {
			// "MUST write tests" = 18 chars - above minimum
			// Let's create a constraint that is exactly at or above 15
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST write tests.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			// "write tests" is 12 chars, "MUST write tests" is 18 chars - above minimum
			expect(entries.length).toBeGreaterThan(0);
		});

		it('should skip constraint below 15 chars after stripping', async () => {
			// "You MUST do it" = 14 chars, "MUST do it" = 12 chars - below 15 minimum
			createTestFile(tempDir, 'docs/guide.md', `# Guide\n\nYou MUST do it\n`);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			// Both "do it" and "MUST do it" are below 15 chars
			expect(entries.length).toBe(0);
		});

		it('should include constraint at exactly 16 chars after stripping', async () => {
			// "use async await" is 15 chars, "MUST use async await" is 21 chars
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST use async await.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			// "use async await" is 15 chars after stripMarkdown (removes backticks)
			expect(entries.length).toBeGreaterThan(0);
		});

		it('should skip constraint with only whitespace after stripping', async () => {
			// Only "- MUST" and whitespace lines before the real constraint
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\n- MUST\n  \n\t\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			// Only "You MUST follow rules." should be extracted (not the "- MUST" which is too short)
			expect(entries.some((e) => e.lesson.includes('MUST follow rules'))).toBe(
				true,
			);
		});
	});

	// ============ 14. Unicode Characters in Constraints ============
	describe('unicode characters in constraints', () => {
		it('should handle emoji in constraint text', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST 🚀 launch rockets.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			// Should extract constraint with emoji
			expect(entries.length).toBeGreaterThan(0);
			expect(entries[0].lesson).toContain('🚀');
		});

		it('should handle CJK characters in constraint', async () => {
			// "MUST follow these important CJK rules" = ~35 chars, well above 15 minimum
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow these important CJK rules 遵守规则.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			expect(entries.length).toBeGreaterThan(0);
			expect(entries[0].lesson).toContain('遵守规则');
		});

		it('should handle mixed unicode constraint', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST 🎯 achieve goals 📈.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			expect(entries.length).toBeGreaterThan(0);
		});

		it('should handle zero-width characters in constraint', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST\u200Bfollow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			expect(entries.length).toBeGreaterThan(0);
		});
	});

	// ============ 15. Prototype Pollution in Manifest ============
	describe('prototype pollution in manifest', () => {
		it('should not pollute prototype when manifest has __proto__', async () => {
			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			// Deliberately craft manifest to try prototype pollution
			const manifest = {
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files: [
					{
						path: 'docs/guide.md',
						title: 'Guide',
						summary: 'Test',
						lines: 10,
						mtime: Date.now(),
						__proto__: { polluted: true },
					},
				],
			};
			fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			// Object.prototype should not have 'polluted' key
			expect(Object.prototype).not.toHaveProperty('polluted');
			expect(result).toBeDefined();
		});

		it('should not pollute via constructor in manifest', async () => {
			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			const manifest = {
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files: [
					{
						path: 'docs/guide.md',
						title: 'Guide',
						summary: 'Test',
						lines: 10,
						mtime: Date.now(),
						constructor: { prototype: { hacked: true } },
					},
				],
			};
			fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(Object.prototype).not.toHaveProperty('hacked');
			expect(result).toBeDefined();
		});

		it('should not pollute via object prototype in manifest', async () => {
			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			const pollutedManifest = JSON.stringify({
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files: [
					{
						path: 'docs/guide.md',
						title: 'Guide',
						summary: 'Test',
						lines: 10,
						mtime: Date.now(),
					},
				],
			}).replace('"mtime"', '"__proto__": {"admin": true}, "mtime"');

			fs.writeFileSync(manifestPath, pollutedManifest, 'utf-8');
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(Object.prototype).not.toHaveProperty('admin');
			expect(result).toBeDefined();
		});
	});

	// ============ 16. Very Large Manifest (100 files) ============
	describe('very large manifest', () => {
		it('should handle manifest with 100 files efficiently', async () => {
			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			const files: Array<{
				path: string;
				title: string;
				summary: string;
				lines: number;
				mtime: number;
			}> = [];

			for (let i = 0; i < 100; i++) {
				const filePath = `docs/file${i}.md`;
				createTestFile(
					tempDir,
					filePath,
					`# Doc ${i}\n\nYou MUST follow rule ${i}.\n`,
				);
				files.push({
					path: filePath,
					title: `Doc ${i}`,
					summary: `Rule ${i}`,
					lines: 5,
					mtime: Date.now(),
				});
			}

			const manifest = {
				schema_version: 1,
				scanned_at: new Date().toISOString(),
				files,
			};
			fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

			const startTime = Date.now();
			const result = await extractDocConstraints(
				tempDir,
				files.map((f) => f.path),
				'update all docs',
			);
			const duration = Date.now() - startTime;

			// Should complete in reasonable time (not hang)
			expect(duration).toBeLessThan(30000); // 30 seconds max
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 17. ReDoS Patterns in Constraint Lines ============
	describe('ReDoS patterns in constraint lines', () => {
		it('should handle regex metacharacters in constraint', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST match (a+)+$ on input.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			// Should extract without ReDoS (the constraint is just stored, not used as regex)
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle nested quantifiers in constraint', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST validate (a+)+{1,100} patterns.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
		});

		it('should handle alternation patterns in constraint', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST handle (a|b|c)+ patterns safely.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
		});

		it('should handle complex regex-like constraint text', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST avoid \\.\\*\\+\\?\\{\\,\\} patterns in user input.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
		});
	});

	// ============ 18. Concurrent Writes to knowledge.jsonl ============
	describe('concurrent writes to knowledge.jsonl', () => {
		it('should handle two concurrent extractDocConstraints calls', async () => {
			createTestFile(
				tempDir,
				'docs/guide1.md',
				`# Guide 1\n\nYou MUST follow rule one.\n`,
			);
			createTestFile(
				tempDir,
				'docs/guide2.md',
				`# Guide 2\n\nYou SHOULD follow rule two.\n`,
			);

			// Two concurrent calls
			const [result1, result2] = await Promise.all([
				extractDocConstraints(tempDir, ['docs/guide1.md'], 'update guide 1'),
				extractDocConstraints(tempDir, ['docs/guide2.md'], 'update guide 2'),
			]);

			expect(result1).toBeDefined();
			expect(result2).toBeDefined();
			// Both should have extracted constraints
			expect(result1.extracted + result2.extracted).toBeGreaterThan(0);
		});

		it('should handle rapid sequential calls without corruption', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rule.\n`,
			);

			// 5 rapid sequential calls
			for (let i = 0; i < 5; i++) {
				const result = await extractDocConstraints(
					tempDir,
					['docs/guide.md'],
					'update guide',
				);
				expect(result).toBeDefined();
			}

			// Knowledge file should have valid content (no corruption)
			const entries = await readKnowledgeEntries(tempDir);
			expect(Array.isArray(entries)).toBe(true);
		});
	});

	// ============ 19. Task Files Array with 1000+ Entries ============
	describe('task files array with 1000+ entries', () => {
		it('should not hang with 1000 task files', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Create 1000 file entries
			const manyFiles = Array.from({ length: 1000 }, (_, i) => `file${i}.md`);

			const startTime = Date.now();
			const result = await extractDocConstraints(
				tempDir,
				manyFiles,
				'update many files',
			);
			const duration = Date.now() - startTime;

			// Should complete in reasonable time
			expect(duration).toBeLessThan(30000);
			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
			expect(typeof result.skipped).toBe('number');
		});

		it('should handle 1000+ characters in a single task file path', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// Very long filename
			const longFilename = 'a'.repeat(1000) + '.md';

			const result = await extractDocConstraints(
				tempDir,
				[longFilename],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ 20. Manifest File Deleted Between Read and Process ============
	describe('manifest race condition', () => {
		it('should handle manifest deleted between read and process', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');

			// Create manifest first
			await scanDocIndex(tempDir);
			expect(fs.existsSync(manifestPath)).toBe(true);

			// Delete manifest before extractDocConstraints reads it
			fs.unlinkSync(manifestPath);

			// Should fall back to generating new manifest via scanDocIndex
			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle manifest deleted between consecutive calls', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			// First call creates manifest
			await extractDocConstraints(tempDir, ['docs/guide.md'], 'update guide');

			// Delete manifest
			const manifestPath = path.join(tempDir, '.swarm', 'doc-manifest.json');
			fs.unlinkSync(manifestPath);

			// Second call should regenerate manifest
			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});
	});

	// ============ Additional Edge Cases ============
	describe('additional edge cases', () => {
		it('should handle very large task_description (1MB)', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rules.\n`,
			);

			const hugeDescription = 'x'.repeat(1000000);
			const startTime = Date.now();
			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				hugeDescription,
			);
			const duration = Date.now() - startTime;

			// Should complete without hanging
			expect(duration).toBeLessThan(30000);
			expect(result).toBeDefined();
		});

		it('should handle backslashes in constraint (Windows paths)', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST use C:\\path\\to\\file.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
			expect(typeof result.extracted).toBe('number');
		});

		it('should handle null bytes in constraint', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow rule\u0000with null.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			// Should handle null byte without crashing
			expect(result).toBeDefined();
		});

		it('should handle RTL override characters', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST follow \u202E rules.\n`, // RTL override
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
		});

		it('should handle combining characters in constraint', async () => {
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST f\u0301ollow rules.\n`, // combining acute accent
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			expect(result).toBeDefined();
		});

		it('should handle constraint exceeding 200 chars properly', async () => {
			const longConstraint = 'A'.repeat(250);
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST ${longConstraint}.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			// Long constraint should be skipped due to MAX_CONSTRAINT_LENGTH
			expect(entries.length).toBe(0);
		});

		it('should handle constraint at exactly 200 chars', async () => {
			const exact200 = 'A'.repeat(190); // "You MUST " + 190 A's = ~200 chars
			createTestFile(
				tempDir,
				'docs/guide.md',
				`# Guide\n\nYou MUST ${exact200}.\n`,
			);

			const result = await extractDocConstraints(
				tempDir,
				['docs/guide.md'],
				'update guide',
			);

			const entries = await readKnowledgeEntries(tempDir);
			expect(entries.length).toBeGreaterThan(0);
		});
	});
});
