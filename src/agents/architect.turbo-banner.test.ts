import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetSwarmState, startAgentSession, swarmState } from '../state';
import { createArchitectAgent } from './architect';

describe('createArchitectAgent - TURBO MODE BANNER (Task 3.17)', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	// TEST 1: Turbo Mode banner is inserted when hasActiveTurboMode() returns true
	it('1. inserts TURBO MODE BANNER when Turbo Mode is active', () => {
		// Create a session with turboMode: true
		startAgentSession('turbo-session', 'architect');
		const session = swarmState.agentSessions.get('turbo-session');
		session!.turboMode = true;

		// Create the architect agent
		const agent = createArchitectAgent('test-model');

		// Verify banner is present in prompt
		expect(agent.config.prompt).toContain('## 🚀 TURBO MODE ACTIVE');
		expect(agent.config.prompt).toContain(
			'Speed optimization enabled for this session',
		);
		expect(agent.config.prompt).toContain('Stage A gates');
		expect(agent.config.prompt).toContain('Tier 3 tasks');
		expect(agent.config.prompt).toContain('Stage B REQUIRED (no turbo bypass)');
	});

	// TEST 2: Turbo Mode banner is removed when hasActiveTurboMode() returns false
	it('2. removes TURBO MODE BANNER when Turbo Mode is inactive', () => {
		// Create a session with turboMode: false (or don't set turboMode at all)
		startAgentSession('normal-session', 'architect');
		const session = swarmState.agentSessions.get('normal-session');
		session!.turboMode = false;

		// Create the architect agent
		const agent = createArchitectAgent('test-model');

		// Verify banner is NOT present in prompt
		expect(agent.config.prompt).not.toContain('## 🚀 TURBO MODE ACTIVE');
		expect(agent.config.prompt).not.toContain('Speed optimization enabled');
		// The placeholder should be replaced with empty string
		expect(agent.config.prompt).not.toContain('{{TURBO_MODE_BANNER}}');
	});

	// TEST 3: No sessions = Turbo Mode inactive
	it('3. Turbo Mode inactive when no sessions exist', () => {
		// Don't create any sessions - state should be empty
		const agent = createArchitectAgent('test-model');

		// Verify banner is NOT present
		expect(agent.config.prompt).not.toContain('## 🚀 TURBO MODE ACTIVE');
		expect(agent.config.prompt).not.toContain('{{TURBO_MODE_BANNER}}');
	});

	// TEST 4: Multiple sessions - if any has turboMode, banner is shown
	it('4. banner shown if any session has Turbo Mode enabled', () => {
		// Session without turboMode
		startAgentSession('normal-session', 'architect');
		const normalSession = swarmState.agentSessions.get('normal-session');
		normalSession!.turboMode = false;

		// Session WITH turboMode
		startAgentSession('turbo-session', 'architect');
		const turboSession = swarmState.agentSessions.get('turbo-session');
		turboSession!.turboMode = true;

		// Create the architect agent
		const agent = createArchitectAgent('test-model');

		// Banner should be present (any turbo session enables it)
		expect(agent.config.prompt).toContain('## 🚀 TURBO MODE ACTIVE');
	});

	// TEST 5: Banner contains specific Tier/Stage instructions
	it('5. banner contains correct Tier and Stage instructions', () => {
		startAgentSession('turbo-session', 'architect');
		const session = swarmState.agentSessions.get('turbo-session');
		session!.turboMode = true;

		const agent = createArchitectAgent('test-model');
		const prompt = agent.config.prompt;

		// Check specific content from the banner
		expect(prompt).toContain(
			'**Stage A gates** (lint, imports, pre_check_batch) are still REQUIRED',
		);
		expect(prompt).toContain('**Tier 3 tasks**');
		expect(prompt).toContain('still require FULL review (Stage B)');
		expect(prompt).toContain('**Tier 0-2 tasks** can skip Stage B');
		expect(prompt).toContain('TIER 0 (metadata): lint + diff only');
		expect(prompt).toContain('TIER 1 (docs): Stage A + reviewer');
		expect(prompt).toContain(
			'TIER 2 (standard code): Stage A + reviewer + test_engineer',
		);
		expect(prompt).toContain(
			'TIER 3 (critical): Stage A + 2x reviewer + 2x test_engineer',
		);
		expect(prompt).toContain('Do NOT skip Stage A gates');
		expect(prompt).toContain('Do NOT skip Stage B for TIER 3');
	});

	// TEST 6: Agent definition structure is correct
	it('6. returns correct AgentDefinition structure', () => {
		startAgentSession('turbo-session', 'architect');
		const session = swarmState.agentSessions.get('turbo-session');
		session!.turboMode = true;

		const agent = createArchitectAgent('test-model');

		expect(agent).toHaveProperty('name', 'architect');
		expect(agent).toHaveProperty('description');
		expect(agent).toHaveProperty('config');
		expect(agent.config).toHaveProperty('model', 'test-model');
		expect(agent.config).toHaveProperty('temperature', 0.1);
		expect(agent.config).toHaveProperty('prompt');
		expect(typeof agent.config.prompt).toBe('string');
	});
});
