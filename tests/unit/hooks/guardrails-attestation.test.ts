import { beforeEach, describe, expect, it, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	type AttestationRecord,
	recordAttestation,
	validateAndRecordAttestation,
	validateAttestation,
} from '../../../src/hooks/guardrails';

describe('guardrails-attestation', () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create a temporary directory for each test
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attestation-test-'));
	});

	describe('AttestationRecord interface', () => {
		it('has all required fields', () => {
			const record: AttestationRecord = {
				findingId: 'finding-123',
				agent: 'architect',
				attestation:
					'This is a valid justification text that exceeds 30 characters',
				action: 'resolve',
				timestamp: new Date().toISOString(),
			};

			expect(record.findingId).toBe('finding-123');
			expect(record.agent).toBe('architect');
			expect(record.attestation).toBe(
				'This is a valid justification text that exceeds 30 characters',
			);
			expect(record.action).toBe('resolve');
			expect(record.timestamp).toBeDefined();
			expect(typeof record.timestamp).toBe('string');
		});

		it('accepts all action types', () => {
			const actions: Array<'resolve' | 'suppress' | 'defer'> = [
				'resolve',
				'suppress',
				'defer',
			];

			for (const action of actions) {
				const record: AttestationRecord = {
					findingId: 'test-id',
					agent: 'test-agent',
					attestation: 'This is a valid justification for the action',
					action,
					timestamp: new Date().toISOString(),
				};
				expect(record.action).toBe(action);
			}
		});
	});

	describe('validateAttestation', () => {
		it('rejects strings under 30 characters', () => {
			// Test with various lengths below 30
			const shortStrings = [
				'short', // 5 chars
				'not long enough', // 16 chars
				'123456789012345678901234567', // 27 chars
				'1234567890123456789012345678', // 28 chars
				'12345678901234567890123456789', // 29 chars
			];

			for (const attestation of shortStrings) {
				const result = validateAttestation(
					attestation,
					'finding-1',
					'architect',
					'resolve',
				);
				expect(result.valid).toBe(false);
				if (!result.valid) {
					expect(result.reason).toContain('too short');
					expect(result.reason).toContain('30');
				}
			}
		});

		it('accepts strings 30+ characters', () => {
			// Test with exactly 30 characters
			const exactly30 = '123456789012345678901234567890'; // 30 chars
			const result30 = validateAttestation(
				exactly30,
				'finding-1',
				'architect',
				'resolve',
			);
			expect(result30.valid).toBe(true);

			// Test with 31 characters
			const exactly31 = '1234567890123456789012345678901'; // 31 chars
			const result31 = validateAttestation(
				exactly31,
				'finding-1',
				'architect',
				'resolve',
			);
			expect(result31.valid).toBe(true);

			// Test with longer strings
			const longString =
				'This is a much longer and more detailed justification for resolving a finding in the system.';
			const resultLong = validateAttestation(
				longString,
				'finding-1',
				'architect',
				'resolve',
			);
			expect(resultLong.valid).toBe(true);
		});

		it('accepts strings at boundary (30 chars)', () => {
			const exactly30 = 'A12345678901234567890123456789'; // 30 chars
			const result = validateAttestation(
				exactly30,
				'finding-1',
				'architect',
				'resolve',
			);
			expect(result.valid).toBe(true);
		});

		it('rejects empty string', () => {
			const result = validateAttestation(
				'',
				'finding-1',
				'architect',
				'resolve',
			);
			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.reason).toContain('too short');
			}
		});
	});

	describe('attestation_rejected event logging', () => {
		it('logs attestation_rejected event on validation failure', async () => {
			const shortAttestation = 'too short';

			const result = await validateAndRecordAttestation(
				tempDir,
				'finding-123',
				'architect',
				shortAttestation,
				'resolve',
			);

			expect(result.valid).toBe(false);
			if (!result.valid) {
				expect(result.reason).toContain('too short');
			}

			// Check that events.jsonl was created with attestation_rejected event
			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');
			const content = await fs.readFile(eventsPath, 'utf-8');
			const lines = content.trim().split('\n');
			const lastEvent = JSON.parse(lines[lines.length - 1]);

			expect(lastEvent.event).toBe('attestation_rejected');
			expect(lastEvent.findingId).toBe('finding-123');
			expect(lastEvent.agent).toBe('architect');
			expect(lastEvent.length).toBe(shortAttestation.length);
			expect(lastEvent.reason).toContain('too short');
		});

		it('does not log rejected event when attestation is valid', async () => {
			const validAttestation =
				'This is a valid justification that exceeds 30 characters';

			const result = await validateAndRecordAttestation(
				tempDir,
				'finding-456',
				'architect',
				validAttestation,
				'suppress',
			);

			expect(result.valid).toBe(true);

			// Events file should not exist (no rejection occurred)
			const eventsPath = path.join(tempDir, '.swarm', 'events.jsonl');
			const exists = await fs
				.access(eventsPath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(false);
		});
	});

	describe('Record appended to attestations.jsonl on success', () => {
		it('appends record to attestations.jsonl on success', async () => {
			const validAttestation =
				'This is a valid justification that exceeds 30 characters for resolving a finding';

			const result = await validateAndRecordAttestation(
				tempDir,
				'finding-789',
				'reviewer',
				validAttestation,
				'resolve',
			);

			expect(result.valid).toBe(true);

			// Check that attestations.jsonl was created with the record
			const attestationsPath = path.join(
				tempDir,
				'.swarm',
				'evidence',
				'attestations.jsonl',
			);
			const content = await fs.readFile(attestationsPath, 'utf-8');
			const lines = content.trim().split('\n');
			const record = JSON.parse(lines[0]);

			expect(record.findingId).toBe('finding-789');
			expect(record.agent).toBe('reviewer');
			expect(record.attestation).toBe(validAttestation);
			expect(record.action).toBe('resolve');
			expect(record.timestamp).toBeDefined();
		});

		it('appends multiple records to same file', async () => {
			const validAtt1 =
				'This is the first valid justification text that is long enough';
			const validAtt2 =
				'This is the second valid justification text that is also long enough';

			await validateAndRecordAttestation(
				tempDir,
				'finding-1',
				'architect',
				validAtt1,
				'resolve',
			);
			await validateAndRecordAttestation(
				tempDir,
				'finding-2',
				'architect',
				validAtt2,
				'suppress',
			);

			const attestationsPath = path.join(
				tempDir,
				'.swarm',
				'evidence',
				'attestations.jsonl',
			);
			const content = await fs.readFile(attestationsPath, 'utf-8');
			const lines = content.trim().split('\n');

			expect(lines.length).toBe(2);

			const record1 = JSON.parse(lines[0]);
			const record2 = JSON.parse(lines[1]);

			expect(record1.findingId).toBe('finding-1');
			expect(record1.action).toBe('resolve');
			expect(record2.findingId).toBe('finding-2');
			expect(record2.action).toBe('suppress');
		});

		it('creates .swarm/evidence directory if not exists', async () => {
			const validAttestation =
				'This is a valid justification text that exceeds 30 characters';

			await validateAndRecordAttestation(
				tempDir,
				'finding-new',
				'test-agent',
				validAttestation,
				'defer',
			);

			const evidenceDir = path.join(tempDir, '.swarm', 'evidence');
			const stat = await fs.stat(evidenceDir);
			expect(stat.isDirectory()).toBe(true);
		});
	});

	describe('Cross-platform paths work', () => {
		it('handles paths with backslash separators', async () => {
			// Use temp dir but simulate Windows-style nested paths
			const nestedDir = path.join(tempDir, 'subdir\\nested\\path');
			await fs.mkdir(nestedDir, { recursive: true });

			const validAttestation =
				'This is a valid justification text that exceeds 30 characters';

			const result = await validateAndRecordAttestation(
				nestedDir,
				'finding-win',
				'architect',
				validAttestation,
				'resolve',
			);

			expect(result.valid).toBe(true);

			const attestationsPath = path.join(
				nestedDir,
				'.swarm',
				'evidence',
				'attestations.jsonl',
			);
			const content = await fs.readFile(attestationsPath, 'utf-8');
			const record = JSON.parse(content.trim().split('\n')[0]);
			expect(record.findingId).toBe('finding-win');
		});

		it('handles paths with forward slash separators', async () => {
			// Use temp dir but simulate Unix-style nested paths
			const nestedDir = path.join(tempDir, 'subdir/nested/path');
			await fs.mkdir(nestedDir, { recursive: true });

			const validAttestation =
				'This is a valid justification text that exceeds 30 characters';

			const result = await validateAndRecordAttestation(
				nestedDir,
				'finding-unix',
				'architect',
				validAttestation,
				'suppress',
			);

			expect(result.valid).toBe(true);

			const attestationsPath = path.join(
				nestedDir,
				'.swarm',
				'evidence',
				'attestations.jsonl',
			);
			const content = await fs.readFile(attestationsPath, 'utf-8');
			const record = JSON.parse(content.trim().split('\n')[0]);
			expect(record.findingId).toBe('finding-unix');
		});

		it('handles paths with spaces', async () => {
			const spacesTempDir = path.join(
				os.tmpdir(),
				'attestation test dir with spaces',
			);
			await fs.mkdir(spacesTempDir, { recursive: true });

			const validAttestation =
				'This is a valid justification text that exceeds 30 characters';

			const result = await validateAndRecordAttestation(
				spacesTempDir,
				'finding-spaces',
				'architect',
				validAttestation,
				'resolve',
			);

			expect(result.valid).toBe(true);

			// Cleanup
			await fs.rm(spacesTempDir, { recursive: true, force: true });
		});
	});
});
