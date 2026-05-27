import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	createEvidenceDocumentRecord,
	writeEvidenceDocuments,
} from '../../../src/evidence/documents';

describe('evidence document cache', () => {
	test('writes external docs to .swarm/evidence-cache with citeable refs', async () => {
		const tmpDir = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-evidence-docs-')),
		);
		try {
			const result = await writeEvidenceDocuments(
				tmpDir,
				[
					{
						sourceType: 'api_docs',
						query: 'vitest setup',
						title: 'Vitest Guide',
						url: 'https://example.test/vitest',
						text: 'Vitest runs frontend unit tests with describe and test.',
						createdBy: 'context7',
					},
				],
				() => new Date('2026-05-27T10:00:00.000Z'),
			);

			expect(result.path).toBe('.swarm/evidence-cache/documents.jsonl');
			expect(result.refs[0]).toMatch(/^evidence-cache:evd_[a-f0-9]{16}$/);

			const filePath = path.join(
				tmpDir,
				'.swarm',
				'evidence-cache',
				'documents.jsonl',
			);
			const rows = (await fs.readFile(filePath, 'utf-8'))
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line));

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				ref: result.refs[0],
				sourceType: 'api_docs',
				query: 'vitest setup',
				title: 'Vitest Guide',
				url: 'https://example.test/vitest',
				text: 'Vitest runs frontend unit tests with describe and test.',
				capturedAt: '2026-05-27T10:00:00.000Z',
				createdBy: 'context7',
			});
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('normalizes and redacts evidence text without creating memory records', () => {
		const record = createEvidenceDocumentRecord(
			{
				sourceType: 'web_search',
				query: 'credential handling',
				url: 'https://example.test/secrets',
				snippet:
					'Docs mention Authorization: Bearer abcdefghijklmnopqrstuvwxyz12345 across lines.',
			},
			'2026-05-27T10:00:00.000Z',
		);

		expect(record?.id).toMatch(/^evd_[a-f0-9]{16}$/);
		expect(record?.ref).toBe(`evidence-cache:${record?.id}`);
		expect(record?.text).toContain('[REDACTED:');
		expect(record?.text).not.toContain('abcdefghijklmnopqrstuvwxyz12345');
	});
});
