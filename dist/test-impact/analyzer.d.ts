export interface TestImpactResult {
    impactedTests: string[];
    unrelatedTests: string[];
    untestedFiles: string[];
    impactMap: Record<string, string[]>;
}
export declare function buildImpactMap(cwd: string): Promise<Record<string, string[]>>;
export declare function loadImpactMap(cwd: string): Promise<Record<string, string[]>>;
export declare function analyzeImpact(changedFiles: string[], cwd: string): Promise<TestImpactResult>;
