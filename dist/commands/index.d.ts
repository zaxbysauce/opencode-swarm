import type { AgentDefinition } from '../agents';
export { handleAgentsCommand } from './agents';
export { handleAnalyzeCommand } from './analyze';
export { handleArchiveCommand } from './archive';
export { handleBenchmarkCommand } from './benchmark';
export { handleClarifyCommand } from './clarify';
export { handleConfigCommand } from './config';
export { handleDarkMatterCommand } from './dark-matter';
export { handleDiagnoseCommand } from './diagnose';
export { handleDoctorCommand } from './doctor';
export { handleEvidenceCommand, handleEvidenceSummaryCommand, } from './evidence';
export { handleExportCommand } from './export';
export { handleHandoffCommand } from './handoff';
export { handleHistoryCommand } from './history';
export { handleKnowledgeListCommand, handleKnowledgeMigrateCommand, handleKnowledgeQuarantineCommand, handleKnowledgeRestoreCommand, } from './knowledge';
export { handlePlanCommand } from './plan';
export { handlePreflightCommand } from './preflight';
export { handlePromoteCommand } from './promote';
export { handleResetCommand } from './reset';
export { handleRetrieveCommand } from './retrieve';
export { handleRollbackCommand } from './rollback';
export { handleSimulateCommand } from './simulate';
export { handleSpecifyCommand } from './specify';
export { handleStatusCommand } from './status';
export { handleSyncPlanCommand } from './sync-plan';
export { handleWriteRetroCommand } from './write_retro';
/**
 * Creates a command.execute.before handler for /swarm commands.
 * Uses factory pattern to close over directory and agents.
 */
export declare function createSwarmCommandHandler(directory: string, agents: Record<string, AgentDefinition>): (input: {
    command: string;
    sessionID: string;
    arguments: string;
}, output: {
    parts: unknown[];
}) => Promise<void>;
