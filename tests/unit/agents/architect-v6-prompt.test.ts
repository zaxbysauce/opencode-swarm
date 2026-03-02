import { describe, expect, it } from 'bun:test';
import { createArchitectAgent } from '../../../src/agents/architect';
import { createCriticAgent } from '../../../src/agents/critic';

describe('Architect Prompt v6.0 QA & Security Gates (Task 3.2)', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	// ============================================
	// TASK 3.2: Pre-reviewer Sequence & Security Gate
	// ============================================

	describe('Task 3.2 - Pre-reviewer Sequence (imports, lint, secretscan before reviewer)', () => {
		it('1. Rule 7 contains pre-reviewer sequence: imports', () => {
			expect(prompt).toContain('imports');
		});

		it('2. Rule 7 contains pre-reviewer sequence: lint fix', () => {
			expect(prompt).toContain('lint fix');
		});

		it('3. Rule 7 contains pre-reviewer sequence: lint check', () => {
			// In v6.10, lint check is inside pre_check_batch
			expect(prompt).toContain('pre_check_batch');
			expect(prompt).toContain('lint:check');
		});

		it('4. Rule 7 contains pre-reviewer sequence: secretscan', () => {
			expect(prompt).toContain('secretscan');
		});

		it('5. Rule 7 contains pre-reviewer sequence: reviewer comes after tools', () => {
			// The sequence should be: ... → secretscan → ... → reviewer
			expect(prompt).toMatch(/secretscan.*reviewer|secretscan.*proceed to reviewer/);
		});

		it('6. Rule 7 mentions gates_passed before reviewer', () => {
			// In v6.10, secretscan is inside pre_check_batch; gates_passed triggers progression
			expect(prompt).toContain('gates_passed === true');
			expect(prompt).toContain('proceed to @reviewer');
		});

		it('7. Available Tools includes imports', () => {
			expect(prompt).toContain('Available Tools:');
			expect(prompt).toContain('imports (dependency audit)');
		});

		it('8. Available Tools includes lint', () => {
			expect(prompt).toContain('lint (code quality)');
		});

		it('9. Available Tools includes secretscan', () => {
			expect(prompt).toContain('secretscan (secret detection)');
		});
	});

	describe('Task 3.2 - Security Gate (security-only re-review)', () => {
		it('10. Security gate exists in Rule 7 with security globs', () => {
			expect(prompt).toContain('security globs');
			expect(prompt).toContain('auth, api, crypto, security, middleware, session, token');
		});

		it('11. Security gate triggers on security keywords in coder output', () => {
			expect(prompt).toContain('content has security keywords');
		});

		it('12. Security gate delegates to reviewer with security-only CHECK', () => {
			expect(prompt).toContain('security-only CHECK');
		});

		it('13. Security-only re-review example exists in DELEGATION FORMAT', () => {
			// Check for the example in the delegation format section
			expect(prompt).toContain('Security-only review');
			expect(prompt).toContain('CHECK: [security-only]');
		});

		it('14. Security-only review mentions OWASP Top 10', () => {
			expect(prompt).toContain('OWASP Top 10');
		});

		it('15. Security gate includes secretscan findings trigger', () => {
			// In Phase 5 workflow: "secretscan has ANY findings"
			expect(prompt).toContain('secretscan has ANY findings');
		});
	});

	describe('Rule 7 - Mandatory QA Gate Summary', () => {
		it('16. Rule 7 contains "MANDATORY QA GATE"', () => {
			expect(prompt).toContain('MANDATORY QA GATE');
		});

		it('17. Rule 7 contains STAGE A: AUTOMATED TOOL GATES', () => {
			// v6.12 Task 1.7: STAGE A / STAGE B restructure
			expect(prompt).toContain('STAGE A: AUTOMATED TOOL GATES');
		});

		it('17b. Rule 7 contains STAGE B: AGENT REVIEW GATES', () => {
			expect(prompt).toContain('STAGE B: AGENT REVIEW GATES');
		});

		it('17c. Rule 7 clarifies Stage A limitations', () => {
			expect(prompt).toContain('Stage A passing does NOT mean: code is correct, secure, tested, or reviewed');
		});

		it('17d. Rule 7 states Stage A does not satisfy Stage B', () => {
			expect(prompt).toContain('Stage A passing does not satisfy Stage B');
		});

		it('17e. STAGE A appears BEFORE STAGE B (ordering test)', () => {
			const stageAIndex = prompt.indexOf('STAGE A: AUTOMATED TOOL GATES');
			const stageBIndex = prompt.indexOf('STAGE B: AGENT REVIEW GATES');
			expect(stageAIndex).toBeGreaterThan(-1);
			expect(stageBIndex).toBeGreaterThan(-1);
			expect(stageAIndex).toBeLessThan(stageBIndex);
		});

		it('18. Rule 7 mentions security review in sequence', () => {
			expect(prompt).toContain('security review');
		});

		it('19. Rule 7 mentions verification tests', () => {
			expect(prompt).toContain('verification tests');
		});

		it('20. Rule 7 mentions adversarial tests', () => {
			expect(prompt).toContain('adversarial tests');
		});

		it('21. Rule 7 mentions integration analysis with hasContractChanges', () => {
			expect(prompt).toContain('hasContractChanges');
			expect(prompt).toContain('integration impact analysis');
		});
	});

	// v6.12 Task 1.8: CATASTROPHIC VIOLATION CHECK
	describe('v6.12 Task 1.8 - CATASTROPHIC VIOLATION CHECK', () => {
		it('v6.12 Task 1.8 - CATASTROPHIC VIOLATION CHECK present', () => {
			expect(prompt).toContain('CATASTROPHIC VIOLATION CHECK');
		});

		it('v6.12 Task 1.8 - reviewer delegation question present', () => {
			expect(prompt).toContain('Have I delegated to {{AGENT_PREFIX}}reviewer at least once this phase?');
		});

		it('v6.12 Task 1.8 - zero reviewer delegations warning present', () => {
			expect(prompt).toContain('zero reviewer delegations');
		});
	});

	describe('Rule Structure', () => {
		it('22. No Rule 8 exists', () => {
			expect(prompt).not.toContain('8. **NEVER skip the QA gate');
		});
	});

	describe('Phase 5 Workflow - Pre-reviewer Tools', () => {
		it('23. Phase 5 step 5c is diff tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5c. Run `diff` tool');
		});

		it('24. Phase 5 step 5d is syntax_check tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5d. Run `syntax_check` tool');
		});

		it('25. Phase 5 step 5e is placeholder_scan tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5e. Run `placeholder_scan` tool');
		});

		it('26. Phase 5 step 5f is imports tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5f. Run `imports` tool');
		});

		it('27. Phase 5 step 5g is lint tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5g. Run `lint` tool');
		});

		it('28. Phase 5 step 5h is build_check tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5h. Run `build_check` tool');
		});

		it('29. Phase 5 step 5i is pre_check_batch', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5i. Run `pre_check_batch` tool');
			expect(phase5Section).toContain('lint:check');
			expect(phase5Section).toContain('secretscan');
		});
	});

	describe('Phase 5 Workflow - Security Gate', () => {
		it('30. Phase 5 step 5j is general reviewer', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5j. {{AGENT_PREFIX}}reviewer - General review');
		});

		it('31. Phase 5 step 5k is Security gate', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5k. Security gate');
		});

		it('32. Security gate includes security globs trigger', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('file matches security globs');
		});

		it('33. Security gate includes content keywords trigger', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('content has security keywords');
		});

		it('34. Security gate includes secretscan findings trigger', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('secretscan has ANY findings');
		});

		it('35. Security gate delegates to reviewer security-only', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('{{AGENT_PREFIX}}reviewer security-only');
		});
	});

	describe('Phase 5 Workflow - Test Steps', () => {
		it('36. Phase 5 step 5l is verification tests', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5l. {{AGENT_PREFIX}}test_engineer - Verification tests');
		});

		it('37. Phase 5 step 5m is adversarial tests', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5m. {{AGENT_PREFIX}}test_engineer - Adversarial tests');
		});

		it('38. Phase 5 step 5n is COVERAGE CHECK', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5n. COVERAGE CHECK');
		});

		it('39. Phase 5 step 5o is update plan.md', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5o. Update plan.md');
		});

		it('40. Phase 5 has steps 5a through 5o', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5a.');
			expect(phase5Section).toContain('5b.');
			expect(phase5Section).toContain('5c.');
			expect(phase5Section).toContain('5d.');
			expect(phase5Section).toContain('5e.');
			expect(phase5Section).toContain('5f.');
			expect(phase5Section).toContain('5g.');
			expect(phase5Section).toContain('5h.');
			expect(phase5Section).toContain('5i.');
			expect(phase5Section).toContain('5j.');
			expect(phase5Section).toContain('5k.');
			expect(phase5Section).toContain('5l.');
			expect(phase5Section).toContain('5m.');
			expect(phase5Section).toContain('5n.');
			expect(phase5Section).toContain('5o.');
		});
	});

	describe('Phase 5 Workflow - Retry Logic', () => {
		it('41. Reviewer retry logic mentions QA_RETRY_LIMIT', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('QA_RETRY_LIMIT');
			expect(phase5Section).toContain('coder retry');
		});

		it('42. Security gate has retry logic', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('REJECTED (< {{QA_RETRY_LIMIT}}) → coder retry');
		});
	});

	describe('Adversarial Test Example', () => {
		it('43. Adversarial test example exists', () => {
			expect(prompt).toContain('Adversarial security testing');
			expect(prompt).toContain('attack vectors');
		});
	});

	describe('Integration Analysis Example', () => {
		it('44. Integration analysis example exists', () => {
			expect(prompt).toContain('Integration impact analysis');
			expect(prompt).toContain('BREAKING/COMPATIBLE');
		});
	});

	describe('Rule 10 - Retrospective Tracking', () => {
		it('45. Rule 10 contains "RETROSPECTIVE TRACKING"', () => {
			expect(prompt).toContain('RETROSPECTIVE TRACKING');
		});

		it('46. Rule 10 mentions evidence manager', () => {
			expect(prompt).toContain('evidence manager');
		});

		it('47. Rule 10 lists tracked metrics', () => {
			expect(prompt).toContain('phase_number');
			expect(prompt).toContain('coder_revisions');
			expect(prompt).toContain('reviewer_rejections');
			expect(prompt).toContain('test_failures');
			expect(prompt).toContain('security_findings');
			expect(prompt).toContain('lessons_learned');
		});

		it('48. Rule 10 mentions Phase Metrics reset', () => {
			expect(prompt).toContain('Reset Phase Metrics');
		});
	});

	describe('Phase 6 Structure', () => {
		it('49. Phase 6 has retrospective evidence step', () => {
			const phase6Start = prompt.indexOf('### MODE: PHASE-WRAP');
			const blockersStart = prompt.indexOf('### Blockers');
			const phase6Section = prompt.slice(phase6Start, blockersStart);
			expect(phase6Section).toContain('Write retrospective evidence');
			expect(phase6Section).toContain('evidence manager');
		});

		it('50. Phase 6 mentions Reset Phase Metrics', () => {
			const phase6Start = prompt.indexOf('### MODE: PHASE-WRAP');
			const blockersStart = prompt.indexOf('### Blockers');
			const phase6Section = prompt.slice(phase6Start, blockersStart);
			expect(phase6Section).toContain('Reset Phase Metrics');
		});
	});

	describe('Phase 5 pre_check_batch Gate (v6.10)', () => {
		it('pre_check_batch step exists in Phase 5', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('pre_check_batch');
		});

		it('pre_check_batch runs parallel verification with gates_passed', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('gates_passed');
		});

		it('pre_check_batch failure returns to coder (no reviewer)', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('gates_passed === false');
		});

		it('pre_check_batch includes lint:check', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			const precheckStart = phase5Section.indexOf('pre_check_batch');
			const reviewerPos = phase5Section.indexOf('{{AGENT_PREFIX}}reviewer', precheckStart);
			const precheckSection = phase5Section.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('lint:check');
		});

		it('pre_check_batch includes secretscan', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			const precheckStart = phase5Section.indexOf('pre_check_batch');
			const reviewerPos = phase5Section.indexOf('{{AGENT_PREFIX}}reviewer', precheckStart);
			const precheckSection = phase5Section.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('secretscan');
		});

		it('pre_check_batch includes sast_scan', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			const precheckStart = phase5Section.indexOf('pre_check_batch');
			const reviewerPos = phase5Section.indexOf('{{AGENT_PREFIX}}reviewer', precheckStart);
			const precheckSection = phase5Section.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('sast_scan');
		});

		it('pre_check_batch includes quality_budget', () => {
			const precheckStart = prompt.indexOf('pre_check_batch');
			const reviewerPos = prompt.indexOf('{{AGENT_PREFIX}}reviewer', precheckStart);
			const precheckSection = prompt.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('quality_budget');
		});

		it('pre_check_batch runs BEFORE reviewer', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			const precheckPos = phase5Section.indexOf('pre_check_batch');
			const reviewerPos = phase5Section.indexOf('{{AGENT_PREFIX}}reviewer');
			expect(precheckPos).toBeLessThan(reviewerPos);
		});
	});

	describe('Phase 5 build_check Gate (v6.10)', () => {
		it('build_check step exists in Phase 5 at step 5h', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('5h. Run `build_check` tool');
		});

		it('build_check failure returns to coder', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('BUILD FAILS');
			expect(phase5Section).toContain('return to coder');
		});

		it('build_check success proceeds to pre_check_batch', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('proceed to pre_check_batch');
		});

		it('build_check runs BEFORE pre_check_batch', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			const buildPos = phase5Section.indexOf('build_check');
			const precheckPos = phase5Section.indexOf('pre_check_batch');
			expect(buildPos).toBeLessThan(precheckPos);
		});
	});

	describe('Phase 5 New Tool Gates (v6.10)', () => {
		it('syntax_check step exists at 5d and runs before placeholder_scan', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			const syntaxPos = phase5Section.indexOf('5d. Run `syntax_check`');
			const placeholderPos = phase5Section.indexOf('5e. Run `placeholder_scan`');
			expect(syntaxPos).toBeGreaterThan(-1);
			expect(placeholderPos).toBeGreaterThan(-1);
			expect(syntaxPos).toBeLessThan(placeholderPos);
		});

		it('placeholder_scan runs before imports', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			const placeholderPos = phase5Section.indexOf('placeholder_scan');
			const importsPos = phase5Section.indexOf('5f. Run `imports`');
			expect(placeholderPos).toBeLessThan(importsPos);
		});

		it('syntax_check errors return to coder', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('SYNTACTIC ERRORS');
			expect(phase5Section).toContain('return to coder');
		});

		it('placeholder_scan findings return to coder', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP')
			);
			expect(phase5Section).toContain('PLACEHOLDER FINDINGS');
			expect(phase5Section).toContain('return to coder');
		});
	});

	// ============================================
	// Phase 4: TASK GRANULARITY RULES (v6.11)
	// ============================================

	describe('Architect Prompt Hardening v6.11 - Task Granularity (Phase 4)', () => {
		it('TASK GRANULARITY RULES exists in MODE: PLAN', () => {
			expect(prompt).toContain('TASK GRANULARITY RULES');
		});

		it('SMALL task definition exists', () => {
			expect(prompt).toContain('SMALL task');
			expect(prompt).toContain('1 file');
		});

		it('MEDIUM task definition exists', () => {
			expect(prompt).toContain('MEDIUM task');
		});

		it('Large task definition exists', () => {
			expect(prompt).toContain('LARGE task');
		});

		it('coder receives one task rule exists', () => {
			expect(prompt).toContain('Coder receives ONE task');
		});

		it('Litmus test for task size exists', () => {
			expect(prompt).toContain('Litmus test');
			expect(prompt).toContain('3 bullet points');
		});
	});
});

