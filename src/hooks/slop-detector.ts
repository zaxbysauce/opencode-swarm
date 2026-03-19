/**
 * Slop detector — PostToolUse hook that checks for AI code quality anti-patterns.
 * Fires after Write and Edit tool calls. Runs 4 heuristics and emits an advisory
 * system message when findings are detected. Non-blocking, <500ms.
 */

import type { SlopDetectorConfig } from '../config/schema';
export type { SlopDetectorConfig };

const WRITE_EDIT_TOOLS = new Set([
	'write',
	'edit',
	'apply_patch',
	'create_file',
]);

interface SlopFinding {
	type:
		| 'abstraction_bloat'
		| 'dead_export'
		| 'comment_strip'
		| 'boilerplate_explosion';
	detail: string;
}

/**
 * Count occurrences of a pattern in a string.
 */
function countMatches(text: string, pattern: RegExp): number {
	return (text.match(pattern) ?? []).length;
}

/**
 * Heuristic 1: Abstraction bloat — 3+ new class declarations in a single diff.
 */
function checkAbstractionBloat(
	content: string,
	threshold: number,
): SlopFinding | null {
	const newClasses = countMatches(content, /^\+.*\bclass\s+\w+/gm);
	if (newClasses >= threshold) {
		return {
			type: 'abstraction_bloat',
			detail: `${newClasses} new class declarations added (threshold: ${threshold}). Consider whether all abstractions are necessary.`,
		};
	}
	return null;
}

/**
 * Heuristic 2: Comment stripping — removed 5+ comment lines, added zero.
 */
function checkCommentStrip(
	content: string,
	threshold: number,
): SlopFinding | null {
	const removedComments = countMatches(content, /^-\s*\/[/*]/gm);
	const addedComments = countMatches(content, /^\+\s*\/[/*]/gm);
	if (removedComments >= threshold && addedComments === 0) {
		return {
			type: 'comment_strip',
			detail: `${removedComments} comment lines removed and 0 added. Verify comments were not documenting important behaviour.`,
		};
	}
	return null;
}

/**
 * Heuristic 3: Boilerplate explosion — 200+ lines added for a fix/patch/update/tweak task.
 */
function checkBoilerplateExplosion(
	content: string,
	taskDescription: string,
	threshold: number,
): SlopFinding | null {
	const addedLines = countMatches(content, /^\+[^+]/gm);
	const isSmallTask =
		/\b(fix|patch|update|tweak|adjust|correct|remove|rename|change)\b/i.test(
			taskDescription,
		);
	if (isSmallTask && addedLines >= threshold) {
		return {
			type: 'boilerplate_explosion',
			detail: `${addedLines} lines added for a "${taskDescription.slice(0, 40)}" task (threshold: ${threshold}). Review for scope creep.`,
		};
	}
	return null;
}

/**
 * Heuristic 4: Dead exports — new export not found in any project import.
 * Quick grep-style check using a file read. Fast approximation only.
 */
async function checkDeadExports(
	content: string,
	projectDir: string,
	startTime: number,
): Promise<SlopFinding | null> {
	const exportMatches = content.matchAll(
		/^(?:export)\s+(?:function|class|const|type|interface)\s+(\w{3,})/gm,
	);
	const newExports: string[] = [];
	for (const match of exportMatches) {
		if (match[1]) newExports.push(match[1]);
	}
	if (newExports.length === 0) return null;

	const deadExports: string[] = [];
	for (const name of newExports) {
		if (Date.now() - startTime > 480) break; // time budget
		try {
			const importPattern = new RegExp(`\\bimport\\b[^;]*\\b${name}\\b`, 'g');
			const glob = new Bun.Glob(`src/**/*.ts`);
			let found = false;
			for await (const file of glob.scan(projectDir)) {
				if (found || Date.now() - startTime > 480) break; // time budget inside loop
				try {
					const text = await Bun.file(`${projectDir}/${file}`).text();
					if (importPattern.test(text)) found = true;
					importPattern.lastIndex = 0; // reset for reuse
				} catch {
					// skip unreadable files
				}
			}
			if (!found) deadExports.push(name);
		} catch {
			// skip on any error
		}
	}

	if (deadExports.length === 0) return null;
	return {
		type: 'dead_export',
		detail: `New exports not found in any import: ${deadExports.slice(0, 3).join(', ')}. Verify these are intentionally exported.`,
	};
}

export interface SlopDetectorHook {
	toolAfter: (
		input: { tool: string; sessionID: string },
		output: { output?: unknown; args?: unknown },
	) => Promise<void>;
}

export function createSlopDetectorHook(
	config: SlopDetectorConfig,
	projectDir: string,
	injectSystemMessage: (sessionId: string, message: string) => void,
): SlopDetectorHook {
	return {
		toolAfter: async (input, output) => {
			if (!config.enabled) return;
			if (!WRITE_EDIT_TOOLS.has(input.tool.toLowerCase())) return;

			// Extract actual written/edited content from args (not output.output which is a confirmation msg)
			const args = output.args as Record<string, unknown> | undefined;
			const content = (() => {
				if (typeof args?.content === 'string') return args.content; // write
				if (typeof args?.newString === 'string') return args.newString; // edit
				if (typeof args?.patch === 'string') return args.patch; // apply_patch
				if (typeof args?.file_text === 'string') return args.file_text; // create_file
				return '';
			})();
			if (!content || content.length < 10) return;

			// Get task description from args for boilerplate check
			const taskDescription =
				typeof args?.description === 'string'
					? args.description
					: typeof args?.task === 'string'
						? args.task
						: '';

			const startTime = Date.now();
			const findings: SlopFinding[] = [];

			try {
				const bloat = checkAbstractionBloat(content, config.classThreshold);
				if (bloat) findings.push(bloat);

				const strip = checkCommentStrip(content, config.commentStripThreshold);
				if (strip) findings.push(strip);

				const explosion = checkBoilerplateExplosion(
					content,
					taskDescription,
					config.diffLineThreshold,
				);
				if (explosion) findings.push(explosion);
			} catch {
				// heuristics 1-3 are best-effort — never let them fail the hook
			}

			if (Date.now() - startTime < 400) {
				try {
					const dead = await checkDeadExports(content, projectDir, startTime);
					if (dead) findings.push(dead);
				} catch {
					// dead export check is best-effort
				}
			}

			if (findings.length === 0) return;

			const findingText = findings
				.map((f) => `  • ${f.type}: ${f.detail}`)
				.join('\n');
			const message = `SLOP CHECK: ${findings.length} potential issue(s) detected after ${input.tool}:\n${findingText}\nReview before proceeding.`;

			injectSystemMessage(input.sessionID, message);
		},
	};
}
