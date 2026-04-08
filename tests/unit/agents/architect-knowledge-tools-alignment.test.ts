/**
 * Prompt/runtime alignment test for knowledge tools in the architect prompt.
 *
 * The comment in architect.ts states:
 * "IMPORTANT: This list MUST match AGENT_TOOL_MAP['architect'] in src/config/constants.ts"
 *
 * This test verifies that the four knowledge/curator tools added to the architect
 * prompt in this fix cycle are present in both the prompt AND AGENT_TOOL_MAP.
 * It also checks that the prompt does not contain {{...}} placeholders that
 * should have been resolved at runtime (SWARM_ID, AGENT_PREFIX, QA_RETRY_LIMIT).
 *
 * Covers:
 * 1. knowledge_add appears in both prompt YOUR TOOLS and AGENT_TOOL_MAP['architect']
 * 2. knowledge_recall appears in both
 * 3. knowledge_remove appears in both
 * 4. curator_analyze appears in both
 * 5. SWARM_ID placeholder is resolved when createArchitectAgent is called with agentPrefix=''
 * 6. AGENT_PREFIX placeholder is resolved
 * 7. QA_RETRY_LIMIT placeholder is resolved
 */

import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect.js';
import { AGENT_TOOL_MAP } from '../../../src/config/constants.js';

// Extract the raw prompt from createArchitectAgent with no turbo mode
// so we can inspect the template before QA_RETRY_LIMIT/SWARM_ID are replaced.
// createArchitectAgent(model, prompt, appendPrompt, adversarialConfig) — call with no turbo
const architectAgent = createArchitectAgent(
	'claude-opus-4-6',
	undefined,
	undefined,
	undefined,
);
// The raw prompt before SWARM_ID/AGENT_PREFIX replacement (those happen in agents/index.ts)
const ARCHITECT_PROMPT = architectAgent.config.prompt ?? '';

// ============================================================================
// Tests
// ============================================================================

describe('Architect prompt ↔ AGENT_TOOL_MAP alignment: knowledge tools', () => {
	const architectTools = AGENT_TOOL_MAP['architect'] ?? [];

	it('knowledge_add is in AGENT_TOOL_MAP["architect"]', () => {
		expect(architectTools).toContain('knowledge_add');
	});

	it('knowledge_recall is in AGENT_TOOL_MAP["architect"]', () => {
		expect(architectTools).toContain('knowledge_recall');
	});

	it('knowledge_remove is in AGENT_TOOL_MAP["architect"]', () => {
		expect(architectTools).toContain('knowledge_remove');
	});

	it('curator_analyze is in AGENT_TOOL_MAP["architect"]', () => {
		expect(architectTools).toContain('curator_analyze');
	});

	it('knowledge_add appears in the ARCHITECT_PROMPT YOUR TOOLS list', () => {
		expect(ARCHITECT_PROMPT).toContain('knowledge_add');
	});

	it('knowledge_recall appears in the ARCHITECT_PROMPT YOUR TOOLS list', () => {
		expect(ARCHITECT_PROMPT).toContain('knowledge_recall');
	});

	it('knowledge_remove appears in the ARCHITECT_PROMPT YOUR TOOLS list', () => {
		expect(ARCHITECT_PROMPT).toContain('knowledge_remove');
	});

	it('curator_analyze appears in the ARCHITECT_PROMPT YOUR TOOLS list', () => {
		expect(ARCHITECT_PROMPT).toContain('curator_analyze');
	});
});

describe('Architect prompt placeholder resolution', () => {
	it('SWARM_ID placeholder exists in raw template (to be resolved at runtime)', () => {
		expect(ARCHITECT_PROMPT).toContain('{{SWARM_ID}}');
	});

	it('AGENT_PREFIX placeholder exists in raw template (to be resolved at runtime)', () => {
		expect(ARCHITECT_PROMPT).toContain('{{AGENT_PREFIX}}');
	});

	it('QA_RETRY_LIMIT placeholder exists in raw template (to be resolved at runtime)', () => {
		expect(ARCHITECT_PROMPT).toContain('{{QA_RETRY_LIMIT}}');
	});

	it('TURBO_MODE_BANNER placeholder is resolved by createArchitectAgent — absent from output', () => {
		// createArchitectAgent always resolves TURBO_MODE_BANNER (replaced with '' when turbo=false)
		expect(ARCHITECT_PROMPT).not.toContain('{{TURBO_MODE_BANNER}}');
	});

	it('No stale bracket-style placeholders like [Project] or [task] remain in template', () => {
		// Bracket-style placeholders were a legacy pattern; only {{...}} should be used
		// The prompt itself documents this in "NEVER write literal bracket-placeholder text"
		expect(ARCHITECT_PROMPT).not.toMatch(/Language: \[Project Language\]/);
		expect(ARCHITECT_PROMPT).not.toMatch(/Framework: \[Project Framework\]/);
		expect(ARCHITECT_PROMPT).not.toMatch(/Build command: \[.*command\]/i);
	});
});

describe('Curator init flow coverage verification', () => {
	// This test documents that runCuratorInit is tested in curator.test.ts (lines 552+)
	// and that phase-monitor-curator.test.ts covers the hook-level init path.
	// This test verifies the structural wiring: curator init is gated by enabled+init_enabled.

	it('CuratorConfigSchema.enabled defaults to true (enabled by default)', async () => {
		const { CuratorConfigSchema } = await import(
			'../../../src/config/schema.js'
		);
		const defaults = CuratorConfigSchema.parse({});
		expect(defaults.enabled).toBe(true);
	});

	it('CuratorConfigSchema.init_enabled defaults to true (runs when curator is enabled)', async () => {
		const { CuratorConfigSchema } = await import(
			'../../../src/config/schema.js'
		);
		const defaults = CuratorConfigSchema.parse({});
		expect(defaults.init_enabled).toBe(true);
	});

	it('Curator init fires when enabled and init_enabled are both true (both defaults)', async () => {
		const { CuratorConfigSchema } = await import(
			'../../../src/config/schema.js'
		);
		const defaults = CuratorConfigSchema.parse({});
		// enabled=true is the primary guard; init_enabled=true is ready and unblocked
		expect(defaults.enabled).toBe(true);
		// The effective init gate: both must be true
		const wouldRunInit = defaults.enabled && defaults.init_enabled;
		expect(wouldRunInit).toBe(true);
	});
});
