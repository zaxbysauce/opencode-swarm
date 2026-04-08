/**
 * Tool Doctor Service
 *
 * Validates that every tool name in TOOL_NAMES has a corresponding
 * registration in the plugin's tool: {} block in src/index.ts.
 *
 * Also validates:
 * - AGENT_TOOL_MAP alignment: tools assigned to agents are registered in the plugin
 * - Class 3 tool binary readiness: external binaries needed by lint tools are available
 */
import type { ConfigDoctorResult } from './config-doctor';
/** Result of tool registration coherence check */
export type ToolDoctorResult = ConfigDoctorResult;
/**
 * Run tool registration coherence check
 *
 * Verifies that every entry in TOOL_NAMES has a corresponding key
 * in the plugin's tool: {} block in src/index.ts.
 */
/**
 * Returns a structured advisory string for any missing Class 3 binaries.
 * Intended for injection into the architect's first system prompt.
 * Returns null if all binaries are available.
 */
export declare function getBinaryReadinessAdvisory(): string | null;
export declare function runToolDoctor(_directory: string, pluginRoot?: string): ToolDoctorResult;
