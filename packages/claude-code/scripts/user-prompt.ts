#!/usr/bin/env bun
/**
 * UserPrompt hook script for opencode-swarm Claude Code adapter.
 * Reads JSON from stdin, processes with core hook logic, writes JSON to stdout.
 */

import { readFileSync, existsSync } from 'node:fs';
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

// Inject swarm plan context if available
let additionalContext: string | undefined;
try {
    const planPath = path.join(swarmDir, 'plan.md');
    if (existsSync(planPath)) {
        const planContent = readFileSync(planPath, 'utf-8');
        // Extract current task from plan (lines with ← CURRENT marker)
        const currentTaskMatch = planContent.match(/- \[ \].*← CURRENT/);
        if (currentTaskMatch) {
            additionalContext = `[SWARM CURRENT TASK] ${currentTaskMatch[0].replace('- [ ] ', '').replace(' ← CURRENT', '')}`;
        }
    }
} catch {
    // Non-fatal - telemetry should not crash swarm
}

const output: Record<string, unknown> = {};
if (additionalContext) {
    output.additionalContext = additionalContext;
}

process.stdout.write(JSON.stringify(output) + '\n');
process.exit(0);
