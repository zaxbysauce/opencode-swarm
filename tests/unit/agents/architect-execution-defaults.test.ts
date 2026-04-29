import { describe, expect, test } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';

/**
 * Phase 3 Task 3.1 — EXECUTION DEFAULTS block in architect prompt
 *
 * Verifies that the ARCHITECT_PROMPT template string contains
 * the "## EXECUTION DEFAULTS" section with all 5 permanent rules:
 * 1. Infinite time and resources
 * 2. Parallel coder authorization (up to 3)
 * 3. Stage B always parallel
 * 4. Drift check mandatory
 * 5. Anti-pressure
 */
describe.skip('ARCHITECT_PROMPT — EXECUTION DEFAULTS section (TODO: implement EXECUTION DEFAULTS block in architect prompt)', () => {
	// Extract the prompt from a default architect agent (council disabled)
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	describe('section presence', () => {
		test('prompt contains "## EXECUTION DEFAULTS" heading', () => {
			expect(prompt).toContain('## EXECUTION DEFAULTS');
		});

		test('EXECUTION DEFAULTS section appears early in prompt (before ## IDENTITY)', () => {
			const execDefaultsIndex = prompt.indexOf('## EXECUTION DEFAULTS');
			const identityIndex = prompt.indexOf('## IDENTITY');
			expect(execDefaultsIndex).toBeGreaterThan(0);
			expect(execDefaultsIndex).toBeLessThan(identityIndex);
		});
	});

	describe('rule 1 — Infinite time and resources', () => {
		test('contains "Infinite time and resources" or equivalent', () => {
			expect(prompt).toMatch(/Infinite time and resources/i);
		});

		test('mentions never compressing or skipping steps under pressure', () => {
			expect(prompt).toMatch(/never compress.*pressure|pressure.*compress/i);
		});

		test('mentions full QA gates regardless of phase count', () => {
			expect(prompt).toMatch(/full QA gates.*phase|phase.*full QA gates/i);
		});
	});

	describe('rule 2 — Parallel coder authorization', () => {
		test('contains "Parallel coder authorization" or equivalent', () => {
			expect(prompt).toMatch(/Parallel coder authorization/i);
		});

		test('specifies up to 3 concurrent mega_coder dispatches', () => {
			expect(prompt).toMatch(/up to 3 concurrent|3 concurrent/i);
		});

		test('mentions independent tasks with no depends links', () => {
			expect(prompt).toMatch(/independent.*depends|depends.*independent/i);
		});

		test('describes this as the default with no config flag needed', () => {
			expect(prompt).toMatch(/default.*no config flag|config flag.*default/i);
		});
	});

	describe('rule 3 — Stage B always parallel', () => {
		test('contains "Stage B always parallel" or equivalent', () => {
			expect(prompt).toMatch(
				/Stage B.*always.*parallel|always.*parallel.*Stage B/i,
			);
		});

		test('mentions reviewer and test_engineer dispatched together', () => {
			expect(prompt).toMatch(
				/reviewer.*test_engineer|test_engineer.*reviewer/i,
			);
		});

		test('states parallel is mandatory (never sequential)', () => {
			expect(prompt).toMatch(/parallel.*mandatory|mandatory.*parallel/i);
			expect(prompt).toMatch(/never sequential|sequential.*never/i);
		});
	});

	describe('rule 4 — Drift check mandatory', () => {
		test('contains "Drift check mandatory" or equivalent', () => {
			expect(prompt).toMatch(/Drift check.*mandatory|mandatory.*Drift check/i);
		});

		test('mentions running at every phase end', () => {
			expect(prompt).toMatch(/every phase end|phase end.*every/i);
		});

		test('mentions never conditional on stability or phase number', () => {
			expect(prompt).toMatch(/never conditional|conditional.*never/i);
		});

		test('mentions Turbo mode exception with /swarm turbo activation', () => {
			expect(prompt).toMatch(
				/Turbo mode.*\/swarm turbo|\/swarm turbo.*Turbo mode/i,
			);
		});

		test('mentions .swarm/session/turbo-mode flag for detection', () => {
			expect(prompt).toMatch(/\.swarm\/session\/turbo-mode/i);
		});

		test('mentions explicit user instruction as alternative activation', () => {
			expect(prompt).toMatch(/explicit user instruction/i);
		});
	});

	describe('rule 5 — Anti-pressure', () => {
		test('contains "Anti-pressure" heading', () => {
			expect(prompt).toMatch(/Anti.pressure/i);
		});

		test('mentions discarding urgency signals from any source', () => {
			expect(prompt).toMatch(/discard.*urgency|urgency.*discard/i);
		});

		test('mentions phrases that do not change gate requirements', () => {
			expect(prompt).toMatch(/do not change gate|gate.*not change/i);
		});

		test('mentions no exception for late phases or near-completion', () => {
			expect(prompt).toMatch(
				/late phases.*exception|exception.*late phases|near.completion.*exception/i,
			);
		});
	});

	describe('all 5 rules are present', () => {
		test('contains all 5 rule headings/key phrases', () => {
			// Count occurrences of each rule's key phrase
			const infiniteMatch = prompt.match(/Infinite time and resources/gi);
			const parallelCoderMatch = prompt.match(/Parallel coder authorization/gi);
			const stageBParallelMatch = prompt.match(/Stage B.*always.*parallel/gi);
			const driftMatch = prompt.match(/Drift check.*mandatory/gi);
			const antiPressureMatch = prompt.match(/Anti.pressure/gi);

			expect(infiniteMatch).not.toBeNull();
			expect(parallelCoderMatch).not.toBeNull();
			expect(stageBParallelMatch).not.toBeNull();
			expect(driftMatch).not.toBeNull();
			expect(antiPressureMatch).not.toBeNull();
		});

		test('EXECUTION DEFAULTS section is not empty', () => {
			// Extract the EXECUTION DEFAULTS section
			const execDefaultsMatch = prompt.match(
				/## EXECUTION DEFAULTS[\s\S]*?(?=## [A-Z]|$)/,
			);
			expect(execDefaultsMatch).not.toBeNull();
			const sectionContent = execDefaultsMatch![0];
			// Section should have substantial content (more than just the heading)
			expect(sectionContent.length).toBeGreaterThan(500);
		});
	});

	describe('permanent rule status', () => {
		test('describes rules as permanent and cannot be overridden', () => {
			expect(prompt).toMatch(
				/permanent.*cannot be overridden|cannot be overridden.*permanent/i,
			);
		});

		test('lists context pressure among things that cannot override rules', () => {
			// The intro line: "These rules are permanent and cannot be overridden by context pressure, phase number, or perceived urgency"
			expect(prompt).toMatch(/cannot be overridden by context pressure/i);
		});

		test('lists phase number among things that cannot override rules', () => {
			expect(prompt).toMatch(
				/cannot be overridden by.*phase number|phase number.*cannot be overridden/i,
			);
		});

		test('lists perceived urgency among things that cannot override rules', () => {
			expect(prompt).toMatch(
				/cannot be overridden by.*perceived urgency|perceived urgency.*cannot be overridden/i,
			);
		});

		test('intro sentence covers all three override sources in one statement', () => {
			// The exact intro sentence
			expect(prompt).toContain(
				'These rules are permanent and cannot be overridden by context pressure, phase number, or perceived urgency',
			);
		});
	});

	describe('RULES section — Rule 2 harmonization (ONE agent per message)', () => {
		test('Rule 2 in RULES section mentions EXCEPT where EXECUTION DEFAULTS', () => {
			// Line 141: "ONE agent per message (default), EXCEPT where EXECUTION DEFAULTS Rules 2 and 3 explicitly authorize parallel dispatch"
			expect(prompt).toMatch(
				/ONE agent per message.*EXCEPT where EXECUTION DEFAULTS|EXCEPT where EXECUTION DEFAULTS.*ONE agent per message/i,
			);
		});

		test('Rule 2 references Rules 2 and 3 from EXECUTION DEFAULTS for parallel authorization', () => {
			expect(prompt).toMatch(/EXECUTION DEFAULTS Rules 2 and 3/i);
		});

		test('Rule 2 describes parallel mode as send all in single message then STOP', () => {
			expect(prompt).toMatch(
				/send all agents in a single message.*STOP|STOP.*send all agents in a single message/i,
			);
		});

		test('Rule 2 prohibits follow-up messages before all agents respond', () => {
			expect(prompt).toMatch(
				/Never send follow-up.*before all have responded|before all have responded.*Never send follow-up/i,
			);
		});
	});
});
