/** Project Identity Management for opencode-swarm.
 * Handles creation and retrieval of project identity files.
 */
export interface ProjectIdentity {
    projectHash: string;
    projectName: string;
    repoUrl?: string;
    absolutePath: string;
    createdAt: string;
    swarmVersion: string;
}
/**
 * Get identity file path for a project hash.
 * Path: {platform-config-dir}/projects/{projectHash}/identity.json
 */
export declare function resolveIdentityPath(projectHash: string): string;
/**
 * Read existing identity.json or return null if it doesn't exist.
 */
export declare function readProjectIdentity(projectHash: string): Promise<ProjectIdentity | null>;
/**
 * Create or update identity.json for a project.
 * Uses atomic write pattern (write to temp file, then rename).
 */
export declare function writeProjectIdentity(directory: string, projectHash: string, projectName: string): Promise<ProjectIdentity>;
