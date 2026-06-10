import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	readFileSync,
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { write_drift_evidence } from '../../../src/tools/write-drift-evidence';

let tempDir: string;

beforeEach(() => {
	tempDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'swarm-dve-')));
	mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

type ExecuteFn = (args: unknown, ctx: { directory: string }) => Promise<string>;

function run(args: unknown): Promise<string> {
	return (write_drift_evidence.execute as unknown as ExecuteFn)(args, {
		directory: tempDir,
	});
}

describe('write_drift_evidence provenance write-through', () => {
	test('persists provenance fields when provided', async () => {
		const out = await run({
			phase: 1,
			verdict: 'APPROVED',
			summary: 'Drift verification passed',
			provenanceAgentName: 'critic_drift_verifier',
			provenanceSessionId: 'sess-drift-123',
		});
		const parsed = JSON.parse(out);
		expect(parsed.success).toBe(true);

		// Read the evidence file directly
		const evidencePath = path.join(tempDir, '.swarm', 'evidence', '1');
		expect(existsSync(evidencePath)).toBe(true);

		const evidenceFile = path.join(evidencePath, 'drift-verifier.json');
		const content = readFileSync(evidenceFile, 'utf-8');
		const evidence = JSON.parse(content);

		expect(evidence.entries).toHaveLength(1);
		const entry = evidence.entries[0];
		expect(entry.provenance).toBeDefined();
		expect(entry.provenance.agent_name).toBe('critic_drift_verifier');
		expect(entry.provenance.session_id).toBe('sess-drift-123');
		expect(entry.provenance.captured_at).toBeDefined();
	});

	test('omits provenance when not provided', async () => {
		const out = await run({
			phase: 1,
			verdict: 'APPROVED',
			summary: 'Drift verification passed',
		});
		const parsed = JSON.parse(out);
		expect(parsed.success).toBe(true);

		const evidencePath = path.join(tempDir, '.swarm', 'evidence', '1');
		const evidenceFile = path.join(evidencePath, 'drift-verifier.json');
		const content = readFileSync(evidenceFile, 'utf-8');
		const evidence = JSON.parse(content);

		expect(evidence.entries[0].provenance).toBeUndefined();
	});

	test('persists provenance with only agent_name', async () => {
		const out = await run({
			phase: 1,
			verdict: 'APPROVED',
			summary: 'Drift verification passed',
			provenanceAgentName: 'critic_drift_verifier',
		});
		expect(JSON.parse(out).success).toBe(true);

		const evidencePath = path.join(tempDir, '.swarm', 'evidence', '1');
		const evidenceFile = path.join(evidencePath, 'drift-verifier.json');
		const content = readFileSync(evidenceFile, 'utf-8');
		const evidence = JSON.parse(content);

		const entry = evidence.entries[0];
		expect(entry.provenance).toBeDefined();
		expect(entry.provenance.agent_name).toBe('critic_drift_verifier');
		expect(entry.provenance.session_id).toBeUndefined();
		expect(entry.provenance.captured_at).toBeDefined();
	});
});
