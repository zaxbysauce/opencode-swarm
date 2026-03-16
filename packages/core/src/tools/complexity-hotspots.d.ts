type Recommendation = 'standard' | 'enhanced_review' | 'security_review' | 'full_gates';
export interface HotspotEntry {
    file: string;
    churnCount: number;
    complexity: number;
    riskScore: number;
    recommendation: Recommendation;
}
export interface ComplexityHotspotsResult {
    analyzedFiles: number;
    period: string;
    hotspots: HotspotEntry[];
    summary: {
        fullGates: number;
        securityReview: number;
        enhancedReview: number;
        standard: number;
    };
}
export interface ComplexityHotspotsError {
    error: string;
    analyzedFiles: 0;
    period: string;
    hotspots: [];
    summary: {
        fullGates: 0;
        securityReview: 0;
        enhancedReview: 0;
        standard: 0;
    };
}
export declare function validateDays(days: unknown): {
    valid: boolean;
    value: number;
    error: string | null;
};
export declare function validateTopN(topN: unknown): {
    valid: boolean;
    value: number;
    error: string | null;
};
export declare function validateExtensions(extensions: unknown): {
    valid: boolean;
    value: string;
    error: string | null;
};
export declare function analyzeHotspots(days: number, topN: number, extensions: string[], directory: string): Promise<ComplexityHotspotsResult>;
export {};
