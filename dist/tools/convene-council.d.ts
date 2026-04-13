/**
 * Work Complete Council — architect-only tool.
 *
 * Accepts parallel verdicts from critic, reviewer, sme, and test_engineer,
 * then synthesizes them into a veto-aware overall verdict with required fixes
 * and a single unified feedback document.
 *
 * Config-gated (council.enabled must be true) and architect-only via
 * AGENT_TOOL_MAP. Follows the check-gate-status.ts pattern.
 */
import { tool } from '@opencode-ai/plugin';
export declare const convene_council: ReturnType<typeof tool>;
