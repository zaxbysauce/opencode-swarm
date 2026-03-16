#!/usr/bin/env bun
/**
 * PreCompact hook script for opencode-swarm Claude Code adapter.
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
const _trigger = (input.trigger as string) ?? 'auto';
const swarmDir = path.join(cwd, '.swarm');

// Log compaction event
try {
	const { getEventWriter } = await import('../../core/src/telemetry/writer');
	getEventWriter(swarmDir, sessionId).emit({
		type: 'phase_transition',
		timestamp: new Date().toISOString(),
		sessionId,
		version: '1.0.0',
		phase: 0,
		transition: 'start',
	});
} catch {
	// Non-fatal - telemetry should not crash swarm
}

// PreCompact output is observational only — no decision control
process.stdout.write(`${JSON.stringify({})}\n`);
process.exit(0);
