/**
 * Preflight Background Integration
 *
 * Wires the preflight service to background automation:
 * - Subscribes to preflight.requested events
 * - Runs preflight checks
 * - Updates status artifact with results
 */
import { PreflightTriggerManager } from '../background/trigger';
import type { AutomationConfig } from '../config/schema';
import { type PreflightConfig, type PreflightReport } from '../services/preflight-service';
/** Integration configuration */
export interface PreflightIntegrationConfig {
    /** Automation configuration (required for capability gating) */
    automationConfig: AutomationConfig;
    /** Directory to run preflight in */
    directory: string;
    /** Swarm directory for status artifact */
    swarmDir: string;
    /** Preflight check configuration */
    preflightConfig?: PreflightConfig;
    /** Whether to update status artifact (default true) */
    updateStatusArtifact?: boolean;
}
/**
 * Create preflight integration
 *
 * Sets up the handler that will be called when preflight is requested.
 * Returns the trigger manager and cleanup function.
 */
export declare function createPreflightIntegration(config: PreflightIntegrationConfig): {
    manager: PreflightTriggerManager;
    cleanup: () => void;
};
/**
 * Run preflight manually (for testing or CLI)
 */
export declare function runManualPreflight(directory: string, phase: number, config?: PreflightConfig): Promise<PreflightReport>;
