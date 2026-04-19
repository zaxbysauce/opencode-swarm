import type { FlakyTestEntry } from './flaky-detector.js';
export interface QuarantineArtifactEntry {
    testFile: string;
    testName: string;
    flakyScore: number;
    totalRuns: number;
    isQuarantined: boolean;
    recommendation?: string;
}
export interface QuarantineArtifact {
    version: '1.0';
    generatedAt: string;
    quarantinedTests: QuarantineArtifactEntry[];
    summary: {
        totalQuarantined: number;
        averageFlakyScore: number;
        highestFlakyScore: number;
    };
}
export declare function writeQuarantineArtifact(workingDir: string, flakyTests: FlakyTestEntry[]): void;
export declare function readQuarantineArtifact(workingDir: string): QuarantineArtifact | null;
