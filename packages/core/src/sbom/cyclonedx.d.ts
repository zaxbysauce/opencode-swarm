/**
 * CycloneDX SBOM Emitter
 *
 * Generates CycloneDX BOM format (v1.5 spec)
 */
import type { SbomComponent } from './detectors/index.js';
import { type Ecosystem } from './detectors/index.js';
/**
 * CycloneDX Component
 * Corresponds to a software dependency
 */
export interface CycloneDXComponent {
    /** Component type */
    type: 'library' | 'framework' | 'application';
    /** Package name */
    name: string;
    /** Package version */
    version: string;
    /** Package URL (PURL) */
    purl?: string;
    /** License information */
    licenses?: [{
        license: {
            id?: string;
            name?: string;
        };
    }];
}
/**
 * CycloneDX Metadata
 */
export interface CycloneDXMetadata {
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Tools used to create the BOM */
    tools: [
        {
            /** Tool vendor */
            vendor: string;
            /** Tool name */
            name: string;
            /** Tool version */
            version: string;
        }
    ];
}
/**
 * CycloneDX BOM Document
 * Conforms to CycloneDX v1.5 specification
 */
export interface CycloneDXBom {
    /** BOM format identifier */
    bomFormat: 'CycloneDX';
    /** CycloneDX specification version */
    specVersion: '1.5';
    /** Incremental BOM version */
    version: number;
    /** BOM metadata */
    metadata: CycloneDXMetadata;
    /** List of components */
    components: CycloneDXComponent[];
}
/**
 * Options for generating CycloneDX BOM
 */
export interface CycloneDXOptions {
    /** Custom tool name (default: 'sbom_generate') */
    toolName?: string;
    /** Custom tool version (default: '6.9.0') */
    toolVersion?: string;
    /** BOM version number (default: 1) */
    bomVersion?: number;
}
/**
 * Generate a CycloneDX BOM from SBOM components
 *
 * @param components - List of SBOM components
 * @param options - Optional configuration
 * @returns CycloneDX BOM object
 */
export declare function generateCycloneDX(components: SbomComponent[], options?: CycloneDXOptions): CycloneDXBom;
/**
 * Serialize a CycloneDX BOM to a JSON string
 *
 * @param bom - CycloneDX BOM object
 * @returns JSON string representation
 */
export declare function serializeCycloneDX(bom: CycloneDXBom): string;
/**
 * Generate PURL for a component based on its ecosystem
 * This is a convenience function that can be used externally
 *
 * @param ecosystem - The package ecosystem
 * @param name - Package name
 * @param version - Package version
 * @param namespace - Optional namespace (for golang, maven, swift)
 * @returns Package URL
 */
export declare function generateComponentPurl(ecosystem: Ecosystem, name: string, version: string, namespace?: string): string;
export type { Ecosystem, SbomComponent } from './detectors/index.js';
export { generatePurl } from './detectors/index.js';