// ============================================
// Critic Prompt - Task Atomicity (Phase 4)
// ============================================

describe('Critic Prompt - Task Atomicity (Phase 4)', () => {
	const agent = createCriticAgent('test-model');
	const prompt = agent.config.prompt!;

	it('Task Atomicity exists in REVIEW CHECKLIST', () => {
		expect(prompt).toContain('Task Atomicity');
		expect(prompt).toContain('REVIEW CHECKLIST');
	});

	it('checks for multi-file tasks (2+ files)', () => {
		expect(prompt).toContain('2+ files');
	});

	it('checks for compound verbs in task descriptions', () => {
		expect(prompt).toContain('compound verbs');
	});

	it('flags oversized tasks as MAJOR issue', () => {
		expect(prompt).toContain('oversized tasks');
		expect(prompt).toContain('MAJOR');
	});

	it('suggests splitting into sequential single-file tasks', () => {
		expect(prompt).toContain('Split into sequential');
		expect(prompt).toContain('single-file');
	});

	it('mentions coder context blow risk', () => {
		expect(prompt).toContain("blow coder's context");
	});
});

// ============================================
// Phase 6: FAILURE COUNTING and RETRY PROTOCOL (v6.11)
// ============================================

describe('Architect Prompt Hardening v6.11 - Phase 6 (Failure Counting & Retry)', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	it('FAILURE COUNTING exists in Rule 4', () => {
		expect(prompt).toContain('FAILURE COUNTING');
	});

	it('Failure counter increments on tool gate failure', () => {
		expect(prompt).toContain('gates_passed === false');
	});

	it('Failure counter increments on reviewer rejection', () => {
		expect(prompt).toContain('REJECTED by reviewer');
	});

	it('Retry message format exists', () => {
		expect(prompt).toContain('Coder attempt [N/{{QA_RETRY_LIMIT}}] on task');
	});

	it('RETRY PROTOCOL exists before step 5a', () => {
		expect(prompt).toContain('RETRY PROTOCOL');
	});

	it('Structured rejection format specified', () => {
		expect(prompt).toContain('GATE FAILED');
		expect(prompt).toContain('REQUIRED FIX');
	});

	it('Re-entry point at step 5b specified', () => {
		expect(prompt).toContain('Re-enter at step 5b');
	});

	it('Resume at failed step (not beginning) specified', () => {
		expect(prompt).toContain('Resume execution at the failed step');
	});
});

// ============================================
// Phase 2-7: CONSOLIDATED HARDENING v6.11
// ============================================

