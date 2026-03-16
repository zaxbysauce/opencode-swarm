#!/usr/bin/env bun
/**
 * PostToolUse hook script for opencode-swarm Claude Code adapter.
 * Reads JSON from stdin, processes with core hook logic, writes JSON to stdout.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const stdinData = readFileSync('/dev/stdin', 'utf-8');
let input: Record<string, unknown>;
try {
	input = JSON.parse(stdinData);
} catch {
	// Invalid JSON input — exit cleanly
	process.exit(0);
}

const sessionId = (input.session_id as string) ?? 'unknown';
const cwd = (input.cwd as string) ?? process.cwd();
const toolName = (input.tool_name as string) ?? 'unknown';
const toolInput = (input.tool_input as Record<string, unknown>) ?? {};
const swarmDir = path.join(cwd, '.swarm');

// Emit file_touch for write operations
try {
	const { getEventWriter } = await import('../../core/src/telemetry/writer');
	const writer = getEventWriter(swarmDir, sessionId);

	// Track file modifications
	const writeTools = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
	if (writeTools.includes(toolName)) {
		const filePath =
			(toolInput.file_path as string) ??
			(toolInput.path as string) ??
			'unknown';
		writer.emit({
			type: 'file_touch',
			timestamp: new Date().toISOString(),
			sessionId,
			version: '1.0.0',
			taskId: null,
			filePath,
			operation: 'write',
		});
	}
} catch {
	// Non-fatal - telemetry should not crash swarm
}

// PostToolUse is observational - no decision required
process.stdout.write(`${JSON.stringify({})}\n`);
process.exit(0);
