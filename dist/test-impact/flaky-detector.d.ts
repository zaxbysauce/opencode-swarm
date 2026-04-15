import type { TestRunRecord } from './history-store.js';
export interface FlakyTestEntry {
    testFile: string;
    testName: string;
    flakyScore: number;
    totalRuns: number;
    alternationCount: number;
    isQuarantined: boolean;
    recentResults: Array<'pass' | 'fail' | 'skip'>;
    recommendation?: string;
}
export declare function computeFlakyScore(history: TestRunRecord[]): number;
export declare function detectFlakyTests(allHistory: TestRunRecord[]): FlakyTestEntry[];
export declare function isTestQuarantined(testFile: string, testName: string, allHistory: TestRunRecord[]): boolean;