describe('Architect Prompt Hardening v6.11 - Consolidated', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	// Phase 2 - Namespace
	describe('NAMESPACE RULE', () => {
		it('NAMESPACE RULE present before Rule 1', () => {
			const namespacePos = prompt.indexOf('NAMESPACE RULE');
			const rule1Pos = prompt.indexOf('1. DELEGATE');
			expect(namespacePos).toBeGreaterThan(-1);
			expect(rule1Pos).toBeGreaterThan(-1);
			expect(namespacePos).toBeLessThan(rule1Pos);
		});

		it('plan.md must use Phase N headers', () => {
			expect(prompt).toContain('Output to .swarm/plan.md MUST use "## Phase N" headers');
		});
	});

	// Phase 2 - MODE Labels
	describe('MODE Labels', () => {
		const modes = ['MODE: SPECIFY', 'MODE: CLARIFY-SPEC', 'MODE: RESUME', 'MODE: CLARIFY', 'MODE: DISCOVER', 'MODE: CONSULT',
					   'MODE: PRE-PHASE BRIEFING', 'MODE: PLAN', 'MODE: CRITIC-GATE', 'MODE: EXECUTE', 'MODE: PHASE-WRAP'];

		modes.forEach(mode => {
			it(`${mode} present`, () => {
				expect(prompt).toContain(mode);
			});
		});

		it('MODE labels in correct order within WORKFLOW section', () => {
			// Find the WORKFLOW section to avoid matching MODE labels mentioned in intro
			const workflowStart = prompt.indexOf('## WORKFLOW');
			const workflowSection = prompt.slice(workflowStart);

			// Search for exact section headers to avoid substring matches
			// Use \n for most modes, but handle PRE-PHASE BRIEFING which has text on same line
			const positions = modes.map(m => {
				if (m === 'MODE: PRE-PHASE BRIEFING') {
					return workflowSection.indexOf(`### ${m} `);
				}
				return workflowSection.indexOf(`### ${m}\n`);
			});

			// All MODE labels should be found in WORKFLOW section
			positions.forEach((pos, i) => {
				expect(pos).toBeGreaterThan(-1);
			});

			// And they should be in order
			for (let i = 1; i < positions.length; i++) {
				expect(positions[i]).toBeGreaterThan(positions[i - 1]);
			}
		});
	});

	// Phase 3 - HARD STOP
	describe('HARD STOP', () => {
		it('HARD STOP present in CRITIC-GATE', () => {
			expect(prompt).toContain('⛔ HARD STOP');
		});

		it('Must not proceed without checklist', () => {
			expect(prompt).toContain('MUST NOT proceed to MODE: EXECUTE without printing this checklist');
		});

		it('CRITIC-GATE runs once only', () => {
			expect(prompt).toContain('CRITIC-GATE TRIGGER: Run ONCE');
		});
	});

	// Phase 4 - Task Granularity
	describe('TASK GRANULARITY RULES', () => {
		it('TASK GRANULARITY RULES present in MODE: PLAN', () => {
			expect(prompt).toContain('TASK GRANULARITY RULES');
		});

		it('LARGE task is planning error', () => {
			expect(prompt).toContain('LARGE task in the plan is a planning error');
		});

		it('Coder makes zero scope decisions', () => {
			expect(prompt).toContain('Coder makes zero scope decisions');
		});

		it('Compound verbs forbidden', () => {
			expect(prompt).toContain('compound verbs');
		});
	});

	// Phase 5 - Observable Output
	describe('Observable Output', () => {
		it('REQUIRED Print on step 5c (diff)', () => {
			expect(prompt).toContain('→ REQUIRED: Print "diff:');
		});

		it('REQUIRED Print on step 5i (pre_check_batch)', () => {
			expect(prompt).toContain('→ REQUIRED: Print "pre_check_batch:');
		});

		it('REQUIRED Print on step 5j (reviewer)', () => {
			expect(prompt).toContain('→ REQUIRED: Print "reviewer:');
		});

		it('⛔ TASK COMPLETION GATE present', () => {
			expect(prompt).toContain('⛔ TASK COMPLETION GATE');
		});

		// v6.12 Task 1.5: Task Completion Gate Upgrade
		it('v6.12 Task 1.5 - MUST NOT mark complete without checklist', () => {
			expect(prompt).toContain('You MUST NOT mark a task complete without printing this checklist');
		});

		it('v6.12 Task 1.5 - fabrication warning present', () => {
			expect(prompt).toContain('that is fabrication');
		});

		it('v6.12 Task 1.5 - actual tool/agent output requirement', () => {
			expect(prompt).toContain('Each value must come from actual tool/agent output in this session');
		});

		it('ADVERSARIAL: TASK COMPLETION GATE requires value: ___ placeholders', () => {
			const gateSection = prompt.substring(
				prompt.indexOf('⛔ TASK COMPLETION GATE'),
				prompt.indexOf('5o. Update plan.md')
			);
			expect(gateSection).toContain('value: ___');
		});

		// v6.12 Task 1.6: pre_check_batch SCOPE BOUNDARY
		it('v6.12 Task 1.6 - pre_check_batch SCOPE BOUNDARY section exists', () => {
			expect(prompt).toContain('pre_check_batch SCOPE BOUNDARY');
		});

		it('v6.12 Task 1.6 - does NOT mean code is reviewed', () => {
			expect(prompt).toContain('does NOT mean "code is reviewed."');
		});

		it('v6.12 Task 1.6 - PROCESS VIOLATION statement present', () => {
			expect(prompt).toContain('Treating pre_check_batch as a substitute for reviewer is a PROCESS VIOLATION');
		});
	});

	// Phase 6 - Failure Counting & Retry
	describe('Failure Counting & Retry', () => {
		it('FAILURE COUNTING present', () => {
			expect(prompt).toContain('FAILURE COUNTING');
		});

		it('Retry counter format specified', () => {
			expect(prompt).toContain('Coder attempt [N/{{QA_RETRY_LIMIT}}] on task');
		});

		it('RETRY PROTOCOL present', () => {
			expect(prompt).toContain('RETRY PROTOCOL');
		});

		it('Structured rejection format specified', () => {
			expect(prompt).toContain('GATE FAILED:');
		});
	});

	// Phase 7 - Anti-Rationalization
	describe('Anti-Rationalization', () => {
		it('ANTI-EXEMPTION RULES present', () => {
			expect(prompt).toContain('ANTI-EXEMPTION RULES');
		});

		it('No simple changes rule', () => {
			expect(prompt).toContain('There are NO simple changes');
		});

		it('PRE-COMMIT RULE present', () => {
			expect(prompt).toContain('PRE-COMMIT RULE');
		});

		it('Commit without QA is violation', () => {
			expect(prompt).toContain('workflow violation');
		});
	});
});

// ============================================
// Phase 3: ARCHITECT CODING BOUNDARIES (replaces ANTI-SELF-CODING RULES)
// ============================================

