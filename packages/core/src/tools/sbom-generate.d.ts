/**
 * SBOM Generate Tool
 *
 * Generates Software Bill of Materials (SBOM) by scanning project
 * for manifest/lock files and generating CycloneDX format output.
 */
export interface SbomGenerateInput {
    /** Scope of the scan: 'changed' for modified files only, 'all' for entire project */
    scope: 'changed' | 'all';
    /** Optional output directory (default: .swarm/evidence/sbom/) */
    output_dir?: string;
    /** Required if scope='changed': list of changed files */
    changed_files?: string[];
}
export interface SbomGenerateResult {
    /** Verdict: 'pass' if SBOM generated successfully, 'skip' if no manifests found */
    verdict: 'pass' | 'skip';
    /** Array of manifest/lock file paths discovered */
    files: string[];
    /** Number of components in the SBOM */
    components_count: number;
    /** Path to the generated SBOM file */
    output_path: string;
}
/**
 * Run SBOM generation
 */
export declare function runSbomGenerate(input: SbomGenerateInput, workingDir: string): Promise<SbomGenerateResult>;
