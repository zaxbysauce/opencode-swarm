export type AgentType = 'architect' | 'coder' | 'reviewer' | 'test_engineer' | 'explorer' | 'sme' | 'critic' | 'docs' | 'designer';
export type OutputType = 'review' | 'test' | 'research' | 'analysis' | 'summary';
export interface AgentOutputMetadata {
    agent: AgentType;
    type: OutputType;
    taskId: string;
    phase: number;
    timestamp: string;
    durationMs?: number;
    success?: boolean;
}
/**
 * Write agent output to persistent storage
 * Output: .swarm/outputs/phase-N/task-N.M/{agent}-{type}-{timestamp}.md
 */
export declare function writeAgentOutput(directory: string, metadata: AgentOutputMetadata, content: string): Promise<string>;
/**
 * Read agent output from persistent storage
 */
export declare function readAgentOutput(directory: string, phase: number, taskId: string): Promise<{
    metadata: AgentOutputMetadata;
    content: string;
}[]>;
/**
 * List all agent outputs for a phase
 */
export declare function listAgentOutputs(directory: string, phase?: number): Promise<AgentOutputMetadata[]>;