describe('Architect Prompt Hardening v6.12 - ARCHITECT CODING BOUNDARIES', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	describe('Block Structure', () => {
		it('ARCHITECT CODING BOUNDARIES header exists', () => {
			expect(prompt).toContain('ARCHITECT CODING BOUNDARIES');
		});

		it('Block is positioned before "The gates exist because the author cannot objectively evaluate their own work"', () => {
			// The block should appear before the line about gates existing for objectivity
			// because ARCHITECT CODING BOUNDARIES is Rule 4, and the gates explanation comes later
			const gatesReasonPos = prompt.indexOf('The gates exist because the author cannot objectively evaluate their own work');
			const architectCodingBoundariesPos = prompt.indexOf('ARCHITECT CODING BOUNDARIES');
			expect(gatesReasonPos).toBeGreaterThan(-1);
			expect(architectCodingBoundariesPos).toBeGreaterThan(-1);
			expect(architectCodingBoundariesPos).toBeLessThan(gatesReasonPos);
		});

		it('Block indicates these thoughts are WRONG', () => {
			expect(prompt).toContain('these thoughts are WRONG and must be ignored');
		});
	});

	describe('All 7 Rationalization Patterns', () => {
		it('Pattern 1: "It\'s just a schema change"', () => {
			expect(prompt).toContain("It's just a schema change");
		});

		it('Pattern 2: "I already know what to write"', () => {
			expect(prompt).toContain('I already know what to write');
		});

		it('Pattern 3: "It\'s faster if I just do it"', () => {
			expect(prompt).toContain("It's faster if I just do it");
		});

		it('Pattern 4: "The coder succeeded on the last tasks"', () => {
			expect(prompt).toContain('The coder succeeded on the last tasks');
		});

		it('Pattern 5: "I\'ll just use apply_patch / edit / write directly"', () => {
			expect(prompt).toContain("I'll just use apply_patch / edit / write directly");
			expect(prompt).toContain('these are coder tools, not architect tools');
		});

		it('Pattern 6: "It\'s just a schema change / config flag / one-liner / column / field / import"', () => {
			expect(prompt).toContain("It's just a schema change / config flag / one-liner / column / field / import");
		});

		it('Pattern 7: "I\'ll do the simple parts"', () => {
			expect(prompt).toContain("I'll do the simple parts");
			expect(prompt).toContain('ALL parts go to coder');
		});
	});

	describe('Escalation About Zero Failures', () => {
		it('Zero coder failures = zero justification for self-coding', () => {
			expect(prompt).toContain('Zero {{AGENT_PREFIX}}coder failures on this task = zero justification');
		});

		it('Reaching QA_RETRY_LIMIT triggers escalation', () => {
			expect(prompt).toContain('Reaching {{QA_RETRY_LIMIT}}: escalate to user with full failure history');
		});

		it('Self-coding without QA_RETRY_LIMIT failures is Rule 1 violation', () => {
			expect(prompt).toContain('Self-coding without {{QA_RETRY_LIMIT}} failures is a Rule 1 violation');
		});
	});

	describe('Template Variable Syntax', () => {
		it('Uses {{AGENT_PREFIX}} not hardcoded @', () => {
			// Verify the template variable syntax in ARCHITECT CODING BOUNDARIES section
			const architectBoundariesPos = prompt.indexOf('ARCHITECT CODING BOUNDARIES');
			const rule1ViolationPos = prompt.indexOf('Self-coding without {{QA_RETRY_LIMIT}} failures');
			const architectSection = prompt.slice(architectBoundariesPos, rule1ViolationPos + 100);

			expect(architectSection).toContain('{{AGENT_PREFIX}}coder');
		});

		it('Uses {{QA_RETRY_LIMIT}} for retry limit variable', () => {
			const architectBoundariesPos = prompt.indexOf('ARCHITECT CODING BOUNDARIES');
			const neverStorePos = prompt.indexOf('NEVER store your swarm identity', architectBoundariesPos);
			const architectSection = neverStorePos > 0
				? prompt.slice(architectBoundariesPos, neverStorePos)
				: prompt.slice(architectBoundariesPos, architectBoundariesPos + 2000);

			expect(architectSection).toContain('{{QA_RETRY_LIMIT}}');
		});
	});

	// v6.12 Task 1.2: Rule 1 Tool Boundary Expansion
	describe('Rule 1 Tool Boundary Expansion (v6.12 Task 1.2)', () => {
		it('Rule 1 contains "YOUR TOOLS:" listing architect-only tools', () => {
			expect(prompt).toContain('YOUR TOOLS:');
		});

		it('Rule 1 contains "CODER\'S TOOLS:" listing coder-only tools', () => {
			expect(prompt).toContain("CODER'S TOOLS:");
		});

		it('Rule 1 contains the principle: "If a tool modifies a file, it is a CODER tool"', () => {
			expect(prompt).toContain('If a tool modifies a file, it is a CODER tool');
		});

		it('YOUR TOOLS list includes Task (delegation)', () => {
			// Verify YOUR TOOLS section contains Task for delegation
			const yourToolsPos = prompt.indexOf('YOUR TOOLS:');
			const codersToolsPos = prompt.indexOf("CODER'S TOOLS:");
			const yourToolsSection = prompt.slice(yourToolsPos, codersToolsPos);
			expect(yourToolsSection).toContain('Task');
		});

		it('CODER\'S TOOLS list includes write, edit, and patch', () => {
			// Verify CODER'S TOOLS section contains file-modifying tools
			const codersToolsPos = prompt.indexOf("CODER'S TOOLS:");
			const nextSectionPos = prompt.indexOf('If a tool modifies a file', codersToolsPos);
			const codersToolsSection = prompt.slice(codersToolsPos, nextSectionPos > 0 ? nextSectionPos : codersToolsPos + 300);
			expect(codersToolsSection).toContain('write');
			expect(codersToolsSection).toContain('edit');
		});

		it('ADVERSARIAL: YOUR TOOLS must NOT contain any coder tools (write, edit, patch, etc)', () => {
			// ATTACK VECTOR: If write/edit were accidentally added to YOUR TOOLS,
			// the architect might attempt to use them directly instead of delegating.
			// This test ensures YOUR TOOLS section excludes all file-modifying tools.
			const yourToolsPos = prompt.indexOf('YOUR TOOLS:');
			const codersToolsPos = prompt.indexOf("CODER'S TOOLS:");
			const yourToolsSection = prompt.slice(yourToolsPos, codersToolsPos);

			// These file-modifying tools must NEVER appear in YOUR TOOLS
			const coderTools = ['write', 'edit', 'patch', 'apply_patch', 'create_file', 'insert', 'replace'];
			for (const tool of coderTools) {
				expect(yourToolsSection).not.toContain(tool);
			}
		});

		it('ADVERSARIAL: CODER\'S TOOLS must NOT contain architect tools (Task, lint, etc)', () => {
			// ATTACK VECTOR: If architect tools were accidentally added to CODER'S TOOLS,
			// the boundary would be confused and delegation logic would be ambiguous.
			const codersToolsPos = prompt.indexOf("CODER'S TOOLS:");
			const nextSectionPos = prompt.indexOf('If a tool modifies a file', codersToolsPos);
			const codersToolsSection = prompt.slice(codersToolsPos, nextSectionPos > 0 ? nextSectionPos : codersToolsPos + 300);

			// These read-only/analysis tools must NEVER appear in CODER'S TOOLS
			const architectTools = ['Task', 'lint', 'diff', 'secretscan', 'sast_scan', 'pre_check_batch', 'symbols'];
			for (const tool of architectTools) {
				expect(codersToolsSection).not.toContain(tool);
			}
		});

		it('Tool boundary rule ends with explicit delegation instruction', () => {
			// The rule should end with "Delegate." as the action
			expect(prompt).toContain('If a tool modifies a file, it is a CODER tool. Delegate.');
		});
	});
});

// ============================================
// Rule 4 Self-Coding Pre-Check Adversarial Tests
// NOTE: BEFORE SELF-CODING section was removed in Phase 3 - these tests are now obsolete
// ============================================

