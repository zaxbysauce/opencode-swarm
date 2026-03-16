#!/usr/bin/env bun
/**
 * Stop hook script for opencode-swarm Claude Code adapter.
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
const stopHookActive = (input.stop_hook_active as boolean) ?? false;
const swarmDir = path.join(cwd, '.swarm');

// Prevent infinite loops
if (stopHookActive) {
	process.stdout.write(`${JSON.stringify({})}\n`);
	process.exit(0);
}

// Emit session-end event
try {
	const { getEventWriter } = await import('@opencode-swarm/core/telemetry');
	getEventWriter(swarmDir, sessionId).emit({
		type: 'agent_status',
		timestamp: new Date().toISOString(),
		sessionId,
		version: '1.0.0',
		agentName: 'architect',
		status: 'complete',
	});
} catch {
	// Non-fatal - telemetry should not crash swarm
}

process.stdout.write(`${JSON.stringify({})}\n`);
process.exit(0);
