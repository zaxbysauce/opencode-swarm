type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info';
type Ecosystem = 'auto' | 'npm' | 'pip' | 'cargo' | 'go' | 'dotnet' | 'ruby' | 'dart';
interface VulnerabilityFinding {
    package: string;
    installedVersion: string;
    patchedVersion: string | null;
    severity: Severity;
    title: string;
    cve: string | null;
    url: string | null;
}
interface AuditResult {
    ecosystem: string;
    command: string[];
    findings: VulnerabilityFinding[];
    criticalCount: number;
    highCount: number;
    totalCount: number;
    clean: boolean;
    note?: string;
}
interface CombinedAuditResult {
    ecosystems: string[];
    findings: VulnerabilityFinding[];
    criticalCount: number;
    highCount: number;
    totalCount: number;
    clean: boolean;
}
export type { AuditResult, CombinedAuditResult, Ecosystem, Severity, VulnerabilityFinding, };
/**
 * Run the package audit tool
 */
export declare function runPkgAudit(ecosystem: Ecosystem, directory: string): Promise<AuditResult | CombinedAuditResult>;
