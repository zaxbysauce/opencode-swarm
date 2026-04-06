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
};
export declare const COMMAND_REGISTRY: {
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
    readonly 'doctor tools': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run tool registration coherence check";
    };
    readonly diagnose: {
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
    };
    readonly benchmark: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show performance metrics [--cumulative] [--ci-gate]";
    };
    readonly export: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Export plan and context as JSON";
    };
    readonly evidence: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Show evidence bundles [taskId]";
    };
    readonly 'evidence summary': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Generate evidence summary with completion ratio and blockers";
        readonly subcommandOf: "evidence";
    };
    readonly archive: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Archive old evidence bundles [--dry-run]";
    };
    readonly curate: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Run knowledge curation and hive promotion review";
    };
    readonly 'dark-matter': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Detect hidden file couplings via co-change NPMI analysis";
    };
    readonly close: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Use /swarm close to close the swarm project and archive evidence";
    };
    readonly simulate: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Dry-run impact analysis of proposed changes [--target <glob>]";
    };
    readonly analyze: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Analyze spec.md vs plan.md for requirement coverage gaps";
    };
    readonly clarify: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Clarify and refine an existing feature specification";
    };
    readonly specify: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Generate or import a feature specification [description]";
    };
    readonly promote: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Manually promote lesson to hive knowledge";
    };
    readonly reset: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Clear swarm state files [--confirm]";
    };
    readonly 'reset-session': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Clear session state while preserving plan, evidence, and knowledge";
    };
    readonly rollback: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Restore swarm state to a checkpoint <phase>";
    };
    readonly retrieve: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Retrieve full output from a summary <id>";
    };
    readonly handoff: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Prepare state for clean model switch (new session)";
    };
    readonly turbo: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Toggle Turbo Mode for the active session [on|off]";
    };
    readonly 'full-auto': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Toggle Full-Auto Mode for the active session [on|off]";
    };
    readonly 'write-retro': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Write a retrospective evidence bundle for a completed phase <json>";
    };
    readonly 'knowledge migrate': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Migrate knowledge entries to the current format";
        readonly subcommandOf: "knowledge";
    };
    readonly 'knowledge quarantine': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Move a knowledge entry to quarantine <id> [reason]";
        readonly subcommandOf: "knowledge";
    };
    readonly 'knowledge restore': {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Restore a quarantined knowledge entry <id>";
        readonly subcommandOf: "knowledge";
    };
    readonly knowledge: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "List knowledge entries";
    };
    readonly checkpoint: {
        readonly handler: (ctx: CommandContext) => Promise<string>;
        readonly description: "Manage project checkpoints [save|restore|delete|list] <label>";
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