describe.skip('Rule 4 Self-Coding Pre-Check Adversarial Tests', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	describe('Attack Vector 1: BEFORE SELF-CODING header must be present', () => {
		it('Contains "BEFORE SELF-CODING" section header (cannot be removed)', () => {
			expect(prompt).toContain('BEFORE SELF-CODING');
		});

		it('Header includes verification instruction', () => {
			expect(prompt).toContain('BEFORE SELF-CODING — verify ALL of the following are true');
		});
	});

	describe('Attack Vector 2: Checklist items must use [ ] format', () => {
		it('First checklist item uses [ ] format for coder delegation count', () => {
			expect(prompt).toContain('[ ] {{AGENT_PREFIX}}coder has been delegated this exact task');
		});

		it('Second checklist item uses [ ] format for failure verification', () => {
			expect(prompt).toContain('[ ] Each delegation returned a failure');
		});

		it('Third checklist item uses [ ] format for retry printing', () => {
			expect(prompt).toContain('[ ] You have printed "Coder attempt [N/{{QA_RETRY_LIMIT}}]"');
		});

		it('Fourth checklist item uses [ ] format for escalation', () => {
			expect(prompt).toContain('[ ] Print "ESCALATION:');
		});

		it('All 4 checklist items are present', () => {
			const selfCodingSection = prompt.substring(
				prompt.indexOf('BEFORE SELF-CODING'),
				prompt.indexOf('If ANY box is unchecked')
			);
			const checklistItems = (selfCodingSection.match(/\[ \]/g) || []).length;
			expect(checklistItems).toBeGreaterThanOrEqual(4);
		});
	});

	describe('Attack Vector 3: ESCALATION keyword must be present', () => {
		it('Contains "ESCALATION:" keyword in print instruction', () => {
			expect(prompt).toContain('ESCALATION:');
		});

		it('Escalation message includes task identifier placeholder', () => {
			expect(prompt).toContain('Self-coding task [X.Y]');
		});

		it('Escalation message includes failure count placeholder', () => {
			expect(prompt).toContain('after {{QA_RETRY_LIMIT}} coder failures');
		});

		it('Full escalation message is properly formatted', () => {
			expect(prompt).toContain('Print "ESCALATION: Self-coding task [X.Y] after {{QA_RETRY_LIMIT}} coder failures" before writing any code');
		});
	});

	describe('Attack Vector 4: DO NOT code line must be present and strong', () => {
		it('Contains "DO NOT code" instruction', () => {
			expect(prompt).toContain('DO NOT code');
		});

		it('Instruction includes delegation fallback', () => {
			expect(prompt).toContain('DO NOT code. Delegate to {{AGENT_PREFIX}}coder');
		});

		it('Instruction is triggered by ANY unchecked box', () => {
			expect(prompt).toContain('If ANY box is unchecked: DO NOT code');
		});

		it('Line is positioned immediately after the checklist', () => {
			const checklistEndPos = prompt.indexOf('[ ] Print "ESCALATION:');
			const doNotCodePos = prompt.indexOf('If ANY box is unchecked: DO NOT code');
			expect(doNotCodePos).toBeGreaterThan(checklistEndPos);
		});
	});

	describe('Combined Adversarial: Tampering Detection', () => {
		it('All 4 attack vectors are protected in the prompt', () => {
			// Verify all critical elements exist together
			expect(prompt).toContain('BEFORE SELF-CODING — verify ALL of the following are true');
			expect(prompt).toContain('[ ] {{AGENT_PREFIX}}coder has been delegated');
			expect(prompt).toContain('[ ] Print "ESCALATION:');
			expect(prompt).toContain('If ANY box is unchecked: DO NOT code');
		});

		it('Self-coding section follows FAILURE COUNTING section', () => {
			const failureCountingPos = prompt.indexOf('FAILURE COUNTING');
			const beforeSelfCodingPos = prompt.indexOf('BEFORE SELF-CODING');
			expect(failureCountingPos).toBeGreaterThan(-1);
			expect(beforeSelfCodingPos).toBeGreaterThan(-1);
			expect(beforeSelfCodingPos).toBeGreaterThan(failureCountingPos);
		});

		it('Cannot bypass by removing ESCALATION keyword', () => {
			// The ESCALATION keyword is required in the checklist
			const beforeSelfCodingSection = prompt.substring(
				prompt.indexOf('BEFORE SELF-CODING'),
				prompt.indexOf('If ANY box is unchecked') + 100
			);
			expect(beforeSelfCodingSection).toContain('ESCALATION:');
		});

		it('Cannot bypass by weakening DO NOT COMMIT', () => {
			// The exact phrase must be present
			expect(prompt).toContain('If ANY box is unchecked: DO NOT COMMIT. Return to step 5b');
		});
	});

	// ============================================
	// ADVERSARIAL: PARTIAL GATE RATIONALIZATIONS
	// ============================================

	describe('Adversarial: PARTIAL GATE RATIONALIZATIONS Section Integrity', () => {
		// Attack Vector 1: Removal or renaming of the section header
		it('Cannot bypass by removing PARTIAL GATE RATIONALIZATIONS section header', () => {
			// The exact section header must be present
			expect(prompt).toContain('PARTIAL GATE RATIONALIZATIONS — automated gates ≠ agent review. Running SOME gates is NOT compliance:');
		});

		it('Cannot bypass by renaming PARTIAL GATE RATIONALIZATIONS', () => {
			// Must contain the full phrase, not a weakened version
			expect(prompt).toContain('PARTIAL GATE RATIONALIZATIONS');
			expect(prompt).toContain('Running SOME gates is NOT compliance');
		});

		// Attack Vector 2: Weakening the "#1 predictor" phrase
		it('Cannot bypass by weakening #1 predictor phrase', () => {
			// The exact phrase about complacency must be present
			expect(prompt).toContain('#1 predictor of shipped bugs');
		});

		it('Cannot weaken complacency warning in Phase 6', () => {
			// Phase 6 warning must be present with exact wording
			expect(prompt).toContain('complacency after successful phases is the #1 predictor of shipped bugs');
			expect(prompt).toContain('Phase 6 needs MORE review, not less');
		});

		// Attack Vector 3: Changing "ALL steps or NONE" to "most steps"
		it('Cannot bypass by changing ALL steps or NONE', () => {
			// The exact phrase must be present
			expect(prompt).toContain('The QA gate is ALL steps or NONE');
		});

		it('Cannot weaken by removing NONE alternative', () => {
			// Must be "ALL or NONE", not just "ALL steps"
			expect(prompt).toContain('ALL steps or NONE');
			expect(prompt).not.toContain('ALL steps or most steps');
		});

		it('Cannot bypass by adding exceptions to gate requirements', () => {
			// The "no exceptions" statement must be present
			expect(prompt).toContain('There are NO exceptions to the QA gate sequence');
		});

		// Attack Vector 4: Removing pre_check_batch disclaimer
		it('Cannot bypass by removing pre_check_batch does NOT replace disclaimer', () => {
			// The disclaimer must be present
			expect(prompt).toContain('pre_check_batch does NOT replace {{AGENT_PREFIX}}reviewer or {{AGENT_PREFIX}}test_engineer');
		});

		it('Cannot bypass by removing syntax_check disclaimer', () => {
			// The disclaimer about syntax_check must be present
			expect(prompt).toContain('syntax_check catches syntax. Reviewer catches logic. Test_engineer catches behavior.');
		});

		it('Cannot bypass by removing agent gate necessity explanation', () => {
			// The explanation for why agent gates exist must be present
			expect(prompt).toContain('agent reviews (reviewer, test_engineer) exist because automated tools miss logic errors, security flaws, and edge cases');
		});

		// Attack Vector 5: Removing PARTIAL GATE VIOLATION warning
		it('Cannot bypass by removing PARTIAL GATE VIOLATION warning', () => {
			// The warning must be present
			expect(prompt).toContain('PARTIAL GATE VIOLATION');
		});

		it('Cannot bypass by weakening severity statement', () => {
			// Must state it's same severity as skipping all gates
			expect(prompt).toContain('It is the same severity as skipping all gates');
		});

		// Attack Vector 6: Speed-based rationalizations
		it('Cannot bypass by removing fast gates rationalization', () => {
			// The rationalization about speed must be present
			expect(prompt).toContain('speed of a gate does not determine whether it is required');
		});

		// Attack Vector 7: Past success rationalization
		it('Cannot bypass by removing past success rationalization', () => {
			// The rationalization about past success must be present
			expect(prompt).toContain('past success does not predict future correctness');
		});
	});

	// ============================================
	// v6.12 Task 1.9 - GATE FAILURE RESPONSE RULES
	// ============================================

	describe('v6.12 Task 1.9 - GATE FAILURE RESPONSE RULES', () => {
		it('GATE FAILURE RESPONSE RULES header present', () => {
			expect(prompt).toContain('GATE FAILURE RESPONSE RULES');
		});

		it('MUST return to coder, MUST NOT fix yourself', () => {
			expect(prompt).toContain('You MUST return to {{AGENT_PREFIX}}coder. You MUST NOT fix the code yourself.');
		});

		it('self-editing rationalization addressed', () => {
			expect(prompt).toContain('Editing the file yourself to fix the syntax error');
		});

		it('tool installation workaround addressed', () => {
			expect(prompt).toContain('"Installing" or "configuring" tools to work around the failure');
		});

		it('lint fix mode is the ONLY exception', () => {
			expect(prompt).toContain('The ONLY exception: lint tool in fix mode');
		});
	});

	// ============================================
	// v6.12 Task 1.10 - Rule 3 BATCHING DETECTION
	// ============================================

	describe('v6.12 Task 1.10 - BATCHING DETECTION', () => {
		it('BATCHING DETECTION header present', () => {
			expect(prompt).toContain('BATCHING DETECTION');
		});

		it('The word "and" connecting two actions pattern present', () => {
			expect(prompt).toContain('The word "and" connecting two actions');
		});

		it('Multiple FILE paths pattern present', () => {
			expect(prompt).toContain('Multiple FILE paths');
		});

		it('SPLIT RULE present', () => {
			expect(prompt).toContain('SPLIT RULE');
		});

		it('Two small delegations with two QA gates present', () => {
			expect(prompt).toContain('Two small delegations with two QA gates');
		});

		it('Batching detection examples include "and" in TASK line', () => {
			expect(prompt).toContain('split it');
		});

		it('WHY section explains QA gate batching problem', () => {
			expect(prompt).toContain('If you batch 3 tasks into 1 coder call');
		});

		// ========================================
		// ADVERSARIAL ATTACK VECTORS - Task 1.10
		// ========================================
		describe('Adversarial Attack Vectors', () => {
			// Attack Vector 1: Remove BATCHING DETECTION header
			it('AV1: Cannot bypass by removing BATCHING DETECTION header', () => {
				// This test ensures the BATCHING DETECTION section header is present
				// If removed, architects might not know when they're batching
				expect(prompt).toContain('BATCHING DETECTION');
				// Also verify the context is correct - it should be part of Rule 3
				const batchingPos = prompt.indexOf('BATCHING DETECTION');
				const rule3Pos = prompt.indexOf('3. ONE task per');
				expect(rule3Pos).toBeGreaterThan(-1);
				// BATCHING DETECTION should appear near Rule 3
				expect(Math.abs(batchingPos - rule3Pos)).toBeLessThan(200);
			});

			// Attack Vector 2: Incomplete heuristics list (missing "Multiple FILE paths")
			it('AV2: Cannot bypass by removing "Multiple FILE paths" heuristic', () => {
				// All four heuristics must be present for complete batching detection
				expect(prompt).toContain('The word "and" connecting two actions');
				expect(prompt).toContain('Multiple FILE paths');
				expect(prompt).toContain('Multiple TASK objectives');
				expect(prompt).toContain('Phrases like "also"');
				// Verify "Multiple FILE paths" is specifically in the heuristics list
				const batchingStart = prompt.indexOf('BATCHING DETECTION');
				const splitRulePos = prompt.indexOf('SPLIT RULE');
				const batchingSection = prompt.slice(batchingStart, splitRulePos);
				expect(batchingSection).toContain('Multiple FILE paths');
			});

			// Attack Vector 3: Remove SPLIT RULE
			it('AV3: Cannot bypass by removing SPLIT RULE', () => {
				// SPLIT RULE tells architects how to fix batching
				expect(prompt).toContain('SPLIT RULE');
				// The split rule must contain actionable guidance
				expect(prompt).toContain("If your delegation draft has \"and\" in the TASK line, split it");
				// Must explain why splitting is better
				expect(prompt).toContain('Two small delegations with two QA gates');
			});

			// Attack Vector 4: Remove QA gate rationale in WHY section
			it('AV4: Cannot bypass by removing WHY section QA gate rationale', () => {
				// WHY section explains consequences of batching
				expect(prompt).toContain('WHY:');
				// Must explain QA gate runs once on combined diff
				expect(prompt).toContain('QA gate runs once on the combined diff');
				// Must explain reviewer cannot distinguish changes
				expect(prompt).toContain('reviewer cannot distinguish');
				// Must explain test_engineer cannot write targeted tests
				expect(prompt).toContain('test_engineer cannot write targeted tests');
				// Must explain failure blocks entire batch
				expect(prompt).toContain('A failure in one part blocks the entire batch');
			});

	// Additional: Verify WHY section is between BATCHING DETECTION and SPLIT RULE
		it('AV5: WHY section positioned correctly between detection and split rule', () => {
			const batchingPos = prompt.indexOf('BATCHING DETECTION');
			const whyPos = prompt.indexOf('WHY:');
			const splitRulePos = prompt.indexOf('SPLIT RULE');
			// Order should be: BATCHING DETECTION -> WHY -> SPLIT RULE
			expect(whyPos).toBeGreaterThan(batchingPos);
			expect(splitRulePos).toBeGreaterThan(whyPos);
		});
	});

	// ============================================
	// v6.12 Task 4.1 - Anti-Process-Violation Hardening
	// ============================================

	describe('v6.12 Anti-Process-Violation Hardening', () => {
		const prompt = createArchitectAgent('test-model').config.prompt!;

		// Self-coding (Task 1.1)
		it('ARCHITECT CODING BOUNDARIES block present', () => {
			expect(prompt).toContain('ARCHITECT CODING BOUNDARIES');
		});

		it('addresses schema/config rationalization', () => {
			expect(prompt).toContain("It's just a schema change");
			expect(prompt).toContain('config flag');
		});

		it('addresses "I already know what to write" rationalization', () => {
			expect(prompt).toContain('knowing what to write is planning');
		});

		it('names apply_patch/edit/write as coder tools', () => {
			expect(prompt).toContain('apply_patch / edit / write');
			expect(prompt).toContain('coder tools, not architect tools');
		});

		// Rule 1 tool boundary (Task 1.2)
		it('Rule 1 defines tool boundaries', () => {
			expect(prompt).toContain('YOUR TOOLS:');
			expect(prompt).toContain("CODER'S TOOLS:");
			expect(prompt).toContain('If a tool modifies a file, it is a CODER tool');
		});

		// Rule 4 self-coding pre-check (Task 1.3)
		it('Rule 4 has self-coding pre-check', () => {
			expect(prompt).toContain('ARCHITECT CODING BOUNDARIES');
			expect(prompt).toContain('These thoughts are WRONG and must be ignored:');
		});

		// Bullet count verification (Phase 3 dedup)
		it('rationalization bullet count decreased after dedup', () => {
			// Count ✗ bullets in ARCHITECT CODING BOUNDARIES section (6 bullets)
			const architectSection = prompt.split('ARCHITECT CODING BOUNDARIES')[1].split('NEVER store')[0];
			const bulletMatches = architectSection.match(/✗ "/g);
			expect(bulletMatches).toHaveLength(6);
		});

		// Self-coding severity (Task 1.1)
		it('self-coding equated to gate-skip severity', () => {
			expect(prompt).toContain('Self-coding without {{QA_RETRY_LIMIT}} failures is a Rule 1 violation');
		});

		it('zero failures = zero justification', () => {
			expect(prompt).toContain('Zero {{AGENT_PREFIX}}coder failures on this task = zero justification');
		});

		// Gate failure response (Task 1.9)
		it('GATE FAILURE RESPONSE RULES present', () => {
			expect(prompt).toContain('GATE FAILURE RESPONSE RULES');
			expect(prompt).toContain('You MUST return to {{AGENT_PREFIX}}coder. You MUST NOT fix the code yourself.');
		});

		it('addresses self-fix rationalizations', () => {
			expect(prompt).toContain('Editing the file yourself to fix the syntax error');
			expect(prompt).toContain('"Installing" or "configuring" tools to work around the failure');
		});

		it('lint fix mode is the only exception', () => {
			expect(prompt).toContain('The ONLY exception: lint tool in fix mode');
		});

		// Batching (Task 1.10)
		it('BATCHING DETECTION present in Rule 3', () => {
			expect(prompt).toContain('BATCHING DETECTION');
			expect(prompt).toContain('SPLIT RULE');
		});

		it('batching examples are concrete', () => {
			expect(prompt).toContain('The word "and" connecting two actions');
			expect(prompt).toContain('Multiple FILE paths');
		});

		// Partial gate (Task 1.4)
		it('PARTIAL GATE RATIONALIZATIONS present', () => {
			expect(prompt).toContain('PARTIAL GATE RATIONALIZATIONS');
			expect(prompt).toContain('pre_check_batch does NOT replace');
			expect(prompt).toContain('PARTIAL GATE VIOLATION');
		});

		it('addresses complacency after successful phases', () => {
			expect(prompt).toContain('complacency after successful phases');
			expect(prompt).toContain('Phase 6 needs MORE review, not less');
		});

		it('addresses selective gate optimization', () => {
			expect(prompt).toContain("I'll just run the fast gates");
			expect(prompt).toContain(
				'speed of a gate does not determine whether it is required',
			);
		});

		// Completion gate (Task 1.5)
		it('completion checklist is hard-stop not suggestion', () => {
			expect(prompt).toContain('⛔ TASK COMPLETION GATE');
			expect(prompt).toContain(
				'You MUST NOT mark a task complete without printing this checklist',
			);
			expect(prompt).toContain('that is fabrication');
		});

		it('checklist requires actual output not memory', () => {
			expect(prompt).toContain(
				'Each value must come from actual tool/agent output in this session',
			);
		});

		// Scope boundary (Task 1.6)
		it('pre_check_batch scope boundary present', () => {
			expect(prompt).toContain('pre_check_batch SCOPE BOUNDARY');
			expect(prompt).toContain('does NOT mean "code is reviewed."');
			expect(prompt).toContain('Treating pre_check_batch as a substitute for reviewer is a PROCESS VIOLATION');
		});

		// Stage A/B (Task 1.7)
		it('QA gate has two-stage structure', () => {
			expect(prompt).toContain('STAGE A: AUTOMATED TOOL GATES');
			expect(prompt).toContain('STAGE B: AGENT REVIEW GATES');
			const stageA = prompt.indexOf('STAGE A');
			const stageB = prompt.indexOf('STAGE B');
			expect(stageA).toBeLessThan(stageB);
		});

		it('Stage A explicitly states what it does NOT cover', () => {
			expect(prompt).toContain(
				'Stage A passing does NOT mean: code is correct, secure, tested, or reviewed',
			);
		});

		// Catastrophic check (Task 1.8)
		it('catastrophic violation check at phase boundary', () => {
			expect(prompt).toContain('CATASTROPHIC VIOLATION CHECK');
			expect(prompt).toContain(
				'Have I delegated to {{AGENT_PREFIX}}reviewer at least once this phase?',
			);
		});

		// v6.13.3 Retrospective enforcement (Task 2.6)
		describe('v6.13.3 retrospective and briefing sections', () => {
			it('contains RETROSPECTIVE GATE section', () => {
				expect(prompt).toContain('RETROSPECTIVE GATE');
			});

			it('contains PRE-PHASE BRIEFING section', () => {
				expect(prompt).toContain('PRE-PHASE BRIEFING');
			});

			it('RETROSPECTIVE GATE appears before phase_complete', () => {
				const retroPos = prompt.indexOf('RETROSPECTIVE GATE');
				const phaseCompletePos = prompt.indexOf('phase_complete');
				expect(retroPos).toBeLessThan(phaseCompletePos);
			});

			it('PRE-PHASE BRIEFING appears before MODE: PLAN', () => {
				const briefingPos = prompt.indexOf('PRE-PHASE BRIEFING');
				const planModePos = prompt.indexOf('MODE: PLAN');
				expect(briefingPos).toBeLessThan(planModePos);
			});

			it('mentions retro task_id convention', () => {
				expect(prompt).toMatch(/retro-\{|\bretro-\d+\b|retro-\{phase/);
			});

			it('PRE-PHASE BRIEFING has Phase 1 and Phase 2+ paths', () => {
				expect(prompt).toContain('Phase 2+');
				expect(prompt).toContain('Phase 1');
			});

			it('contains PHASE-WRAP mode or phase count guidance', () => {
				const hasPhaseWrap = prompt.includes('PHASE-WRAP');
				const hasPhaseCount = prompt.includes('PHASE COUNT');
				const hasMinimum = prompt.includes('minimum');
				expect(hasPhaseWrap || hasPhaseCount || hasMinimum).toBe(true);
			});
		});
	});
	});
});

// ============================================
// MODE: DISCOVER — Governance Detection Adversarial
// ============================================

describe('MODE: DISCOVER — governance detection adversarial', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	// Extract the MODE: DISCOVER block for targeted testing
	const discoverStart = prompt.indexOf('### MODE: DISCOVER');
	const discoverEnd = prompt.indexOf('### MODE: CONSULT', discoverStart);
	const discoverSection = discoverStart >= 0 && discoverEnd > discoverStart
		? prompt.slice(discoverStart, discoverEnd)
		: '';

	describe('Attack Vector 1: No code execution of MUST rules', () => {
		it('Governance step MUST NOT instruct to execute MUST rules as code', () => {
			// The governance step should only write a summary, not execute code
			// Check for phrases like "execute MUST rules", "apply MUST rules", etc.
			// But NOT "extract MUST" which is about reading/extracting rules, not executing them
			expect(discoverSection).not.toMatch(/execute\s+(the\s+)?MUST|apply\s+(the\s+)?MUST|implement\s+(the\s+)?MUST|enforce\s+(the\s+)?MUST\s+as\s+code/i);
		});

		it('Governance step explicitly states it writes a summary only', () => {
			// Should contain language indicating summary extraction, not enforcement
			expect(discoverSection).toMatch(/Write the extracted rules as a summary|extract.*summary|write.*summary/i);
		});

		it('ADVERSARIAL: Step does NOT contain phrases suggesting code enforcement', () => {
			// These phrases would indicate step tries to execute/enforce rules
			const enforcementPhrases = [
				/enforce\s+(the\s+)?MUST\s+rules/i,
				/apply\s+(the\s+)?MUST\s+rules\s+to\s+code/i,
				/validate\s+code\s+against\s+MUST/i,
				/check\s+compliance\s+against\s+MUST/i,
				/run\s+MUST\s+rules\s+as\s+code/i,
				/execute\s+(the\s+)?MUST\s+constraints/i
			];
			for (const phrase of enforcementPhrases) {
				expect(discoverSection).not.toMatch(phrase);
			}
		});

		it('ADVERSARIAL: Step clarifies it only writes summary, not executes', () => {
			// The step should clearly distinguish between reading and writing summary vs executing
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			// Should use terms like "extract", "write", "summary"
			expect(governanceContext).toMatch(/Write the extracted rules as a summary|extract|write.*summary/i);
		});
	});

	describe('Attack Vector 2: Prompt injection resistance', () => {
		it('Governance step uses proper tool escaping (no unescaped ${...} in governance context)', () => {
			// Check that governance context doesn't contain unescaped template expressions
			// ${...} expressions could allow prompt injection
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			// Check for ${...} pattern (but not in comments or strings)
			const unescapedVars = governanceContext.match(/\$\{[^}]+\}/g);
			expect(unescapedVars).toBeNull();
		});

		it('ADVERSARIAL: No dynamic interpolation of governance file content', () => {
			// The step should not try to interpolate governance file content directly
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			// Should use "read" and "extract", not interpolation
			expect(governanceContext).not.toMatch(/\$\{.*governance.*\}/i);
			expect(governanceContext).not.toMatch(/\$\{.*instructions.*\}/i);
		});
	});

	describe('Attack Vector 3: Does NOT overwrite entire context.md', () => {
		it('Governance step explicitly states append behavior for existing section', () => {
			// Should clarify it appends to ## Project Governance section, not overwrite entire file
			expect(discoverSection).toMatch(/append.*## Project Governance|append if the section already exists/i);
		});

		it('Governance step specifies section header ## Project Governance', () => {
			// Should explicitly mention the section it targets
			expect(discoverSection).toContain('## Project Governance');
		});

		it('ADVERSARIAL: Step does NOT contain phrases suggesting full file overwrite', () => {
			// These phrases would indicate step overwrites entire context.md
			const overwritePhrases = [
				/overwrite.*context\.md/i,
				/replace.*context\.md/i,
				/write.*entire.*context\.md/i,
				/update.*context\.md.*completely/i,
				/replace.*file/i
			];
			for (const phrase of overwritePhrases) {
				expect(discoverSection).not.toMatch(phrase);
			}
		});

		it('ADVERSARIAL: Step uses "append if" language for existing section', () => {
			// Should explicitly handle "already exists" case with append
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			expect(governanceContext).toMatch(/append.*exists|append if|create it if not/i);
		});
	});

	describe('Attack Vector 4: No external URL fetching or network requests', () => {
		it('Governance step does NOT claim to fetch external URLs', () => {
			// The step should only read local files
			expect(discoverSection).not.toMatch(/fetch.*url|fetch.*https?:|download|external.*url/i);
		});

		it('Governance step uses only local file operations (glob, read)', () => {
			// Should only reference local tools like glob and read
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			expect(governanceContext).toMatch(/glob|read/i);
		});

		it('ADVERSARIAL: Step does NOT contain network-related verbs', () => {
			// These verbs would indicate network operations
			const networkVerbs = [
				/fetch/i,
				/download/i,
				/request/i,
				/curl/i,
				/wget/i,
				/http/i,
				/https/i,
				/api.*call/i,
				/external.*request/i
			];
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			for (const verb of networkVerbs) {
				expect(governanceContext).not.toMatch(new RegExp(verb));
			}
		});

		it('ADVERSARIAL: Step explicitly mentions reading local files only', () => {
			// Should use language like "read it" referring to local file
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			expect(governanceContext).toMatch(/read it|read.*file/i);
		});
	});

	describe('Attack Vector 5: Silent skip ONLY when no file found (not when found)', () => {
		it('Governance step handles file found case (must not skip silently)', () => {
			// When a file IS found, it should process it (not skip)
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			// Should contain actions for when file is found
			expect(governanceContext).toMatch(/found:|read it|extract/i);
		});

		it('Governance step explicitly states skip when no file found', () => {
			// Silent skip should only be for "not found" case
			expect(discoverSection).toMatch(/no governance file|not found.*skip/i);
		});

		it('ADVERSARIAL: Step does NOT say "skip silently" for found case', () => {
			// Silent skip should be conditioned on "no file found", not "if found"
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			// The phrase "skip" should be associated with "no file" or "not found"
			const skipNotSentences = governanceContext.split('.').filter(s =>
				s.toLowerCase().includes('skip') &&
				!s.toLowerCase().includes('no') &&
				!s.toLowerCase().includes('not found') &&
				!s.toLowerCase().includes('if no')
			);
			expect(skipNotSentences.length).toBe(0);
		});

		it('ADVERSARIAL: Found case has explicit actions (read, extract, write)', () => {
			// When file is found, specific actions must be described
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(governanceIdx, governanceIdx + 500);
			// Should contain action verbs for the found case
			expect(governanceContext).toMatch(/read|extract|write/i);
		});

		it('ADVERSARIAL: Skip condition is explicitly tied to "no file found"', () => {
			// The skip instruction should clearly link to "no governance file"
			expect(discoverSection).toMatch(/no governance file.*skip|if no.*skip|not found.*skip/i);
		});
	});
});

// ============================================
// MODE: SPECIFY (v6.15 Task 7.1)
// ============================================

describe('MODE: SPECIFY (v6.15 Task 7.1)', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	const specifyStart = prompt.indexOf('### MODE: SPECIFY');
	const specifyEnd = prompt.indexOf('### MODE: CLARIFY-SPEC', specifyStart);
	const specifySection = prompt.slice(specifyStart, specifyEnd);

	it('MODE: SPECIFY section exists in prompt', () => {
		expect(specifyStart).toBeGreaterThan(-1);
		expect(specifyEnd).toBeGreaterThan(specifyStart);
	});

	it('SPECIFY activates on /swarm specify invocation', () => {
		expect(specifySection).toContain('/swarm specify');
	});

	it('SPECIFY activates when no spec.md and no plan.md exist', () => {
		expect(specifySection).toContain('no `.swarm/spec.md` exists and no `.swarm/plan.md` exists');
	});

	it('SPECIFY checks if spec.md already exists before generating', () => {
		expect(specifySection).toContain('Check if `.swarm/spec.md` already exists');
		expect(specifySection).toContain('A spec already exists');
	});

	it('SPECIFY delegates to explorer for codebase context', () => {
		expect(specifySection).toContain('Delegate to `{{AGENT_PREFIX}}explorer` to scan the codebase');
	});

	it('SPECIFY delegates to sme for domain research', () => {
		expect(specifySection).toContain('Delegate to `{{AGENT_PREFIX}}sme` for domain research');
	});

	it('SPECIFY generates spec.md with FR-### requirements', () => {
		expect(specifySection).toContain('Functional requirements numbered FR-001, FR-002');
	});

	it('SPECIFY generates spec.md with SC-### success criteria', () => {
		expect(specifySection).toContain('Success criteria numbered SC-001, SC-002');
	});

	it('SPECIFY uses WHAT/WHY language, not HOW', () => {
		expect(specifySection).toContain('Feature description: WHAT users need and WHY — never HOW to implement');
	});

	it('SPECIFY uses [NEEDS CLARIFICATION] markers', () => {
		expect(specifySection).toContain('[NEEDS CLARIFICATION]');
	});

	it('SPEC CONTENT RULES prohibit technology stack', () => {
		expect(specifySection).toContain('Technology stack, framework choices, library names');
		expect(specifySection).toContain('MUST NOT contain');
	});

	it('SPEC CONTENT RULES prohibit file paths and implementation details', () => {
		expect(specifySection).toContain('File paths, API endpoint designs, database schema, code structure');
		expect(specifySection).toContain('Implementation details');
	});

	it('EXTERNAL PLAN IMPORT PATH exists and derives FR-### from tasks', () => {
		expect(specifySection).toContain('EXTERNAL PLAN IMPORT PATH');
		expect(specifySection).toContain('Derive FR-### functional requirements from task descriptions');
	});

	it('EXTERNAL PLAN IMPORT PATH validates swarm task format', () => {
		expect(specifySection).toContain('Validate the provided plan against swarm task format requirements');
	});

	it('EXTERNAL PLAN IMPORT PATH surfaces suggestions, does not silently rewrite', () => {
		expect(specifySection).toContain('Surface ALL changes as suggestions — do not silently rewrite');
		expect(specifySection).toContain('The user\'s plan is the starting point, not a draft to replace');
	});

	it('PRIORITY RULES: RESUME always wins over SPECIFY', () => {
		expect(prompt).toContain('RESUME always wins — a user with an in-progress plan never accidentally triggers SPECIFY');
	});

	it('PRIORITY RULES: SPECIFY fires before DISCOVER when no spec exists', () => {
		expect(prompt).toContain('SPECIFY fires before DISCOVER when no spec exists');
	});
});

