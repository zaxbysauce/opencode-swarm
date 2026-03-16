/**
 * OpenCode Plugin Tool Registration
 *
 * Wraps core tool logic functions with createSwarmTool() for OpenCode plugin registration.
 * Each tool:
 * - Has plugin-compatible arg schema
 * - Injects directory from plugin context
 * - Returns serialized JSON/text consistent with current tool behavior
 */

import type { tool } from '@opencode-ai/plugin';
import { createSwarmTool } from './create-tool';

// Stable portable type for tool exports - uses the tool() return type from the plugin
// This is portable because it's based on an imported function, not inferred locally
type SwarmTool = ReturnType<typeof tool>;

import {
	// Evidence check functions
	analyzeGaps,
	analyzeHotspots,
	detectDomains,
	// Test framework detection
	detectTestFramework,
	executeDeclareScope,
	executePhaseComplete,
	executeSavePlan,
	executeTodoExtract,
	executeUpdateTaskStatus,
	executeWriteRetro,
	extractCodeBlocks,
	fetchGitingest,
	filterHiveEntries,
	// Knowledge helpers
	filterSwarmEntries,
	formatHiveEntry,
	formatSwarmEntry,
	handleDelete,
	handleList,
	handleRestore,
	handleSave,
	parseCompletedTasks,
	readKnowledge,
	resolveHiveKnowledgePath,
	// Knowledge store functions
	resolveSwarmKnowledgePath,
	retrieveSummary,
	runCheckGateStatus,
	runDiff,
	runImports,
	runLint,
	runPkgAudit,
	runPreCheckBatch,
	runSchemaDrift,
	runSecretscan,
	runSymbols,
	runTests,
	validateCategoryInput,
	validateLimit,
	validateMinScore,
	validateStatusInput,
	validateTierInput,
} from '@opencode-swarm/core';

// Helper function to read evidence files (simplified version)
function readEvidenceFilesSimple(
	evidenceDir: string,
	_cwd: string,
): Array<{ taskId: string; type: string }> {
	const evidence: Array<{ taskId: string; type: string }> = [];
	try {
		const fs = require('node:fs');
		if (
			!require('node:fs').existsSync(evidenceDir) ||
			!require('node:fs').statSync(evidenceDir).isDirectory()
		) {
			return evidence;
		}
		const files = require('node:fs').readdirSync(evidenceDir);
		for (const filename of files) {
			if (!filename.match(/^[0-9.]+\.json$/)) continue;
			const filePath = require('node:path').join(evidenceDir, filename);
			try {
				const content = require('node:fs').readFileSync(filePath, 'utf-8');
				const data = JSON.parse(content);
				if (data.required_gates && Array.isArray(data.required_gates)) {
					for (const gate of data.required_gates) {
						evidence.push({
							taskId: data.taskId || filename.replace('.json', ''),
							type: gate,
						});
					}
				}
			} catch {
				// Skip invalid files
			}
		}
	} catch {
		// Directory doesn't exist
	}
	return evidence;
}

// ============ check_gate_status ============
export const check_gate_status: SwarmTool = createSwarmTool({
	description:
		'Check the status of gates for a task. Reads .swarm/evidence/{taskId}.json and returns which gates have passed.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const task_id = args.task_id as string;
		return runCheckGateStatus(task_id, directory);
	},
});

// ============ checkpoint ============
export const checkpoint: SwarmTool = createSwarmTool({
	description:
		'Save, restore, list, or delete git checkpoints. Creates commits with labels for easy restoration.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const action = args.action as string;
		const label = args.label as string | undefined;

		switch (action) {
			case 'save':
				if (!label) {
					return JSON.stringify(
						{
							action: 'save',
							success: false,
							error: 'label is required for save action',
						},
						null,
						2,
					);
				}
				return handleSave(label, directory);
			case 'restore':
				if (!label) {
					return JSON.stringify(
						{
							action: 'restore',
							success: false,
							error: 'label is required for restore action',
						},
						null,
						2,
					);
				}
				return handleRestore(label, directory);
			case 'list':
				return handleList(directory);
			case 'delete':
				if (!label) {
					return JSON.stringify(
						{
							action: 'delete',
							success: false,
							error: 'label is required for delete action',
						},
						null,
						2,
					);
				}
				return handleDelete(label, directory);
			default:
				return JSON.stringify(
					{ action, success: false, error: `Unknown action: ${action}` },
					null,
					2,
				);
		}
	},
});

