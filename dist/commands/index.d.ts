import type { AgentDefinition } from '../agents';
export { handleAgentsCommand } from './agents';
export { handleArchiveCommand } from './archive';
export { handleBenchmarkCommand } from './benchmark';
export { handleConfigCommand } from './config';
export { handleDiagnoseCommand } from './diagnose';
export { handleEvidenceCommand } from './evidence';
export { handleExportCommand } from './export';
export { handleHistoryCommand } from './history';
export { handlePlanCommand } from './plan';
export { handleResetCommand } from './reset';
export { handleStatusCommand } from './status';
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