// ============================================
// MODE: CLARIFY-SPEC (v6.15 Task 7.2)
// ============================================

describe('MODE: CLARIFY-SPEC (v6.15 Task 7.2)', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	const clarifySpecStart = prompt.indexOf('### MODE: CLARIFY-SPEC');
	const clarifySpecEnd = prompt.indexOf('### MODE: RESUME', clarifySpecStart);
	const clarifySpecSection = clarifySpecStart >= 0 && clarifySpecEnd > clarifySpecStart
		? prompt.slice(clarifySpecStart, clarifySpecEnd)
		: '';

	it('MODE: CLARIFY-SPEC section exists in prompt', () => {
		expect(clarifySpecStart).toBeGreaterThan(-1);
		expect(clarifySpecEnd).toBeGreaterThan(clarifySpecStart);
	});

	it('CLARIFY-SPEC activates on /swarm clarify invocation', () => {
		expect(clarifySpecSection).toContain('/swarm clarify');
	});

	it('CLARIFY-SPEC activates when spec.md has [NEEDS CLARIFICATION] markers', () => {
		expect(clarifySpecSection).toContain('[NEEDS CLARIFICATION]');
	});

	it('CLARIFY-SPEC activates on transition from SPECIFY with open markers', () => {
		expect(clarifySpecSection).toContain('transitions from MODE: SPECIFY');
		expect(clarifySpecSection).toContain('open markers');
	});

	it('CLARIFY-SPEC NEVER creates a spec (no-spec case: tells user "No spec found" and stops)', () => {
		expect(clarifySpecSection).toContain('CLARIFY-SPEC must NEVER create a spec');
		expect(clarifySpecSection).toContain('No spec found');
		expect(clarifySpecSection).toContain('Use `/swarm specify` to generate one first');
	});

	it('CLARIFY-SPEC reads spec.md as first step', () => {
		expect(clarifySpecSection).toContain('Read `.swarm/spec.md`');
	});

	it('CLARIFY-SPEC scans for vague adjectives beyond explicit markers', () => {
		expect(clarifySpecSection).toContain('Vague adjectives');
		expect(clarifySpecSection).toContain('fast', 'secure', 'user-friendly');
		expect(clarifySpecSection).toContain('without measurable targets');
	});

	it('CLARIFY-SPEC delegates to sme for domain research on ambiguous areas', () => {
		expect(clarifySpecSection).toContain('Delegate to `{{AGENT_PREFIX}}sme`');
		expect(clarifySpecSection).toContain('domain research on ambiguous areas');
	});

	it('CLARIFY-SPEC presents questions ONE AT A TIME (one question at a time language)', () => {
		expect(clarifySpecSection).toContain('Present questions to the user ONE AT A TIME');
		expect(clarifySpecSection).toContain('One question at a time');
	});

	it('CLARIFY-SPEC max 8 questions per session', () => {
		expect(clarifySpecSection).toContain('max 8 per session');
		expect(clarifySpecSection).toContain('Max 8 questions per session');
	});

	it('CLARIFY-SPEC offers multiple-choice options for each question', () => {
		expect(clarifySpecSection).toContain('Offer 2–4 multiple-choice options');
	});

	it('After each answer: immediately updates spec.md with the resolution', () => {
		expect(clarifySpecSection).toContain('Immediately update `.swarm/spec.md` with the resolution');
	});

	it('CLARIFY-SPEC RULES: never ask multiple questions in the same message', () => {
		expect(clarifySpecSection).toContain('One question at a time — never ask multiple questions in the same message');
	});

	it('CLARIFY-SPEC RULES: do not create or overwrite the spec file — only refine', () => {
		expect(clarifySpecSection).toContain('Do not create or overwrite the spec file — only refine what exists');
	});
});

