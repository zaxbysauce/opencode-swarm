/**
 * Regression: console.warn must NOT appear in the gated agent warning paths.
 *
 * Before the fix, getModelForAgent and getAgentConfigs emitted console.warn
 * unconditionally — firing ~17 times on plugin re-init (e.g. after MCP
 * server installation), which scrolled the TUI screen blank.
 *
 * This test reads the source file directly and asserts the two previously
 * ungated console.warn calls have been replaced with the debug-gated log().
 * Runtime import tests are skipped here because zod is not installed in this
 * test environment.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'bun:test';

const SOURCE = fs.readFileSync(
	path.resolve(import.meta.dir, 'index.ts'),
	'utf8',
);

// Split into lines so we can pinpoint context around any failures
const LINES = SOURCE.split('\n');

describe('agents/index.ts — console.warn gate', () => {
	it('warnedAgents block uses log() not console.warn()', () => {
		const warnedAgentsIdx = LINES.findIndex((l) =>
			l.includes('warnedAgents.add(baseAgentName)'),
		);
		expect(warnedAgentsIdx).toBeGreaterThan(-1);

		// Check the next 5 lines after the add() call — the old console.warn was here
		const nearby = LINES.slice(warnedAgentsIdx, warnedAgentsIdx + 5).join('\n');
		expect(nearby).not.toContain('console.warn');
		expect(nearby).toContain('log(');
	});

	it('warnedMissingWhitelist block uses log() not console.warn()', () => {
		const warnedMissingIdx = LINES.findIndex((l) =>
			l.includes('warnedMissingWhitelist.add(baseAgentName)'),
		);
		expect(warnedMissingIdx).toBeGreaterThan(-1);

		// Check the 5 lines BEFORE the add() call — the old console.warn was there
		const nearby = LINES.slice(
			Math.max(0, warnedMissingIdx - 5),
			warnedMissingIdx + 2,
		).join('\n');
		expect(nearby).not.toContain('console.warn');
		expect(nearby).toContain('log(');
	});

	it('log import from ../utils is present', () => {
		expect(SOURCE).toContain("import { log } from '../utils'");
	});
});
