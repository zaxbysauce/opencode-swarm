import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AGENT_TOOL_MAP } from '../../src/config/constants';
import { extractDocConstraints, scanDocIndex } from '../../src/tools/doc-scan';

describe('doc scan auto-trigger', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-scan-wiring-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test('scanDocIndex produces a manifest when docs exist', async () => {
		// Create a doc file
		fs.writeFileSync(
			path.join(tmpDir, 'README.md'),
			'# Test Project\n\nThis is a test project for doc scanning.\n',
		);

		const { manifest, cached } = await scanDocIndex(tmpDir);
		expect(cached).toBe(false);
		expect(manifest.schema_version).toBe(1);
		expect(manifest.files.length).toBeGreaterThan(0);
		expect(manifest.files[0].title).toBe('Test Project');
	});

	test('manifest is cached and not regenerated when files unchanged', async () => {
		fs.writeFileSync(
			path.join(tmpDir, 'README.md'),
			'# Cached Test\n\nShould be cached on second call.\n',
		);

		const first = await scanDocIndex(tmpDir);
		expect(first.cached).toBe(false);

		const second = await scanDocIndex(tmpDir);
		expect(second.cached).toBe(true);
		expect(second.manifest.files.length).toBe(first.manifest.files.length);
	});

	test('scanDocIndex does not throw on empty directory', async () => {
		const { manifest, cached } = await scanDocIndex(tmpDir);
		expect(cached).toBe(false);
		expect(manifest.files).toEqual([]);
	});
});

describe('doc extract wiring', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-extract-wiring-'));
		// Create .swarm directory for knowledge storage
		fs.mkdirSync(path.join(tmpDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test('doc_extract is callable by architect agent', () => {
		const architectTools = AGENT_TOOL_MAP.architect;
		expect(architectTools).toContain('doc_extract');
	});

	test('doc_scan is callable by explorer agent', () => {
		const explorerTools = AGENT_TOOL_MAP.explorer;
		expect(explorerTools).toContain('doc_scan');
	});

	test('doc_extract produces knowledge entries from relevant docs', async () => {
		// Create a docs directory with actionable constraints
		fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
		fs.writeFileSync(
			path.join(tmpDir, 'docs', 'contributing.md'),
			'# Contributing Guidelines\n\nYou MUST follow conventional commits for all changes.\nYou MUST NOT push directly to main branch.\nALWAYS run tests before submitting pull requests.\nNEVER skip the review process.\n',
		);

		// Generate manifest first
		await scanDocIndex(tmpDir);

		// Extract constraints — use overlapping terms so Jaccard scores above threshold
		const result = await extractDocConstraints(
			tmpDir,
			['docs/contributing.md'],
			'contributing guidelines conventional commits review process',
		);

		expect(result.extracted).toBeGreaterThan(0);
		expect(result.details.length).toBeGreaterThan(0);
		expect(result.details[0].constraints.length).toBeGreaterThan(0);
	});
});
