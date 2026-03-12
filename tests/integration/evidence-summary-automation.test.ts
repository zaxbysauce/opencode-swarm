import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { AutomationConfigSchema } from '../../src/config/schema';
import { handleEvidenceSummaryCommand } from '../../src/services/evidence-service';

describe('Evidence Summary Automation', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create a temp directory for each test
		tempDir = mkdtempSync(path.join(tmpdir(), 'evidence-summary-test-'));
	});

	afterEach(() => {
		// Clean up temp directory after each test
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe('Integration initialization conditions', () => {
		it('Integration initializes when enabled (hybrid mode + evidence_auto_summaries=true)', () => {
			const config = AutomationConfigSchema.parse({
				mode: 'hybrid',
				capabilities: { evidence_auto_summaries: true },
			});

			const shouldInitialize =
				config.mode !== 'manual' && config.capabilities?.evidence_auto_summaries === true;

			expect(shouldInitialize).toBe(true);
		});

		it('Integration skips when disabled (mode=manual)', () => {
			const config = AutomationConfigSchema.parse({
				mode: 'manual',
				capabilities: { evidence_auto_summaries: true },
			});

			const shouldInitialize =
				config.mode !== 'manual' && config.capabilities?.evidence_auto_summaries === true;

			expect(shouldInitialize).toBe(false);
		});

		it('Integration skips when flag is false (evidence_auto_summaries=false)', () => {
			const config = AutomationConfigSchema.parse({
				mode: 'hybrid',
				capabilities: { evidence_auto_summaries: false },
			});

			const shouldInitialize =
				config.mode !== 'manual' && config.capabilities?.evidence_auto_summaries === true;

			expect(shouldInitialize).toBe(false);
		});

		it('Default config (v6.8) enables evidence_auto_summaries', () => {
			const config = AutomationConfigSchema.parse({});

			expect(config.capabilities?.evidence_auto_summaries).toBe(true);
		});
	});

	describe('handleEvidenceSummaryCommand', () => {
		it('works regardless of flag - returns gracefully with no swarm folder', async () => {
			// tempDir has no .swarm/ folder, simulating a fresh directory
			const result = await handleEvidenceSummaryCommand(tempDir);

			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
			// Should return either "No plan found" or similar message
			expect(
				result.includes('No plan found') ||
					result.includes('No active swarm plan') ||
					result.includes('Evidence Summary'),
			).toBe(true);
		});
	});
});
