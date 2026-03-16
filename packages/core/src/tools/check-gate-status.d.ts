/**
 * Check gate status tool - read-only tool for querying task gate status.
 * Reads .swarm/evidence/{taskId}.json and returns structured JSON describing
 * which gates have passed, which are missing, and overall task status.
 */
interface GateInfo {
    sessionId: string;
    timestamp: string;
    agent: string;
}
export interface GateStatusResult {
    taskId: string;
    status: 'all_passed' | 'incomplete' | 'no_evidence';
    required_gates: string[];
    passed_gates: string[];
    missing_gates: string[];
    gates: Record<string, GateInfo> | Record<string, never>;
    message: string;
}
/**
 * Run check gate status - returns the status of gates for a task
 */
export declare function runCheckGateStatus(taskIdInput: string, directory: string): Promise<string>;
export {};
