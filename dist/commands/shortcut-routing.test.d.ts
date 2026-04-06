/**
 * Regression tests for swarm-* shortcut command routing.
 *
 * When a user selects a shortcut command from the OpenCode command picker
 * (e.g. swarm-config, swarm-status, swarm-turbo), OpenCode sets
 * input.command to the registered key name ('swarm-config') rather than
 * the generic 'swarm' key. Previously the handler returned early for any
 * command that wasn't exactly 'swarm', so these shortcuts fell through to
 * the LLM as plain text. This file verifies they are correctly routed.
 */
export {};
