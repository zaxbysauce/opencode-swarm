/**
 * Compaction Customizer Hook
 *
 * Enhances session compaction by injecting swarm context from plan.md and context.md.
 * Adds current phase information and key decisions to the compaction context.
 */
import type { PluginConfig } from '../config';
/**
 * Creates the experimental.session.compacting hook for compaction customization.
 */
export declare function createCompactionCustomizerHook(config: PluginConfig, directory: string): Record<string, unknown>;
