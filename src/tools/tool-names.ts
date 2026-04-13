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
	| 'check_gate_status'
	| 'completion_verify'
	| 'convene_council'
	| 'declare_council_criteria'
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
	| 'lint_spec'
	| 'write_retro'
	| 'write_drift_evidence'
	| 'declare_scope'
	| 'knowledge_query'
	| 'doc_scan'
	| 'doc_extract'
	| 'curator_analyze'
	| 'knowledge_add'
	| 'knowledge_recall'
	| 'knowledge_remove'
	| 'co_change_analyzer'
	| 'search'
	| 'batch_symbols'
	| 'suggest_patch'
	| 'req_coverage'
	| 'get_approved_plan'
	| 'repo_map';

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
	'check_gate_status',
	'completion_verify',
	'convene_council',
	'declare_council_criteria',
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
	'lint_spec',
	'write_retro',
	'write_drift_evidence',
	'declare_scope',
	'knowledge_query',
	'doc_scan',
	'doc_extract',
	'curator_analyze',
	'knowledge_add',
	'knowledge_recall',
	'knowledge_remove',
	'co_change_analyzer',
	'search',
	'batch_symbols',
	'suggest_patch',
	'req_coverage',
	'get_approved_plan',
	'repo_map',
] as const;

/** Set for O(1) tool name validation */
export const TOOL_NAME_SET: ReadonlySet<ToolName> = new Set(TOOL_NAMES);

// Enforce snake_case on all TOOL_NAMES entries at compile time.
// This will produce a type error if any entry contains an uppercase letter
// that isn't at the start of a word boundary for snake_case.
type AssertSnakeCase<T extends string> =
	T extends `${string}${Uppercase<string>}${string}` ? never : T;
type _ToolNamesSnakeCaseCheck = AssertSnakeCase<ToolName>;
// If this type resolves to `never`, a tool name contains camelCase.