// ============================================
// SOFT SPEC GATE in MODE: PLAN (v6.15 Task 7.2)
// ============================================

describe('SOFT SPEC GATE in MODE: PLAN (v6.15 Task 7.2)', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	const planStart = prompt.indexOf('### MODE: PLAN');
	const planEnd = prompt.indexOf('### MODE: CRITIC-GATE', planStart);
	const planSection = planStart >= 0 && planEnd > planStart
		? prompt.slice(planStart, planEnd)
		: '';

	it('SPEC GATE exists in MODE: PLAN section', () => {
		expect(planSection).toContain('SPEC GATE');
	});

	it('Gate is soft (SOFT GATE or "soft" language present)', () => {
		expect(planSection).toMatch(/SOFT gate/i);
	});

	it('When no spec.md: warns user with spec creation offer', () => {
		expect(planSection).toContain('If `.swarm/spec.md` does NOT exist:');
		expect(planSection).toContain('Warn:');
		expect(planSection).toContain('Would you like to create one first?');
	});

	it('Warning message references spec helping with requirements coverage', () => {
		expect(planSection).toContain('spec helps ensure the plan covers all requirements');
	});

	it('Offers "Create a spec first" option → MODE: SPECIFY transition', () => {
		expect(planSection).toContain('Create a spec first');
		expect(planSection).toContain('transition to MODE: SPECIFY');
	});

	it('Offers "Skip and plan directly" option → proceeds unchanged', () => {
		expect(planSection).toContain('Skip and plan directly');
		expect(planSection).toContain('continue with the steps below unchanged');
	});

	it('When spec.md exists: cross-references FR-### requirements', () => {
		expect(planSection).toContain('Cross-reference requirements (FR-###)');
	});

	it('When spec.md exists: ensures every FR-### maps to at least one task', () => {
		expect(planSection).toContain('Ensure every FR-### maps to at least one task');
	});

	it('Gold-plating risk: tasks with no FR-### are flagged', () => {
		expect(planSection).toContain('If a task has no corresponding FR-###, flag it as a potential gold-plating risk');
	});

	it('Skip path: "proceed to the steps below exactly as before" / no modification to planning behavior', () => {
		expect(planSection).toContain('proceed to the steps below exactly as before');
		expect(planSection).toContain('do NOT modify any planning behavior');
		expect(planSection).toContain('This is a SOFT gate');
	});
});

