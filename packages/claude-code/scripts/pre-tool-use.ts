#!/usr/bin/env bun
/**
 * PreToolUse hook script for opencode-swarm Claude Code adapter.
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
const swarmDir = path.join(cwd, '.swarm');

// Emit tool_invocation event
try {
	const { getEventWriter } = await import('../../core/src/telemetry/writer');
	getEventWriter(swarmDir, sessionId).emit({
		type: 'tool_invocation',
		timestamp: new Date().toISOString(),
		sessionId,
		version: '1.0.0',
		toolName,
		taskId: null,
	});
} catch {
	// Non-fatal - telemetry should not crash swarm
}

// Allow all tool uses (delegation-gate logic requires StateBridge — Task 3.3)
const output = {
	hookSpecificOutput: {
		hookEventName: 'PreToolUse',
		permissionDecision: 'allow',
	},
};

process.stdout.write(`${JSON.stringify(output)}\n`);
process.exit(0);
