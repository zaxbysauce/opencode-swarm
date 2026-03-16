/**
 * SAST Scan Tool - Static Application Security Testing
 * Integrates Tier A rules (offline) and optional Semgrep (Tier B)
 */
import type { PluginConfig } from '../config';
import type { EvidenceVerdict } from '../config/evidence-schema';
export interface SastScanInput {
    /** List of files to scan */
    changed_files: string[];
    /** Minimum severity that causes failure (default: 'medium') */
    severity_threshold?: 'low' | 'medium' | 'high' | 'critical';
}
export interface SastScanResult {
    /** Overall verdict: pass if no findings above threshold, fail otherwise */
    verdict: EvidenceVerdict;
    /** Array of security findings */
    findings: SastScanFinding[];
    /** Summary information */
    summary: {
        /** Engine used for scanning */
        engine: 'tier_a' | 'tier_a+tier_b';
        /** Number of files scanned */
        files_scanned: number;
        /** Total number of findings */
        findings_count: number;
        /** Breakdown of findings by severity */
        findings_by_severity: {
            critical: number;
            high: number;
            medium: number;
            low: number;
        };
    };
}
export interface SastScanFinding {
    rule_id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    location: {
        file: string;
        line: number;
        column?: number;
    };
    remediation?: string;
}
/**
 * SAST Scan tool - Static Application Security Testing
 * Scans changed files for security vulnerabilities using:
 * - Tier A: Built-in pattern-based rules (always runs)
 * - Tier B: Semgrep (optional, if available on PATH)
 */
export declare function sastScan(input: SastScanInput, directory: string, config?: PluginConfig): Promise<SastScanResult>;