// ============================================
// MODE: PHASE-WRAP — drift-check delegation (v6.15 Task 7.5)
// ============================================

describe('MODE: PHASE-WRAP — drift-check delegation (v6.15 Task 7.5)', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	const phaseWrapStart = prompt.indexOf('### MODE: PHASE-WRAP');
	const phaseWrapEnd = prompt.indexOf('### Blockers', phaseWrapStart);
	const phaseWrapSection = prompt.slice(phaseWrapStart, phaseWrapEnd);

	it('PHASE-WRAP section exists in prompt', () => {
		expect(prompt.indexOf('### MODE: PHASE-WRAP')).toBeGreaterThan(-1);
	});

	it('Step 5.5 exists in PHASE-WRAP', () => {
		expect(phaseWrapSection).toContain('5.5.');
	});

	it('Step 5.5 references spec.md existence check', () => {
		expect(phaseWrapSection).toContain('.swarm/spec.md');
	});

	it('Step 5.5 delegates critic with DRIFT-CHECK context', () => {
		expect(phaseWrapSection).toContain('DRIFT-CHECK');
	});

	it('Step 5.5 delegation includes phase number', () => {
		expect(phaseWrapSection).toContain('phase number');
	});

	it('Step 5.5 delegation includes completed task IDs and descriptions', () => {
		expect(phaseWrapSection).toContain('completed task IDs');
	});

	it('Step 5.5 delegation includes evidence path', () => {
		expect(phaseWrapSection).toContain('.swarm/evidence/');
	});

	it('Step 5.5 surfaces SIGNIFICANT DRIFT as warning to user', () => {
		expect(phaseWrapSection).toContain('SIGNIFICANT DRIFT');
	});

	it('Step 5.5 is conditional on spec.md existence (skip if absent)', () => {
		expect(phaseWrapSection).toContain('skip silently');
	});

	it('PHASE-WRAP steps appear in correct numeric order (1, 2, 3, 4, 4.5, 5, 5.5, 6, 7)', () => {
		expect(phaseWrapSection).toContain('1.');
		expect(phaseWrapSection).toContain('2.');
		expect(phaseWrapSection).toContain('3.');
		expect(phaseWrapSection).toContain('4.');
		expect(phaseWrapSection).toContain('4.5.');
		expect(phaseWrapSection).toContain('5.');
		expect(phaseWrapSection).toContain('5.5.');
		expect(phaseWrapSection).toContain('6.');
		expect(phaseWrapSection).toContain('7.');

		// Verify order
		const pos1 = phaseWrapSection.indexOf('1.');
		const pos2 = phaseWrapSection.indexOf('2.');
		const pos3 = phaseWrapSection.indexOf('3.');
		const pos4 = phaseWrapSection.indexOf('4.');
		const pos4_5 = phaseWrapSection.indexOf('4.5.');
		const pos5 = phaseWrapSection.indexOf('5.');
		const pos5_5 = phaseWrapSection.indexOf('5.5.');
		const pos6 = phaseWrapSection.indexOf('6.');
		const pos7 = phaseWrapSection.indexOf('7.');

		expect(pos1).toBeGreaterThan(-1);
		expect(pos2).toBeGreaterThan(pos1);
		expect(pos3).toBeGreaterThan(pos2);
		expect(pos4).toBeGreaterThan(pos3);
		expect(pos4_5).toBeGreaterThan(pos4);
		expect(pos5).toBeGreaterThan(pos4_5);
		expect(pos5_5).toBeGreaterThan(pos5);
		expect(pos6).toBeGreaterThan(pos5_5);
		expect(pos7).toBeGreaterThan(pos6);
	});

	it('CATASTROPHIC VIOLATION CHECK present in PHASE-WRAP', () => {
		expect(phaseWrapSection).toContain('CATASTROPHIC VIOLATION CHECK');
	});

	it('DRIFT-CHECK delegation uses agent prefix pattern', () => {
		expect(phaseWrapSection).toContain('{{AGENT_PREFIX}}critic');
	});
});