// ============ complexity_hotspots ============
export const complexity_hotspots: SwarmTool = createSwarmTool({
	description:
		'Identify high-risk code hotspots by combining git churn frequency with cyclomatic complexity estimates.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const days = (args.days as number) ?? 90;
		const topN = (args.top_n as number) ?? 20;
		const extensionsArg = args.extensions as string | undefined;
		const extensions = extensionsArg
			? extensionsArg.split(',').map((e) => e.trim())
			: ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'ps1'];

		const result = await analyzeHotspots(days, topN, extensions, directory);
		return JSON.stringify(result, null, 2);
	},
});

// ============ declare_scope ============
export const declare_scope: SwarmTool = createSwarmTool({
	description:
		'Set the file scope for coder delegations. Must be called before delegating to coder to enable scope containment checking.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const taskId = args.taskId as string;
		const files = args.files as string[];
		const whitelist = args.whitelist as string[] | undefined;
		const working_directory = args.working_directory as string | undefined;

		const result = await executeDeclareScope(
			{ taskId, files, whitelist, working_directory },
			directory,
		);
		return JSON.stringify(result, null, 2);
	},
});

// ============ detect_domains ============
export const detect_domains: SwarmTool = createSwarmTool({
	description: 'Detect which SME domains are relevant for a given text.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, _directory: string) => {
		const text = args.text as string;
		const domains = detectDomains({ text });
		return JSON.stringify({ domains }, null, 2);
	},
});

// ============ diff ============
export const diff: SwarmTool = createSwarmTool({
	description:
		'Analyze git diff between commits, showing file changes and contract changes.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const base = args.base as string | undefined;
		const paths = args.paths as string[] | undefined;
		const result = await runDiff({ base, paths }, directory);
		return typeof result === 'string'
			? result
			: JSON.stringify(result, null, 2);
	},
});

// ============ evidence_check ============
export const evidence_check: SwarmTool = createSwarmTool({
	description:
		'Check which tasks have all required evidence gates completed and identify gaps.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const required_types = args.required_types as string[] | undefined;

		const completedTasks = parseCompletedTasks(directory);
		const evidenceDir = `${directory}/.swarm/evidence`;
		const evidence = readEvidenceFilesSimple(evidenceDir, directory);
		const requiredTypes = required_types ?? [
			'coder',
			'reviewer',
			'test_engineer',
		];

		const result = analyzeGaps(completedTasks, evidence, requiredTypes);
		return JSON.stringify(result, null, 2);
	},
});

// ============ extract_code_blocks ============
export const extract_code_blocks: SwarmTool = createSwarmTool({
	description:
		'Extract code blocks from markdown content and save them to files.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const content = args.content as string;
		const output_dir = args.output_dir as string | undefined;
		const prefix = args.prefix as string | undefined;

		const outputDir = output_dir ?? directory;
		const result = extractCodeBlocks(content, outputDir, prefix);
		return JSON.stringify(result, null, 2);
	},
});

// ============ gitingest ============
export const gitingest: SwarmTool = createSwarmTool({
	description:
		'Fetch a GitHub repository content via gitingest.com for analysis.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, _directory: string) => {
		const url = args.url as string;
		const pattern = args.pattern as string | undefined;
		const patternType = args.patternType as 'include' | 'exclude' | undefined;
		const maxFileSize = args.maxFileSize as number | undefined;

		const result = await fetchGitingest({
			url,
			pattern,
			patternType,
			maxFileSize,
		});
		return result;
	},
});

// ============ imports ============
export const imports: SwarmTool = createSwarmTool({
	description: 'Find all consumers that import from a given file.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const file = args.file as string;
		const symbol = args.symbol as string | undefined;

		const result = await runImports({ file, symbol }, directory);
		return result;
	},
});

