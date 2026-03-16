/**
 * Core Tools Index
 *
 * Re-exports all pure logic functions from tool files.
 * These functions are used by the OpenCode adapter to create plugin tools.
 */

// Build Check
export {
	type BuildCheckInput,
	type BuildCheckResult,
	type BuildRun,
	DEFAULT_TIMEOUT_MS,
	getCommandKind,
	MAX_OUTPUT_BYTES,
	MAX_OUTPUT_LINES,
	runBuildCheck,
	runBuildCheckWithEvidence,
	truncateOutput,
} from './build-check';

// Check Gate Status
export {
	type GateStatusResult,
	runCheckGateStatus,
} from './check-gate-status';

// Checkpoint
export {
	handleDelete,
	handleList,
	handleRestore,
	handleSave,
	isGitRepo,
	validateLabel,
} from './checkpoint';

// Co-Change Analyzer
export {
	buildCoChangeMatrix,
	type CoChangeEntry,
	type DarkMatterOptions,
	darkMatterToKnowledgeEntries,
	detectDarkMatter,
	formatDarkMatterOutput,
	getStaticEdges,
	parseGitLog,
} from './co-change-analyzer';

// Complexity Hotspots
export {
	analyzeHotspots,
	type ComplexityHotspotsError,
	type ComplexityHotspotsResult,
	type HotspotEntry,
	validateDays,
	validateExtensions,
	validateTopN,
} from './complexity-hotspots';

// Declare Scope
export {
	type DeclareScopeArgs,
	type DeclareScopeResult,
	executeDeclareScope,
	validateFiles,
	validateTaskIdFormat,
} from './declare-scope';

// Diff
export {
	type DiffErrorResult,
	type DiffResult,
	runDiff,
	validateBase,
	validatePaths,
} from './diff';

// Domain Detector
export { detectDomains } from './domain-detector';

// Evidence Check
export {
	analyzeGaps,
	type CompletedTask,
	type EvidenceCheckResult,
	type EvidenceFile,
	type Gap,
	type NoTasksResult,
	normalizeEvidenceType,
	parseCompletedTasks,
	validateRequiredTypes,
} from './evidence-check';

// File Extractor
export {
	type ExtractCodeBlocksResult,
	extractCodeBlocks,
	extractFilename,
} from './file-extractor';

// Gitingest
export {
	fetchGitingest,
	GITINGEST_MAX_RESPONSE_BYTES,
	GITINGEST_MAX_RETRIES,
	GITINGEST_TIMEOUT_MS,
	type GitingestArgs,
} from './gitingest';

// Imports
export {
	type ConsumerFile,
	type ImportsErrorResult,
	type ImportsResult,
	runImports,
} from './imports';

// Knowledge Query
export {
	DEFAULT_LIMIT,
	filterHiveEntries,
	filterSwarmEntries,
	formatHiveEntry,
	formatSwarmEntry,
	validateCategoryInput,
	validateLimit,
	validateMinScore,
	validateStatusInput,
	validateTierInput,
} from './knowledge-query';

// Lint
export {
	type AdditionalLinter,
	containsControlChars,
	containsPathTraversal,
	detectAdditionalLinter,
	detectAvailableLinter,
	getAdditionalLinterCommand,
	getLinterCommand,
	LINT_MAX_OUTPUT_BYTES,
	type LintErrorResult,
	type LintResult,
	type LintSuccessResult,
	MAX_COMMAND_LENGTH,
	runAdditionalLint,
	runLint,
	type SupportedLinter,
	validateArgs,
} from './lint';
// Phase Complete
export {
	executePhaseComplete,
	type PhaseCompleteArgs,
	validatePhaseNumber,
} from './phase-complete';
// Package Audit
export { runPkgAudit } from './pkg-audit';
// Placeholder Scan
export {
	type PlaceholderFinding,
	type PlaceholderScanInput,
	type PlaceholderScanResult,
	placeholderScan,
} from './placeholder-scan';
// Pre-Check Batch
export {
	type PreCheckBatchInput,
	type PreCheckBatchResult,
	runPreCheckBatch,
	type ToolResult,
} from './pre-check-batch';
// Quality Budget
export {
	type QualityBudgetInput,
	type QualityBudgetResult,
	qualityBudget,
} from './quality-budget';
// Retrieve Summary
export {
	retrieveSummary,
	sanitizeSummaryId,
} from './retrieve-summary';
// Save Plan
export {
	detectPlaceholderContent,
	executeSavePlan,
	type SavePlanArgs,
	type SavePlanResult,
	validateTargetWorkspace,
} from './save-plan';
// SBOM Generate
export {
	runSbomGenerate,
	type SbomGenerateInput,
	type SbomGenerateResult,
} from './sbom-generate';
// Schema Drift
export {
	runSchemaDrift,
	type SchemaDriftResult,
} from './schema-drift';
// Secretscan
export {
	runSecretscan,
	type SecretFinding,
	type SecretscanErrorResult,
	type SecretscanResult,
} from './secretscan';
// Symbols
export { runSymbols } from './symbols';
// Syntax Check
export {
	type SyntaxCheckFileResult,
	type SyntaxCheckInput,
	type SyntaxCheckResult,
	syntaxCheck,
} from './syntax-check';
// Test Runner
export {
	buildTestCommand,
	containsPowerShellMetacharacters,
	detectCTest,
	detectDartTest,
	detectDotnetTest,
	detectGoTest,
	detectGradle,
	detectJavaMaven,
	detectMinitest,
	detectRSpec,
	detectSwiftTest,
	detectTestFramework,
	findSourceFiles,
	getTestFilesFromConvention,
	getTestFilesFromGraph,
	hasCompoundTestExtension,
	isAbsolutePath,
	MAX_SAFE_TEST_FILES,
	MAX_TIMEOUT_MS,
	parseTestOutput,
	runTests,
	SUPPORTED_FRAMEWORKS,
	type TestErrorResult,
	type TestFramework,
	type TestResult,
	type TestRunnerArgs,
	type TestSuccessResult,
	type TestTotals,
} from './test-runner';
// Todo Extract
export {
	executeTodoExtract,
	findSourceFiles as findSourceFilesForTodo,
	isSupportedExtension,
	parseTodoComments,
	type TodoEntry,
	type TodoExtractArgs,
	type TodoExtractError,
	type TodoExtractResult,
	validatePathsInput,
	validateTagsInput,
} from './todo-extract';
// Update Task Status
export {
	checkReviewerGate,
	executeUpdateTaskStatus,
	type ReviewerGateResult,
	type UpdateTaskStatusArgs,
	type UpdateTaskStatusResult,
	validateStatus,
	validateTaskId,
} from './update-task-status';
// Write Retro
export {
	executeWriteRetro,
	type WriteRetroArgs,
} from './write-retro';
