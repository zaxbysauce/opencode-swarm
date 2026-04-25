import type { AgentDefinition } from '../agents/index.js';
export type CommandContext = {
    directory: string;
    args: string[];
    sessionID: string;
    agents: Record<string, AgentDefinition>;
};
export type CommandResult = Promise<string>;
export type CommandEntry = {
    handler: (ctx: CommandContext) => CommandResult;
    /** Human-readable description shown in /swarm help and CLI --help */
    description: string;
    /** If true, this command is only accessible as a sub-key of a parent command */
    subcommandOf?: string;
    /**
     * 2-3 line behavioral summary: what the command does step-by-step,
     * side effects, and safety guarantees.
     */
    details?: string;
    /**
     * Documents flags and positional arguments. Format: flags comma-separated with
     * double-dash prefix, positional args in angle brackets.
     * Example: args: '--dry-run, --confirm, <phase-number>'
     */
    args?: string;
};
export declare const COMMAND_REGISTRY: {
    readonly 'acknowledge-spec-drift': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Acknowledge that the spec has drifted from the plan and suppress further warnings";
        readonly args: "";
    };
    readonly status: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show current swarm state";
    };
    readonly plan: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show plan (optionally filter by phase number)";
    };
    readonly agents: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "List registered agents";
    };
    readonly history: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show completed phases summary";
    };
    readonly config: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show current resolved configuration";
    };
    readonly 'config doctor': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run config doctor checks";
        readonly subcommandOf: "config";
    };
    readonly 'config-doctor': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run config doctor checks";
        readonly subcommandOf: "config";
    };
    readonly 'doctor tools': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run tool registration coherence check";
    };
    readonly diagnose: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run health check on swarm state";
    };
    readonly diagnosis: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run health check on swarm state";
    };
    readonly preflight: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run preflight automation checks";
    };
    readonly 'sync-plan': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Ensure plan.json and plan.md are synced";
        readonly args: "";
    };
    readonly benchmark: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show performance metrics [--cumulative] [--ci-gate]";
        readonly args: "--cumulative, --ci-gate";
    };
    readonly export: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Export plan and context as JSON";
        readonly args: "";
        readonly details: "Exports the current plan and context as JSON to stdout. Useful for piping to external tools or debugging swarm state.";
    };
    readonly evidence: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show evidence bundles [taskId]";
        readonly args: "<taskId>";
        readonly details: "Displays review results, test verdicts, and other evidence bundles for the given task ID (e.g., \"2.1\").";
    };
    readonly 'evidence summary': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Generate evidence summary with completion ratio and blockers";
        readonly subcommandOf: "evidence";
        readonly args: "";
        readonly details: "Generates a summary showing completion ratio across all tasks, lists blockers, and identifies missing evidence.";
    };
    readonly 'evidence-summary': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Generate evidence summary with completion ratio and blockers";
        readonly subcommandOf: "evidence";
        readonly args: "";
        readonly details: "Generates a summary showing completion ratio across all tasks, lists blockers, and identifies missing evidence.";
    };
    readonly archive: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Archive old evidence bundles [--dry-run]";
        readonly details: "Archives evidence bundles older than max_age_days (config, default 90) or beyond max_bundles cap (config, default 1000). --dry-run previews which bundles would be archived without deleting them. Applies two-tier retention: age-based first, then count-based on oldest remaining.";
        readonly args: "--dry-run";
    };
    readonly curate: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run knowledge curation and hive promotion review";
        readonly args: "";
    };
    readonly 'dark-matter': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Detect hidden file couplings via co-change NPMI analysis";
        readonly args: "--threshold <number>, --min-commits <number>";
    };
    readonly close: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Use /swarm close to close the swarm project and archive evidence";
        readonly details: "Idempotent 4-stage terminal finalization: (1) finalize writes retrospectives for in-progress phases, (2) archive creates timestamped bundle of swarm artifacts and evidence, (3) clean removes active-state files for a clean slate, (4) align performs safe git ff-only to main. Resets agent sessions and delegation chains. Reads .swarm/close-lessons.md for explicit lessons and runs curation.";
        readonly args: "--prune-branches";
    };
    readonly simulate: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Dry-run hidden coupling analysis with configurable thresholds";
        readonly args: "--threshold <number>, --min-commits <number>";
    };
    readonly analyze: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Analyze spec.md vs plan.md for requirement coverage gaps";
        readonly args: "";
    };
    readonly clarify: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Clarify and refine an existing feature specification";
        readonly args: "[description-text]";
    };
    readonly specify: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Generate or import a feature specification [description]";
        readonly args: "[description-text]";
    };
    readonly brainstorm: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Enter architect MODE: BRAINSTORM — structured seven-phase planning workflow [topic]";
        readonly args: "[topic-text]";
        readonly details: "Triggers the architect to run the brainstorm workflow: CONTEXT SCAN, single-question DIALOGUE, APPROACHES, DESIGN SECTIONS, SPEC WRITE + SELF-REVIEW, QA GATE SELECTION, TRANSITION. Use for new plans where requirements need to be drawn out before writing spec.md / plan.md.";
    };
    readonly council: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Enter architect MODE: COUNCIL — multi-model deliberation [question] [--preset <name>] [--spec-review]";
        readonly args: "<question> [--preset <name>] [--spec-review]";
        readonly details: "Triggers the architect to convene a configurable General Council: each member independently web-searches, answers, and engages in one structured deliberation round on disagreements; an optional moderator pass synthesizes the final answer. --preset <name> selects a member group from council.general.presets. --spec-review switches to single-pass advisory mode for spec review. Requires council.general.enabled: true and a search API key in opencode-swarm.json.";
    };
    readonly 'qa-gates': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "View or modify QA gate profile for the current plan [enable|override <gate>...]";
        readonly args: "[show|enable|override] <gate>...";
        readonly details: "show: display spec-level, session-override, and effective QA gates for the current plan. enable: persist gate(s) into the locked-once profile (architect; rejected after critic approval lock). override: session-only ratchet-tighter enable. Valid gates: reviewer, test_engineer, council_mode, sme_enabled, critic_pre_plan, hallucination_guard, sast_enabled, mutation_test, council_general_review.";
    };
    readonly promote: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Manually promote lesson to hive knowledge";
        readonly details: "Promotes a lesson directly to hive knowledge (--category flag sets category) or references an existing swarm lesson by ID (--from-swarm). Validates lesson text before promotion. Either direct text or --from-swarm ID is required.";
        readonly args: "--category <category>, --from-swarm <lesson-id>, <lesson-text>";
    };
    readonly reset: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Clear swarm state files [--confirm]";
        readonly details: "DELETES plan.md, context.md, and summaries/ directory from .swarm/. Stops background automation and clears in-memory queues. SAFETY: requires --confirm flag — without it, displays a warning and tips to export first.";
        readonly args: "--confirm (required)";
    };
    readonly 'reset-session': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Clear session state while preserving plan, evidence, and knowledge";
        readonly details: "Deletes only .swarm/session/state.json and any other session files. Clears in-memory agent sessions and delegation chains. Preserves plan, evidence, and knowledge for cross-session continuity.";
        readonly args: "";
    };
    readonly rollback: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Restore swarm state to a checkpoint <phase>";
        readonly details: "Restores .swarm/ state by directly overwriting files from a checkpoint directory (checkpoints/phase-<N>). Writes rollback event to events.jsonl. Without phase argument, lists available checkpoints. Partial failures are reported but processing continues.";
        readonly args: "<phase-number>";
    };
    readonly retrieve: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Retrieve full output from a summary <id>";
        readonly args: "<summary-id>";
        readonly details: "Loads the full tool output that was previously summarized (referenced by IDs like S1, S2). Use when you need the complete output instead of the truncated summary.";
    };
    readonly handoff: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Prepare state for clean model switch (new session)";
        readonly args: "";
        readonly details: "Generates handoff.md with full session state snapshot, including plan progress, recent decisions, and agent delegation history. Prepended to the next session prompt for seamless model switches.";
    };
    readonly turbo: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Toggle Turbo Mode for the active session [on|off]";
        readonly args: "on, off";
        readonly details: "Toggles Turbo Mode which skips non-critical QA gates for faster iteration. When enabled, the architect can proceed without waiting for all automated checks. Session-scoped — resets on new session. Use \"on\" or \"off\" to set explicitly, or toggle with no argument.";
    };
    readonly 'full-auto': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Toggle Full-Auto Mode for the active session [on|off]";
        readonly args: "on, off";
        readonly details: "Toggles Full-Auto Mode which enables autonomous execution without confirmation prompts. When enabled, the architect proceeds through implementation steps automatically. Session-scoped — resets on new session. Use \"on\" or \"off\" to set explicitly, or toggle with no argument.";
    };
    readonly 'write-retro': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Write a retrospective evidence bundle for a completed phase <json>";
        readonly details: "Writes retrospective evidence bundle to .swarm/evidence/retro-{phase}/evidence.json. Required JSON: phase, summary, task_count, task_complexity, total_tool_calls, coder_revisions, reviewer_rejections, test_failures, security_findings, integration_issues. Optional: lessons_learned (max 5), top_rejection_reasons, task_id, metadata.";
        readonly args: "<json: {phase, summary, task_count, task_complexity, ...}>";
    };
    readonly 'knowledge migrate': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Migrate knowledge entries to the current format";
        readonly subcommandOf: "knowledge";
        readonly details: "One-time migration from .swarm/context.md SME cache to .swarm/knowledge.jsonl. Skips if sentinel file .swarm/.knowledge-migrated exists, if context.md is absent, or if context.md is empty. Reports entries migrated, dropped (validation/dedup), and total processed.";
        readonly args: "<directory>";
    };
    readonly 'knowledge quarantine': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Move a knowledge entry to quarantine <id> [reason]";
        readonly subcommandOf: "knowledge";
        readonly details: "Moves a knowledge entry to quarantine with optional reason string (defaults to \"Quarantined via /swarm knowledge quarantine command\"). Validates entry ID format (1-64 alphanumeric/hyphen/underscore). Quarantined entries are excluded from knowledge queries.";
        readonly args: "<entry-id> [reason]";
    };
    readonly 'knowledge restore': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Restore a quarantined knowledge entry <id>";
        readonly subcommandOf: "knowledge";
        readonly details: "Restores a quarantined knowledge entry back to the active knowledge store by ID. Validates entry ID format (1-64 alphanumeric/hyphen/underscore). Entry must currently be in quarantine state.";
        readonly args: "<entry-id>";
    };
    readonly knowledge: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "List knowledge entries";
    };
    readonly checkpoint: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Manage project checkpoints [save|restore|delete|list] <label>";
        readonly details: "save: creates named snapshot of current .swarm/ state. restore: soft-resets to checkpoint by overwriting current .swarm/ files. delete: removes named checkpoint. list: shows all checkpoints with timestamps. All subcommands require a label except list.";
        readonly args: "<save|restore|delete|list> <label>";
    };
};
export type RegisteredCommand = keyof typeof COMMAND_REGISTRY;
export declare const VALID_COMMANDS: RegisteredCommand[];
/**
 * Resolves compound commands like "evidence summary" and "config doctor".
 * Tries a two-token compound key first, then falls back to a single-token key.
 */
export declare function resolveCommand(tokens: string[]): {
    entry: CommandEntry;
    remainingArgs: string[];
} | null;