// ============ knowledge_query ============
export const knowledge_query: SwarmTool = createSwarmTool({
	description: 'Query swarm and hive knowledge with optional filters.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const tier = validateTierInput(args.tier as string) ?? 'all';
		const status = validateStatusInput(args.status as string) ?? undefined;
		const category =
			validateCategoryInput(args.category as string) ?? undefined;
		const minScore = validateMinScore(args.min_score as number) ?? undefined;
		const limit = validateLimit(args.limit as number);

		const swarmPath = resolveSwarmKnowledgePath(directory);
		const hivePath = resolveHiveKnowledgePath();

		// Read entries based on tier
		let swarmEntries: unknown[] = [];
		let hiveEntries: unknown[] = [];

		try {
			if (tier === 'all' || tier === 'swarm') {
				swarmEntries = await readKnowledge(swarmPath);
			}
			if (tier === 'all' || tier === 'hive') {
				hiveEntries = await readKnowledge(hivePath);
			}
		} catch {
			// Return empty results if knowledge files don't exist
		}

		const filters = { status, category, minScore };

		const filteredSwarm = filterSwarmEntries(
			swarmEntries as Parameters<typeof filterSwarmEntries>[0],
			filters,
		);
		const filteredHive = filterHiveEntries(
			hiveEntries as Parameters<typeof filterHiveEntries>[0],
			filters,
		);

		// Format entries
		const formattedSwarm = filteredSwarm
			.slice(0, limit)
			.map((e) =>
				formatSwarmEntry(e as Parameters<typeof formatSwarmEntry>[0]),
			);
		const formattedHive = filteredHive
			.slice(0, limit)
			.map((e) => formatHiveEntry(e as Parameters<typeof formatHiveEntry>[0]));

		return JSON.stringify(
			{
				swarm: formattedSwarm,
				hive: formattedHive,
				count: {
					swarm: filteredSwarm.length,
					hive: filteredHive.length,
					returned: formattedSwarm.length + formattedHive.length,
				},
			},
			null,
			2,
		);
	},
});

// ============ lint ============
export const lint: SwarmTool = createSwarmTool({
	description: 'Run linter (biome or eslint) in fix or check mode.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const mode = (args.mode as 'fix' | 'check') ?? 'check';
		const linter = (args.linter as 'biome' | 'eslint') ?? 'biome';

		const result = await runLint(linter, mode, directory);
		return JSON.stringify(result, null, 2);
	},
});

// ============ phase_complete ============
export const phase_complete: SwarmTool = createSwarmTool({
	description:
		'Mark a phase as complete and track which agents were dispatched.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const phase = args.phase as number;
		const summary = args.summary as string | undefined;
		const sessionID = args.sessionID as string | undefined;

		return executePhaseComplete({ phase, summary, sessionID }, directory);
	},
});

// ============ pkg_audit ============
export const pkg_audit: SwarmTool = createSwarmTool({
	description: 'Run package manager security audit (npm, pip, cargo, etc.)',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const ecosystem =
			(args.ecosystem as
				| 'auto'
				| 'npm'
				| 'pip'
				| 'cargo'
				| 'go'
				| 'dotnet'
				| 'ruby'
				| 'dart') ?? 'auto';

		const result = await runPkgAudit(ecosystem, directory);
		return JSON.stringify(result, null, 2);
	},
});

// ============ pre_check_batch ============
export const pre_check_batch: SwarmTool = createSwarmTool({
	description:
		'Run multiple verification tools in parallel: lint, secretscan, SAST scan, and quality budget.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const files = args.files as string[] | undefined;
		const sast_threshold =
			(args.sast_threshold as 'low' | 'medium' | 'high' | 'critical') ??
			'medium';

		const result = await runPreCheckBatch(
			{ files: files ?? [], directory, sast_threshold },
			directory,
		);
		return JSON.stringify(result, null, 2);
	},
});

// ============ retrieve_summary ============
export const retrieve_summary: SwarmTool = createSwarmTool({
	description:
		'Retrieve the full content of a stored tool output summary by its ID.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const id = args.id as string;
		const limit = args.limit as number | undefined;
		const offset = args.offset as number | undefined;

		const result = await retrieveSummary({ id, limit, offset }, directory);
		return result;
	},
});

// ============ save_plan ============
export const save_plan: SwarmTool = createSwarmTool({
	description:
		'Save a structured implementation plan to .swarm/plan.json and .swarm/plan.md.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const phases = args.phases as any;
		const swarm_id = args.swarm_id as string;
		const title = args.title as string;
		const working_directory = args.working_directory as string | undefined;

		const result = await executeSavePlan(
			{ phases, swarm_id, title, working_directory },
			directory,
		);
		return JSON.stringify(result, null, 2);
	},
});

