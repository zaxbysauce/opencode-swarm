import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { createToolSummarizerHook, resetSummaryIdCounter } from '../../src/hooks/tool-summarizer';
import { handleRetrieveCommand } from '../../src/commands/retrieve';
import type { SummaryConfig } from '../../src/config/schema';
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Default configuration helper
 */
function defaultConfig(overrides?: Partial<SummaryConfig>): SummaryConfig {
	return {
		enabled: true,
		threshold_bytes: 1024,
		max_summary_chars: 1000,
		max_stored_bytes: 10485760,
		retention_days: 7,
		exempt_tools: ['retrieve_summary', 'task'],
		...overrides,
	};
}

describe('summarization loop fix integration', () => {
	let tempDir: string;

	beforeEach(() => {
		// Reset summary ID counter before each test
		resetSummaryIdCounter();

		// Create temporary directory for test
		tempDir = join(tmpdir(), `summarization-loop-test-${Date.now()}`);
		mkdirSync(join(tempDir, '.swarm'), { recursive: true });
	});

	afterEach(() => {
		// Clean up temporary directory
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('main loop prevention: retrieve_summary output is never summarized', async () => {
		// Arrange: Create hook with default config
		const config = defaultConfig();
		const hook = createToolSummarizerHook(config, tempDir);

		// Create a large bash output (2000 bytes - above 1024 threshold)
		const bashOutput = 'line'.repeat(500); // ~2000 bytes
		expect(bashOutput.length).toBeGreaterThan(config.threshold_bytes);

		// Step 1: Summarize bash output → S1 stored, output replaced with summary text
		const bashInput = {
			tool: 'bash',
			sessionID: 'test-session',
			callID: 'test-call-1',
		};
		const bashOutputObj = {
			title: 'bash output',
			output: bashOutput,
			metadata: {},
		};

		await hook(bashInput, bashOutputObj);

		// Verify S1 was created and bash output was replaced
		expect(bashOutputObj.output).not.toBe(bashOutput); // Should be replaced
		expect(bashOutputObj.output).toContain('[SUMMARY S1]');
		const summaryDir = join(tempDir, '.swarm', 'summaries');
		expect(existsSync(join(summaryDir, 'S1.json'))).toBe(true);

		const summaryText = bashOutputObj.output;

		// Step 2: Simulate what happens when retrieve_summary runs
		// Call the hook again but with input.tool = 'retrieve_summary' and output.output = summaryText
		const retrieveInput = {
			tool: 'retrieve_summary',
			sessionID: 'test-session',
			callID: 'test-call-2',
		};
		const retrieveOutputObj = {
			title: 'retrieve_summary output',
			output: summaryText, // This is the S1 summary text
			metadata: {},
		};

		await hook(retrieveInput, retrieveOutputObj);

		// Assert: output.output is UNCHANGED (still the summary text, not a new S2)
		expect(retrieveOutputObj.output).toBe(summaryText);

		// Assert: Only ONE summary file exists in .swarm/summaries/
		const summaryFiles = readdirSync(summaryDir).filter((f) => f.endsWith('.json'));
		expect(summaryFiles.length).toBe(1);
		expect(summaryFiles[0]).toBe('S1.json');

		// Verify S2.json does not exist
		expect(existsSync(join(summaryDir, 'S2.json'))).toBe(false);
	});

	test('task tool output is never summarized', async () => {
		// Arrange: Create hook with default config
		const config = defaultConfig();
		const hook = createToolSummarizerHook(config, tempDir);

		// Create a large task output (2000 bytes - above 1024 threshold)
		const taskOutput = 'task line'.repeat(250); // ~2000 bytes
		expect(taskOutput.length).toBeGreaterThan(config.threshold_bytes);

		// Call hook with input.tool = 'task' and large output
		const taskInput = {
			tool: 'task',
			sessionID: 'test-session',
			callID: 'test-call',
		};
		const taskOutputObj = {
			title: 'task output',
			output: taskOutput,
			metadata: {},
		};

		await hook(taskInput, taskOutputObj);

		// Assert: output.output unchanged, no summary file created
		expect(taskOutputObj.output).toBe(taskOutput);

		const summaryDir = join(tempDir, '.swarm', 'summaries');
		// Check if summaries directory exists (it won't be created if no summarization occurred)
		if (existsSync(summaryDir)) {
			const summaryFiles = readdirSync(summaryDir).filter((f) => f.endsWith('.json'));
			expect(summaryFiles.length).toBe(0);
		} else {
			// Directory doesn't exist, which is also correct
			expect(true).toBe(true);
		}
	});

	test('non-exempt tool IS summarized (control test)', async () => {
		// Arrange: Create hook with default config
		const config = defaultConfig();
		const hook = createToolSummarizerHook(config, tempDir);

		// Create a large bash output (2000 bytes - above 1024 threshold)
		const bashOutput = 'line'.repeat(500); // ~2000 bytes
		expect(bashOutput.length).toBeGreaterThan(config.threshold_bytes);

		// Call hook with input.tool = 'bash' and large output
		const bashInput = {
			tool: 'bash',
			sessionID: 'test-session',
			callID: 'test-call',
		};
		const bashOutputObj = {
			title: 'bash output',
			output: bashOutput,
			metadata: {},
		};

		await hook(bashInput, bashOutputObj);

		// Assert: output replaced with summary
		expect(bashOutputObj.output).not.toBe(bashOutput);
		expect(bashOutputObj.output).toContain('[SUMMARY S1]');
		expect(bashOutputObj.output).toContain('Use /swarm retrieve S1 for full content');

		// Verify summary file was created
		const summaryDir = join(tempDir, '.swarm', 'summaries');
		const summaryFiles = readdirSync(summaryDir).filter((f) => f.endsWith('.json'));
		expect(summaryFiles.length).toBe(1);
		expect(summaryFiles[0]).toBe('S1.json');
	});

	test('retrieve returns original after bash summarization', async () => {
		// Arrange: Create hook with default config
		const config = defaultConfig();
		const hook = createToolSummarizerHook(config, tempDir);

		// Create a large bash output (2000 bytes)
		const originalBashOutput = 'line'.repeat(500); // ~2000 bytes
		expect(originalBashOutput.length).toBeGreaterThan(config.threshold_bytes);

		// Step 1: bash output → summarized → S1
		const bashInput = {
			tool: 'bash',
			sessionID: 'test-session',
			callID: 'test-call',
		};
		const bashOutputObj = {
			title: 'bash output',
			output: originalBashOutput,
			metadata: {},
		};

		await hook(bashInput, bashOutputObj);

		// Verify S1 was created and output was replaced
		expect(bashOutputObj.output).not.toBe(originalBashOutput);
		expect(bashOutputObj.output).toContain('[SUMMARY S1]');

		// Step 2: Retrieve S1 via handleRetrieveCommand
		const retrievedContent = await handleRetrieveCommand(tempDir, ['S1']);

		// Assert: retrieved content equals original bash output
		expect(retrievedContent).toBe(originalBashOutput);
	});
});
