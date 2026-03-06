/**
 * Central registry of all tool names used by the swarm.
 * Used for constants and agent setup references.
 */

/** Union type of all valid tool names */
export type ToolName =
	| 'diff'
	| 'syntax_check'
	| 'placeholder_scan'
	| 'imports'
	| 'lint'
	| 'secretscan'
	| 'sast_scan'
	| 'build_check'
	| 'pre_check_batch'
	| 'quality_budget'
	| 'symbols'
	| 'complexity_hotspots'
	| 'schema_drift'
	| 'todo_extract'
	| 'evidence_check'
	| 'sbom_generate'
	| 'checkpoint'
	| 'pkg_audit'
	| 'test_runner'
	| 'detect_domains'
	| 'gitingest'
	| 'retrieve_summary'
	| 'extract_code_blocks'
	| 'phase_complete'
	| 'save_plan'
	| 'update_task_status'
	| 'write_retro';

/** Readonly array of all tool names */
export const TOOL_NAMES: readonly ToolName[] = [
	'diff',
	'syntax_check',
	'placeholder_scan',
	'imports',
	'lint',
	'secretscan',
	'sast_scan',
	'build_check',
	'pre_check_batch',
	'quality_budget',
	'symbols',
	'complexity_hotspots',
	'schema_drift',
	'todo_extract',
	'evidence_check',
	'sbom_generate',
	'checkpoint',
	'pkg_audit',
	'test_runner',
	'detect_domains',
	'gitingest',
	'retrieve_summary',
	'extract_code_blocks',
	'phase_complete',
	'save_plan',
	'update_task_status',
	'write_retro',
] as const;

/** Set for O(1) tool name validation */
export const TOOL_NAME_SET: ReadonlySet<ToolName> = new Set(TOOL_NAMES);
