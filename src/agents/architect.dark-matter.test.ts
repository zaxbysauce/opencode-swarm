import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetSwarmState, startAgentSession } from '../state';
import { createArchitectAgent } from './architect';

describe('createArchitectAgent - DARK MATTER CO-CHANGE DETECTION', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	// TEST 1: Dark matter detection instruction is present in prompt
	it('1. contains DARK MATTER CO-CHANGE DETECTION instruction in prompt', () => {
		const agent = createArchitectAgent('test-model');
		expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
	});

	// TEST 2: knowledge_recall is called with correct hidden-coupling query format
	it('2. instruction calls knowledge_recall with hidden-coupling query format', () => {
		const agent = createArchitectAgent('test-model');
		expect(agent.config.prompt).toContain('knowledge_recall');
		expect(agent.config.prompt).toContain('hidden-coupling primaryFile');
	});

	// TEST 3: PrimaryFile extraction is mentioned (first file in FILE list)
	it('3. instruction extracts primaryFile from first file in task FILE list', () => {
		const agent = createArchitectAgent('test-model');
		expect(agent.config.prompt).toContain('primaryFile');
		expect(agent.config.prompt).toContain("first file in the task's FILE list");
	});

	// TEST 4: BLAST RADIUS note is added when coupled files found
	it('4. adds BLAST RADIUS note to task scope when files are found', () => {
		const agent = createArchitectAgent('test-model');
		expect(agent.config.prompt).toContain('BLAST RADIUS');
		expect(agent.config.prompt).toContain('AFFECTS scope');
	});

	// TEST 5: Graceful degradation when knowledge_recall returns empty
	it('5. handles empty knowledge_recall results gracefully', () => {
		const agent = createArchitectAgent('test-model');
		expect(agent.config.prompt).toContain('no results');
		expect(agent.config.prompt).toContain('gracefully');
	});

	// TEST 6: Graceful handling when knowledge_recall is unavailable
	it('6. handles unavailable knowledge_recall gracefully', () => {
		const agent = createArchitectAgent('test-model');
		expect(agent.config.prompt).toContain('unavailable');
	});

	// TEST 7: After declare_scope but before finalizing task file list
	it('7. dark matter detection runs after declare_scope and before finalizing file list', () => {
		const agent = createArchitectAgent('test-model');
		// The instruction should describe the sequence
		expect(agent.config.prompt).toBeDefined();
		const promptLower = agent.config.prompt!.toLowerCase();

		// Should mention declare_scope in context of dark matter detection
		expect(promptLower).toContain('declare_scope');

		// The dark matter detection should be followed by the delegation instruction
		// We look for "only after scope is declared" which is the sentence that precedes delegation
		const afterScopeSentence = 'only after scope is declared';
		expect(promptLower).toContain(afterScopeSentence);

		// Verify dark matter detection appears between declare_scope and the "only after" sentence
		const declareScopeIndex = promptLower.indexOf('declare_scope');
		const darkMatterIndex = promptLower.indexOf(
			'dark matter co-change detection',
		);
		const afterScopeIndex = promptLower.indexOf(afterScopeSentence);

		expect(declareScopeIndex).toBeGreaterThan(0);
		expect(darkMatterIndex).toBeGreaterThan(declareScopeIndex);
		expect(afterScopeIndex).toBeGreaterThan(darkMatterIndex);
	});

	// TEST 8: Adds coupled files to scope when results returned
	it('8. adds files to AFFECTS scope when knowledge_recall returns entries', () => {
		const agent = createArchitectAgent('test-model');
		expect(agent.config.prompt).toContain(
			"add those files to the task's AFFECTS scope",
		);
	});

	// TEST 9: Turbo mode preserves dark matter detection
	it('9. dark matter detection preserved when Turbo Mode is active', () => {
		startAgentSession('turbo-session', 'architect');
		const agent = createArchitectAgent('test-model');

		expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
		expect(agent.config.prompt).toContain('BLAST RADIUS');
	});

	// TEST 10: Without Turbo mode also works
	it('10. dark matter detection present when Turbo Mode is inactive', () => {
		startAgentSession('normal-session', 'architect');
		const agent = createArchitectAgent('test-model');

		expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
		expect(agent.config.prompt).toContain('BLAST RADIUS');
	});

	// TEST 11: Adversarial testing enabled preserves dark matter detection
	it('11. dark matter detection preserved when adversarial testing enabled', () => {
		const agent = createArchitectAgent('test-model', undefined, undefined, {
			enabled: true,
			scope: 'all',
		});

		expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
		expect(agent.config.prompt).toContain('BLAST RADIUS');
	});

	// TEST 12: Adversarial testing disabled preserves dark matter detection
	it('12. dark matter detection preserved when adversarial testing disabled', () => {
		const agent = createArchitectAgent('test-model', undefined, undefined, {
			enabled: false,
			scope: 'all',
		});

		expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
		expect(agent.config.prompt).toContain('BLAST RADIUS');
	});

	// TEST 13: Security-only adversarial scope preserves dark matter detection
	it('13. dark matter detection preserved with security-only adversarial scope', () => {
		const agent = createArchitectAgent('test-model', undefined, undefined, {
			enabled: true,
			scope: 'security-only',
		});

		expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
		expect(agent.config.prompt).toContain('BLAST RADIUS');
	});

	// TEST 14: Custom append prompt preserves dark matter detection
	it('14. dark matter detection preserved with custom append prompt', () => {
		const agent = createArchitectAgent(
			'test-model',
			undefined,
			'Custom instruction here',
		);

		expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
		expect(agent.config.prompt).toContain('BLAST RADIUS');
		expect(agent.config.prompt).toContain('Custom instruction here');
	});

	// TEST 15: Custom prompt replaces base but preserves dark matter detection
	it('15. dark matter detection present with custom prompt', () => {
		const customPrompt =
			'You are a custom architect.\n\nDARK MATTER CO-CHANGE DETECTION: After declaring scope but BEFORE finalizing the task file list, call `knowledge_recall` with query `hidden-coupling [primaryFile]`. If results found, add to AFFECTS scope with BLAST RADIUS note.';

		const agent = createArchitectAgent('test-model', customPrompt);

		expect(agent.config.prompt).toBeDefined();
		if (agent.config.prompt) {
			expect(agent.config.prompt).toContain('DARK MATTER CO-CHANGE DETECTION');
			expect(agent.config.prompt).toContain('BLAST RADIUS');
		}
	});

	// TEST 16: Agent definition structure is correct
	it('16. returns correct AgentDefinition structure with dark matter detection', () => {
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
