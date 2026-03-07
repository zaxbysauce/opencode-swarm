export type FileZone = 'production' | 'test' | 'config' | 'generated' | 'docs' | 'build';
export interface ZoneClassification {
    filePath: string;
    zone: FileZone;
    confidence: 'high' | 'medium';
    reason: string;
}
export interface ZonePolicy {
    qaDepth: 'full' | 'standard' | 'light' | 'skip';
    lintRequired: boolean;
    testRequired: boolean;
    reviewRequired: boolean;
    securityReviewRequired: boolean;
}
export declare function classifyFile(filePath: string): ZoneClassification;
export declare function classifyFiles(filePaths: string[]): ZoneClassification[];
export declare function getZonePolicy(zone: FileZone): ZonePolicy;