// ============ schema_drift ============
export const schema_drift: SwarmTool = createSwarmTool({
	description:
		'Compare OpenAPI spec against actual route implementations to find drift.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const spec_file = args.spec_file as string;

		const result = await runSchemaDrift(spec_file, directory);
		return JSON.stringify(result, null, 2);
	},
});

// ============ secretscan ============
export const secretscan: SwarmTool = createSwarmTool({
	description:
		'Scan directory for potential secrets (API keys, tokens, passwords) using regex patterns and entropy heuristics.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const directoryArg = args.directory as string | undefined;

		const scanDir = directoryArg ?? directory;
		const result = await runSecretscan(scanDir);
		return JSON.stringify(result, null, 2);
	},
});

// ============ symbols ============
export const symbols: SwarmTool = createSwarmTool({
	description: 'Extract all exported symbols from a source file.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const file = args.file as string;
		const exported_only = (args.exported_only as boolean) ?? true;

		// runSymbols takes: file, cwd, exportedOnly
		const result = await runSymbols(file, directory, exported_only);
		return JSON.stringify(result, null, 2);
	},
});

// ============ test_runner ============
export const test_runner: SwarmTool = createSwarmTool({
	description: 'Run project tests with framework detection.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const scope =
			(args.scope as 'all' | 'convention' | 'graph') ?? 'convention';
		const coverage = (args.coverage as boolean) ?? false;
		const timeout_ms = (args.timeout_ms as number) ?? 120000;
		const files = args.files as string[] | undefined;

		const framework = await detectTestFramework(directory);

		const result = await runTests(
			framework,
			scope,
			files ?? [],
			coverage,
			timeout_ms,
			directory,
		);
		return JSON.stringify(result, null, 2);
	},
});

// ============ todo_extract ============
export const todo_extract: SwarmTool = createSwarmTool({
	description: 'Scan the codebase for TODO/FIXME/HACK/XXX/WARN/NOTE comments.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const paths = args.paths as string | string[] | undefined;
		const tags = (args.tags as string) ?? 'TODO,FIXME,HACK,XXX,WARN,NOTE';

		// Convert paths to comma-separated string if it's an array
		const pathsStr = Array.isArray(paths)
			? paths.join(',')
			: (paths ?? directory);
		const result = await executeTodoExtract(
			{ paths: pathsStr, tags },
			directory,
		);
		return result;
	},
});

// ============ update_task_status ============
export const update_task_status: SwarmTool = createSwarmTool({
	description:
		'Update the status of a specific task in the implementation plan.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const status = args.status as
			| 'pending'
			| 'in_progress'
			| 'completed'
			| 'blocked';
		const task_id = args.task_id as string;

		const result = await executeUpdateTaskStatus(
			{ status, task_id },
			directory,
		);
		return JSON.stringify(result, null, 2);
	},
});

// ============ write_retro ============
export const write_retro: SwarmTool = createSwarmTool({
	description: 'Write a retrospective evidence bundle for a completed phase.',
	args: {} as Record<string, unknown>,
	execute: async (args: Record<string, unknown>, directory: string) => {
		const phase = args.phase as number;
		const summary = args.summary as string;
		const task_count = args.task_count as number;
		const task_complexity = args.task_complexity as
			| 'trivial'
			| 'simple'
			| 'moderate'
			| 'complex';
		const coder_revisions = (args.coder_revisions as number) ?? 0;
		const integration_issues = (args.integration_issues as number) ?? 0;
		const lessons_learned = args.lessons_learned as string[] | undefined;
		const metadata = args.metadata as Record<string, unknown> | undefined;
		const reviewer_rejections = (args.reviewer_rejections as number) ?? 0;
		const security_findings = (args.security_findings as number) ?? 0;
		const test_failures = (args.test_failures as number) ?? 0;
		const total_tool_calls = (args.total_tool_calls as number) ?? 0;
		const top_rejection_reasons = args.top_rejection_reasons as
			| string[]
			| undefined;

		return executeWriteRetro(
			{
				phase,
				summary,
				task_count,
				task_complexity,
				coder_revisions,
				integration_issues,
				lessons_learned,
				metadata,
				reviewer_rejections,
				security_findings,
				test_failures,
				total_tool_calls,
				top_rejection_reasons,
			},
			directory,
		);
	},
});
