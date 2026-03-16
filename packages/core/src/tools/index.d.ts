/**
 * Core Tools Index
 *
 * Re-exports all pure logic functions from tool files.
 * These functions are used by the OpenCode adapter to create plugin tools.
 */
export { type BuildCheckInput, type BuildCheckResult, type BuildRun, DEFAULT_TIMEOUT_MS, getCommandKind, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES, runBuildCheck, runBuildCheckWithEvidence, truncateOutput, } from './build-check';
export { type GateStatusResult, runCheckGateStatus, } from './check-gate-status';
export { handleDelete, handleList, handleRestore, handleSave, isGitRepo, validateLabel, } from './checkpoint';
export { buildCoChangeMatrix, type CoChangeEntry, type DarkMatterOptions, darkMatterToKnowledgeEntries, detectDarkMatter, formatDarkMatterOutput, getStaticEdges, parseGitLog, } from './co-change-analyzer';
export { analyzeHotspots, type ComplexityHotspotsError, type ComplexityHotspotsResult, type HotspotEntry, validateDays, validateExtensions, validateTopN, } from './complexity-hotspots';
export { type DeclareScopeArgs, type DeclareScopeResult, executeDeclareScope, validateFiles, validateTaskIdFormat, } from './declare-scope';
export { type DiffErrorResult, type DiffResult, runDiff, validateBase, validatePaths, } from './diff';
export { detectDomains } from './domain-detector';
export { analyzeGaps, type CompletedTask, type EvidenceCheckResult, type EvidenceFile, type Gap, type NoTasksResult, normalizeEvidenceType, parseCompletedTasks, validateRequiredTypes, } from './evidence-check';
export { type ExtractCodeBlocksResult, extractCodeBlocks, extractFilename, } from './file-extractor';
export { fetchGitingest, GITINGEST_MAX_RESPONSE_BYTES, GITINGEST_MAX_RETRIES, GITINGEST_TIMEOUT_MS, type GitingestArgs, } from './gitingest';
export { type ConsumerFile, type ImportsErrorResult, type ImportsResult, runImports, } from './imports';
export { DEFAULT_LIMIT, filterHiveEntries, filterSwarmEntries, formatHiveEntry, formatSwarmEntry, validateCategoryInput, validateLimit, validateMinScore, validateStatusInput, validateTierInput, } from './knowledge-query';
export { type AdditionalLinter, containsControlChars, containsPathTraversal, detectAdditionalLinter, detectAvailableLinter, getAdditionalLinterCommand, getLinterCommand, LINT_MAX_OUTPUT_BYTES, type LintErrorResult, type LintResult, type LintSuccessResult, MAX_COMMAND_LENGTH, runAdditionalLint, runLint, type SupportedLinter, validateArgs, } from './lint';
export { executePhaseComplete, type PhaseCompleteArgs, validatePhaseNumber, } from './phase-complete';
export { runPkgAudit } from './pkg-audit';
export { type PlaceholderFinding, type PlaceholderScanInput, type PlaceholderScanResult, placeholderScan, } from './placeholder-scan';
export { type PreCheckBatchInput, type PreCheckBatchResult, runPreCheckBatch, type ToolResult, } from './pre-check-batch';
export { type QualityBudgetInput, type QualityBudgetResult, qualityBudget, } from './quality-budget';
export { retrieveSummary, sanitizeSummaryId, } from './retrieve-summary';
export { detectPlaceholderContent, executeSavePlan, type SavePlanArgs, type SavePlanResult, validateTargetWorkspace, } from './save-plan';
export { runSbomGenerate, type SbomGenerateInput, type SbomGenerateResult, } from './sbom-generate';
export { runSchemaDrift, type SchemaDriftResult, } from './schema-drift';
export { runSecretscan, type SecretFinding, type SecretscanErrorResult, type SecretscanResult, } from './secretscan';
export { runSymbols } from './symbols';
export { type SyntaxCheckFileResult, type SyntaxCheckInput, type SyntaxCheckResult, syntaxCheck, } from './syntax-check';
export { buildTestCommand, containsPowerShellMetacharacters, detectCTest, detectDartTest, detectDotnetTest, detectGoTest, detectGradle, detectJavaMaven, detectMinitest, detectRSpec, detectSwiftTest, detectTestFramework, findSourceFiles, getTestFilesFromConvention, getTestFilesFromGraph, hasCompoundTestExtension, isAbsolutePath, MAX_SAFE_TEST_FILES, MAX_TIMEOUT_MS, parseTestOutput, runTests, SUPPORTED_FRAMEWORKS, type TestErrorResult, type TestFramework, type TestResult, type TestRunnerArgs, type TestSuccessResult, type TestTotals, } from './test-runner';
export { executeTodoExtract, findSourceFiles as findSourceFilesForTodo, isSupportedExtension, parseTodoComments, type TodoEntry, type TodoExtractArgs, type TodoExtractError, type TodoExtractResult, validatePathsInput, validateTagsInput, } from './todo-extract';
export { checkReviewerGate, executeUpdateTaskStatus, type ReviewerGateResult, type UpdateTaskStatusArgs, type UpdateTaskStatusResult, validateStatus, validateTaskId, } from './update-task-status';
export { executeWriteRetro, type WriteRetroArgs, } from './write-retro';
