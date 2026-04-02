/**
 * Hygiene test: detects hardcoded tool lists in prompt strings.
 *
 * Flags lines that contain 5+ comma-separated tool names from AGENT_TOOL_MAP
 * unless explicitly exempted (placeholder tokens, comments, or source-of-truth references).
 *
 * This ensures prompts use {{YOUR_TOOLS}} or {{AVAILABLE_TOOLS}} auto-generation
 * rather than manual tool list maintenance.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { AGENT_TOOL_MAP } from '../../../src/config/constants.js';

const AGENTS_DIR = join(__dirname, '../../../src/agents');

/** All tool names flattened from all agents in AGENT_TOOL_MAP */
const ALL_TOOL_NAMES: string[] = [];
for (const tools of Object.values(AGENT_TOOL_MAP)) {
	ALL_TOOL_NAMES.push(...tools);
}
const TOOL_NAME_SET = new Set(ALL_TOOL_NAMES);

/** Lines that should not trigger the hardcoded tool list detection */
const EXEMPT_PATTERNS = [
	/\{\{YOUR_TOOLS\}\}/,
	/\{\{AVAILABLE_TOOLS\}\}/,
	/AGENT_TOOL_MAP/,
	/TOOL_DESCRIPTIONS/,
	/WRITE_TOOL_NAMES/,
] as const;

/** Returns true if the line is a comment (// or block comment continuation) */
function isCommentLine(line: string): boolean {
	const trimmed = line.trim();
	return (
		trimmed.startsWith('//') ||
		trimmed.startsWith('*') ||
		trimmed.startsWith('/*')
	);
}

/** Count how many distinct tool names appear in a line as comma-separated tokens */
function countToolNamesInLine(line: string): number {
	// Split by comma and count unique tool names that appear as whole tokens
	const tokens = line.split(',');
	const found = new Set<string>();

	for (const token of tokens) {
		const trimmed = token.trim();
		// Only count if the trimmed token is a known tool name
		if (TOOL_NAME_SET.has(trimmed)) {
			found.add(trimmed);
		}
	}

	return found.size;
}

interface Violation {
	file: string;
	lineNumber: number;
	line: string;
	toolCount: number;
}

describe('no hardcoded tool lists hygiene', () => {
	it('src/agents/*.ts files must not contain hardcoded tool lists in prompts', () => {
		const violations: Violation[] = [];

		// Read all .ts files in src/agents/ (exclude test files)
		const files = readdirSync(AGENTS_DIR).filter(
			(f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
		);

		for (const file of files) {
			const filePath = join(AGENTS_DIR, file);
			const content = readFileSync(filePath, 'utf-8');
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const lineNumber = i + 1;

				// Skip exempt lines
				if (EXEMPT_PATTERNS.some((pattern) => pattern.test(line))) continue;
				if (isCommentLine(line)) continue;

				// Count tool names on this line
				const toolCount = countToolNamesInLine(line);

				if (toolCount >= 5) {
					violations.push({ file, lineNumber, line: line.trim(), toolCount });
				}
			}
		}

		if (violations.length > 0) {
			const summary = violations
				.map(
					(v) =>
						`  src/agents/${v.file} line ${v.lineNumber}: [${v.line}]\n` +
						`    Found ${v.toolCount} tool names. Use {{YOUR_TOOLS}} or {{AVAILABLE_TOOLS}} placeholders instead,\n` +
						`    or derive from AGENT_TOOL_MAP.`,
				)
				.join('\n\n');

			throw new Error(
				`Found hardcoded tool list(s) in src/agents/:\n\n${summary}`,
			);
		}
	});
});
