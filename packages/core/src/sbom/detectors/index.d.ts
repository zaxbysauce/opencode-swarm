/**
 * SBOM Detector Registry and Common Types
 *
 * Provides detectors for extracting dependency information from
 * manifest and lock files across 8 ecosystems.
 */
export interface SbomComponent {
    /** Package name */
    name: string;
    /** Package version */
    version: string;
    /** Component type */
    type: 'library' | 'framework' | 'application';
    /** Package URL (PURL) per SPDX spec */
    purl?: string;
    /** Detected license (best effort) */
    license?: string;
}
/** Detector interface for parsing manifest/lock files */
export interface Detector {
    /** Human-readable detector name */
    name: string;
    /** File glob patterns this detector handles */
    patterns: string[];
    /** Parse a file and extract components */
    detect: (filePath: string, content: string) => SbomComponent[];
}
/** Ecosystem identifiers */
export type Ecosystem = 'npm' | 'pypi' | 'cargo' | 'golang' | 'maven' | 'nuget' | 'swift' | 'pub';
/** Map of ecosystem to its detectors */
export interface EcosystemDetector {
    ecosystem: Ecosystem;
    detectors: Detector[];
}
/**
 * Generate a Package URL (PURL) per SPDX specification
 * Format: pkg:<type>/<namespace>/<name>@<version>
 */
export declare function generatePurl(ecosystem: Ecosystem, name: string, version: string, namespace?: string): string;
/**
 * Detect ecosystem from file path
 */
export declare function detectEcosystemFromPath(filePath: string): Ecosystem | null;
/** All registered detectors */
export declare const allDetectors: Detector[];
/**
 * Find detectors matching a file path
 */
export declare function findDetectorsForFile(filePath: string): Detector[];
/**
 * Detect components from a file using appropriate detectors
 */
export declare function detectComponents(filePath: string, content: string): SbomComponent[];
