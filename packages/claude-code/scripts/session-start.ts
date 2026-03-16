#!/usr/bin/env bun
/**
 * SessionStart hook script for opencode-swarm Claude Code adapter.
 * Reads JSON from stdin, processes with core hook logic, writes JSON to stdout.
 */

import { existsSync, readFileSync } from 'node:fs';
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
const swarmDir = path.join(cwd, '.swarm');

// Emit session_metadata event
try {
	const { getEventWriter } = await import('@opencode-swarm/core/telemetry');
	getEventWriter(swarmDir, sessionId).emit({
		type: 'session_metadata',
		timestamp: new Date().toISOString(),
		sessionId,
		version: '1.0.0',
		swarmDir,
		pid: process.pid,
		platform: process.platform,
		nodeVersion: process.version,
	});
} catch {
	// Non-fatal - telemetry should not crash swarm
}

// Build additionalContext from .swarm/context.md
let additionalContext =
	'[SWARM] opencode-swarm v7.0.0 active. Use /swarm commands to manage the swarm.';
try {
	const contextPath = path.join(swarmDir, 'context.md');
	if (existsSync(contextPath)) {
		const contextContent = readFileSync(contextPath, 'utf-8');
		additionalContext += `\n\n[SWARM CONTEXT]\n${contextContent.slice(0, 2000)}`;
	}
} catch {
	// Non-fatal - telemetry should not crash swarm
}

const output = {
	hookSpecificOutput: {
		hookEventName: 'SessionStart',
		additionalContext,
	},
};

process.stdout.write(`${JSON.stringify(output)}\n`);
process.exit(0);
