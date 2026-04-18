/**
 * PROMPT REGRESSION TESTS
 *
 * These tests verify that critical strings, keywords, and structural
 * elements remain present in the architect agent's system prompt.
 * They are NOT behavioral tests — they do not exercise runtime logic.
 *
 * Purpose: catch accidental prompt regressions when prompt text is
 * edited. If a .toContain() assertion fails, a keyword or instruction
 * was removed. Evaluate whether the removal was intentional before
 * updating the test.
 */
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
			expect(prompt).toMatch(
				/secretscan.*reviewer|secretscan.*proceed to reviewer/,
			);
		});

		it('6. Rule 7 mentions gates_passed before reviewer', () => {
			// In v6.10, secretscan is inside pre_check_batch; gates_passed triggers progression
			expect(prompt).toContain('gates_passed === true');
			expect(prompt).toContain('proceed to {{AGENT_PREFIX}}reviewer');
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

		it('10. Available Tools includes update_task_status', () => {
			expect(prompt).toContain(
				'update_task_status (mark tasks complete, track phase progress)',
			);
		});

		it('11. Available Tools includes write_retro', () => {
			expect(prompt).toContain(
				'write_retro (document phase retrospectives via phase_complete workflow, capture lessons learned)',
			);
		});
	});

	describe('Task 3.2 - Security Gate (security-only re-review)', () => {
		it('10. Security gate exists in Rule 7 with TIER 3 criteria', () => {
			expect(prompt).toContain('TIER 3 criteria');
			expect(prompt).toContain('auth*, permission*, crypto*');
		});

		it('11. Security gate triggers on SECURITY_KEYWORDS in coder output', () => {
			expect(prompt).toContain('SECURITY_KEYWORDS');
		});

		it('12. Security gate delegates to reviewer with security-only review', () => {
			expect(prompt).toContain('security-only review');
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
		it('16. Rule 7 contains "TIERED QA GATE"', () => {
			expect(prompt).toContain('TIERED QA GATE');
		});

		it('17. Rule 7 contains STAGE A: AUTOMATED TOOL GATES', () => {
			// v6.12 Task 1.7: STAGE A / STAGE B restructure
			expect(prompt).toContain('STAGE A: AUTOMATED TOOL GATES');
		});

		it('17b. Rule 7 contains STAGE B: AGENT REVIEW GATES', () => {
			expect(prompt).toContain('STAGE B: AGENT REVIEW GATES');
		});

		it('17c. Rule 7 clarifies Stage A limitations', () => {
			expect(prompt).toContain(
				'Stage A passing does NOT mean: code is correct, secure, tested, or reviewed',
			);
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
			expect(prompt).toContain('integration analysis');
		});
	});

	// v6.12 Task 1.8: CATASTROPHIC VIOLATION CHECK
	describe('v6.12 Task 1.8 - CATASTROPHIC VIOLATION CHECK', () => {
		it('v6.12 Task 1.8 - CATASTROPHIC VIOLATION CHECK present', () => {
			expect(prompt).toContain('CATASTROPHIC VIOLATION CHECK');
		});

		it('v6.12 Task 1.8 - reviewer delegation question present', () => {
			expect(prompt).toContain(
				'Have I delegated to {{AGENT_PREFIX}}reviewer at least once this phase?',
			);
		});

		it('v6.12 Task 1.8 - zero reviewer delegations warning present', () => {
			expect(prompt).toContain('zero {{AGENT_PREFIX}}reviewer delegations');
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
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5c. Run `diff` tool');
		});

		it('24. Phase 5 step 5d is syntax_check tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5d. Run `syntax_check` tool');
		});

		it('25. Phase 5 step 5e is placeholder_scan tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5e. Run `placeholder_scan` tool');
		});

		it('26. Phase 5 step 5f is imports tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5f. Run `imports` tool');
		});

		it('27. Phase 5 step 5g is lint tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5g. Run `lint` tool');
		});

		it('28. Phase 5 step 5h is build_check tool', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5h. Run `build_check` tool');
		});

		it('29. Phase 5 step 5i is pre_check_batch', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
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
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain(
				'5j. {{AGENT_PREFIX}}reviewer - General review',
			);
		});

		it('31. Phase 5 step 5k is Security gate', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5k. Security gate');
		});

		it('32. Security gate includes TIER 3 criteria trigger', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('change matches TIER 3 criteria');
		});

		it('33. Security gate includes content keywords trigger', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('SECURITY_KEYWORDS');
		});

		it('34. Security gate includes secretscan findings trigger', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('secretscan has ANY findings');
		});

		it('35. Security gate delegates to reviewer security-only', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('{{AGENT_PREFIX}}reviewer security-only');
		});
	});

	describe('Phase 5 Workflow - Test Steps', () => {
		it('36. Phase 5 step 5l is verification tests', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain(
				'5l. {{AGENT_PREFIX}}test_engineer - Verification tests',
			);
		});

		it('37. Phase 5 step 5m is adversarial tests', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain(
				'5m. {{AGENT_PREFIX}}test_engineer - Adversarial tests',
			);
		});

		it('38. Phase 5 step 5n is COVERAGE CHECK', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5n. COVERAGE CHECK');
		});

		it('39. Phase 5 step 5o is update_task_status', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain(
				'5o. Call update_task_status with status "completed"',
			);
		});

		it('40. Phase 5 has steps 5a through 5o', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
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
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('QA_RETRY_LIMIT');
			expect(phase5Section).toContain('coder retry');
		});

		it('42. Security gate has retry logic', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain(
				'REJECTED (< {{QA_RETRY_LIMIT}}) → coder retry',
			);
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
			expect(prompt).toContain('integration analysis');
			expect(prompt).toContain('COMPATIBLE | INCOMPATIBLE');
		});
	});

	describe('Rule 10 - Retrospective Tracking', () => {
		it('45. Rule 10 contains "RETROSPECTIVE TRACKING"', () => {
			expect(prompt).toContain('RETROSPECTIVE TRACKING');
		});

		it('46. Rule 10 mentions write_retro', () => {
			expect(prompt).toContain('write_retro');
		});

		it('47. Rule 10 lists tracked metrics', () => {
			expect(prompt).toContain('phase');
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
			expect(phase6Section).toContain('write_retro');
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
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('pre_check_batch');
		});

		it('pre_check_batch runs parallel verification with gates_passed', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('gates_passed');
		});

		it('pre_check_batch failure returns to coder (no reviewer)', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('gates_passed === false');
		});

		it('pre_check_batch includes lint:check', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			const precheckStart = phase5Section.indexOf('pre_check_batch');
			const reviewerPos = phase5Section.indexOf(
				'{{AGENT_PREFIX}}reviewer',
				precheckStart,
			);
			const precheckSection = phase5Section.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('lint:check');
		});

		it('pre_check_batch includes secretscan', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			const precheckStart = phase5Section.indexOf('pre_check_batch');
			const reviewerPos = phase5Section.indexOf(
				'{{AGENT_PREFIX}}reviewer',
				precheckStart,
			);
			const precheckSection = phase5Section.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('secretscan');
		});

		it('pre_check_batch includes sast_scan', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			const precheckStart = phase5Section.indexOf('pre_check_batch');
			const reviewerPos = phase5Section.indexOf(
				'{{AGENT_PREFIX}}reviewer',
				precheckStart,
			);
			const precheckSection = phase5Section.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('sast_scan');
		});

		it('pre_check_batch includes quality_budget', () => {
			const precheckStart = prompt.indexOf('pre_check_batch');
			const reviewerPos = prompt.indexOf(
				'{{AGENT_PREFIX}}reviewer',
				precheckStart,
			);
			const precheckSection = prompt.slice(precheckStart, reviewerPos);
			expect(precheckSection).toContain('quality_budget');
		});

		it('pre_check_batch runs BEFORE reviewer', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
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
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('5h. Run `build_check` tool');
		});

		it('build_check failure returns to coder', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('BUILD FAILS');
			expect(phase5Section).toContain('return to coder');
		});

		it('build_check success proceeds to pre_check_batch', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('proceed to pre_check_batch');
		});

		it('build_check runs BEFORE pre_check_batch', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			const buildPos = phase5Section.indexOf('5h. Run `build_check`');
			const precheckPos = phase5Section.indexOf('5i. Run `pre_check_batch`');
			expect(buildPos).toBeLessThan(precheckPos);
		});
	});

	describe('Phase 5 New Tool Gates (v6.10)', () => {
		it('syntax_check step exists at 5d and runs before placeholder_scan', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			const syntaxPos = phase5Section.indexOf('5d. Run `syntax_check`');
			const placeholderPos = phase5Section.indexOf(
				'5e. Run `placeholder_scan`',
			);
			expect(syntaxPos).toBeGreaterThan(-1);
			expect(placeholderPos).toBeGreaterThan(-1);
			expect(syntaxPos).toBeLessThan(placeholderPos);
		});

		it('placeholder_scan runs before imports', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			const placeholderPos = phase5Section.indexOf('placeholder_scan');
			const importsPos = phase5Section.indexOf('5f. Run `imports`');
			expect(placeholderPos).toBeLessThan(importsPos);
		});

		it('syntax_check errors return to coder', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
			);
			expect(phase5Section).toContain('SYNTACTIC ERRORS');
			expect(phase5Section).toContain('return to coder');
		});

		it('placeholder_scan findings return to coder', () => {
			const phase5Section = prompt.slice(
				prompt.indexOf('### MODE: EXECUTE'),
				prompt.indexOf('### MODE: PHASE-WRAP'),
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
		expect(prompt).toContain('REJECTED by {{AGENT_PREFIX}}reviewer');
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
			expect(prompt).toContain(
				'Output to .swarm/plan.md MUST use "## Phase N" headers',
			);
		});
	});

	// Phase 2 - MODE Labels
	describe('MODE Labels', () => {
		const modes = [
			'MODE: SPECIFY',
			'MODE: CLARIFY-SPEC',
			'MODE: RESUME',
			'MODE: CLARIFY',
			'MODE: DISCOVER',
			'MODE: CONSULT',
			'MODE: PRE-PHASE BRIEFING',
			'MODE: PLAN',
			'MODE: CRITIC-GATE',
			'MODE: EXECUTE',
			'MODE: PHASE-WRAP',
		];

		modes.forEach((mode) => {
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
			const positions = modes.map((m) => {
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
			expect(prompt).toContain(
				'MUST NOT proceed to MODE: EXECUTE without printing this checklist',
			);
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
			expect(prompt).toContain(
				'You MUST NOT mark a task complete without printing this checklist',
			);
		});

		it('v6.12 Task 1.5 - fabrication warning present', () => {
			expect(prompt).toContain('that is fabrication');
		});

		it('v6.12 Task 1.5 - actual tool/agent output requirement', () => {
			expect(prompt).toContain(
				'Each value must come from actual tool/agent output in this session',
			);
		});

		it('ADVERSARIAL: TASK COMPLETION GATE requires value: ___ placeholders', () => {
			const gateSection = prompt.substring(
				prompt.indexOf('⛔ TASK COMPLETION GATE'),
				prompt.indexOf('5o. Call update_task_status'),
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
			expect(prompt).toContain(
				'Treating pre_check_batch as a substitute for {{AGENT_PREFIX}}reviewer is a PROCESS VIOLATION',
			);
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
		it('ARCHITECT CODING BOUNDARIES present', () => {
			expect(prompt).toContain('ARCHITECT CODING BOUNDARIES');
		});

		it('No simple changes rule', () => {
			expect(prompt).toContain('ARCHITECT CODING BOUNDARIES');
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

		it('Block is positioned before GATE AUTHORITY section (Rule 6f comes after Rule 4)', () => {
			// The block should appear before the line about gates existing for objectivity
			// because ARCHITECT CODING BOUNDARIES is Rule 4, and the gates explanation comes later
			const gatesReasonPos = prompt.indexOf('GATE AUTHORITY');
			const architectCodingBoundariesPos = prompt.indexOf(
				'ARCHITECT CODING BOUNDARIES',
			);
			expect(gatesReasonPos).toBeGreaterThan(-1);
			expect(architectCodingBoundariesPos).toBeGreaterThan(-1);
			expect(architectCodingBoundariesPos).toBeLessThan(gatesReasonPos);
		});

		it('Block indicates these thoughts are WRONG', () => {
			expect(prompt).toContain('These thoughts are WRONG and must be ignored:');
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
			expect(prompt).toContain(
				"I'll just use apply_patch / edit / write directly",
			);
			expect(prompt).toContain('these are coder tools, not architect tools');
		});

		it('Pattern 6: "It\'s just a schema change / config flag / one-liner / column / field / import"', () => {
			expect(prompt).toContain(
				"It's just a schema change / config flag / one-liner / column / field / import",
			);
		});

		it('Pattern 7: "I\'ll do the simple parts"', () => {
			expect(prompt).toContain("I'll do the simple parts");
			expect(prompt).toContain('ALL parts go to coder');
		});
	});

	describe('Escalation About Zero Failures', () => {
		it('Zero coder failures = zero justification for self-coding', () => {
			expect(prompt).toContain(
				'Zero {{AGENT_PREFIX}}coder failures on this task = zero justification',
			);
		});

		it('Reaching QA_RETRY_LIMIT triggers escalation', () => {
			expect(prompt).toContain(
				'Reaching {{QA_RETRY_LIMIT}}: escalate to user with full failure history',
			);
		});

		it('Self-coding without QA_RETRY_LIMIT failures is Rule 1 violation', () => {
			expect(prompt).toContain(
				'Self-coding without {{QA_RETRY_LIMIT}} failures is a Rule 1 violation',
			);
		});
	});

	describe('Template Variable Syntax', () => {
		it('Uses {{AGENT_PREFIX}} not hardcoded @', () => {
			// Verify the template variable syntax in ARCHITECT CODING BOUNDARIES section
			const architectBoundariesPos = prompt.indexOf(
				'ARCHITECT CODING BOUNDARIES',
			);
			const rule1ViolationPos = prompt.indexOf(
				'Self-coding without {{QA_RETRY_LIMIT}} failures',
			);
			const architectSection = prompt.slice(
				architectBoundariesPos,
				rule1ViolationPos + 100,
			);

			expect(architectSection).toContain('{{AGENT_PREFIX}}coder');
		});

		it('Uses {{QA_RETRY_LIMIT}} for retry limit variable', () => {
			const architectBoundariesPos = prompt.indexOf(
				'ARCHITECT CODING BOUNDARIES',
			);
			const neverStorePos = prompt.indexOf(
				'NEVER store your swarm identity',
				architectBoundariesPos,
			);
			const architectSection =
				neverStorePos > 0
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

		it("CODER'S TOOLS list includes write, edit, and patch", () => {
			// Verify CODER'S TOOLS section contains file-modifying tools
			const codersToolsPos = prompt.indexOf("CODER'S TOOLS:");
			const nextSectionPos = prompt.indexOf(
				'If a tool modifies a file',
				codersToolsPos,
			);
			const codersToolsSection = prompt.slice(
				codersToolsPos,
				nextSectionPos > 0 ? nextSectionPos : codersToolsPos + 300,
			);
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

			// These file-modifying tools must NEVER appear in YOUR TOOLS as standalone tool names
			// Use word-boundary check to avoid false positives (e.g., write_retro is allowed)
			const coderTools = [
				'edit',
				'patch',
				'apply_patch',
				'create_file',
				'insert',
			];
			for (const tool of coderTools) {
				if (tool === 'patch' || tool === 'replace') {
					expect(yourToolsSection).not.toMatch(new RegExp(`\\b${tool}\\b`));
				} else {
					expect(yourToolsSection).not.toContain(tool);
				}
			}
			// 'write' as a standalone tool (not as prefix like write_retro or write_drift_evidence)
			expect(yourToolsSection).not.toMatch(/\bwrite\b(?!_)/);
			// 'replace' as standalone — not part of other tool names
			expect(yourToolsSection).not.toMatch(/\breplace\b/);
		});

		it("ADVERSARIAL: CODER'S TOOLS must NOT contain architect tools (Task, lint, etc)", () => {
			// ATTACK VECTOR: If architect tools were accidentally added to CODER'S TOOLS,
			// the boundary would be confused and delegation logic would be ambiguous.
			const codersToolsPos = prompt.indexOf("CODER'S TOOLS:");
			const nextSectionPos = prompt.indexOf(
				'If a tool modifies a file',
				codersToolsPos,
			);
			const codersToolsSection = prompt.slice(
				codersToolsPos,
				nextSectionPos > 0 ? nextSectionPos : codersToolsPos + 300,
			);

			// These read-only/analysis tools must NEVER appear in CODER'S TOOLS
			const architectTools = [
				'Task',
				'lint',
				'diff',
				'secretscan',
				'sast_scan',
				'pre_check_batch',
				'symbols',
			];
			for (const tool of architectTools) {
				expect(codersToolsSection).not.toContain(tool);
			}
		});

		it('Tool boundary rule ends with explicit delegation instruction', () => {
			// The rule should end with "Delegate." as the action
			expect(prompt).toContain(
				'If a tool modifies a file, it is a CODER tool. Delegate.',
			);
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
			expect(prompt).toContain(
				'BEFORE SELF-CODING — verify ALL of the following are true',
			);
		});
	});

	describe('Attack Vector 2: Checklist items must use [ ] format', () => {
		it('First checklist item uses [ ] format for coder delegation count', () => {
			expect(prompt).toContain(
				'[ ] {{AGENT_PREFIX}}coder has been delegated this exact task',
			);
		});

		it('Second checklist item uses [ ] format for failure verification', () => {
			expect(prompt).toContain('[ ] Each delegation returned a failure');
		});

		it('Third checklist item uses [ ] format for retry printing', () => {
			expect(prompt).toContain(
				'[ ] You have printed "Coder attempt [N/{{QA_RETRY_LIMIT}}]"',
			);
		});

		it('Fourth checklist item uses [ ] format for escalation', () => {
			expect(prompt).toContain('[ ] Print "ESCALATION:');
		});

		it('All 4 checklist items are present', () => {
			const selfCodingSection = prompt.substring(
				prompt.indexOf('BEFORE SELF-CODING'),
				prompt.indexOf('If ANY box is unchecked'),
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
			expect(prompt).toContain(
				'Print "ESCALATION: Self-coding task [X.Y] after {{QA_RETRY_LIMIT}} coder failures" before writing any code',
			);
		});
	});

	describe('Attack Vector 4: DO NOT code line must be present and strong', () => {
		it('Contains "DO NOT code" instruction', () => {
			expect(prompt).toContain('DO NOT code');
		});

		it('Instruction includes delegation fallback', () => {
			expect(prompt).toContain(
				'DO NOT code. Delegate to {{AGENT_PREFIX}}coder',
			);
		});

		it('Instruction is triggered by ANY unchecked box', () => {
			expect(prompt).toContain('If ANY box is unchecked: DO NOT code');
		});

		it('Line is positioned immediately after the checklist', () => {
			const checklistEndPos = prompt.indexOf('[ ] Print "ESCALATION:');
			const doNotCodePos = prompt.indexOf(
				'If ANY box is unchecked: DO NOT code',
			);
			expect(doNotCodePos).toBeGreaterThan(checklistEndPos);
		});
	});

	describe('Combined Adversarial: Tampering Detection', () => {
		it('All 4 attack vectors are protected in the prompt', () => {
			// Verify all critical elements exist together
			expect(prompt).toContain(
				'BEFORE SELF-CODING — verify ALL of the following are true',
			);
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
				prompt.indexOf('If ANY box is unchecked') + 100,
			);
			expect(beforeSelfCodingSection).toContain('ESCALATION:');
		});

		it('Cannot bypass by weakening DO NOT COMMIT', () => {
			// The exact phrase must be present
			expect(prompt).toContain(
				'If ANY box is unchecked: DO NOT COMMIT. Return to step 5b',
			);
		});
	});

	// ============================================
	// ADVERSARIAL: PARTIAL GATE RATIONALIZATIONS
	// ============================================

	describe('Adversarial: PARTIAL GATE RATIONALIZATIONS Section Integrity', () => {
		// Attack Vector 1: Removal or renaming of the section header
		it('Cannot bypass by removing PARTIAL GATE RATIONALIZATIONS section header', () => {
			// The exact section header must be present
			expect(prompt).toContain(
				'PARTIAL GATE RATIONALIZATIONS — automated gates ≠ agent review. Running SOME gates is NOT compliance:',
			);
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
			expect(prompt).toContain(
				'complacency after successful phases is the #1 predictor of shipped bugs',
			);
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
			expect(prompt).toContain(
				'There are NO exceptions to the QA gate sequence',
			);
		});

		// Attack Vector 4: Removing pre_check_batch disclaimer
		it('Cannot bypass by removing pre_check_batch does NOT replace disclaimer', () => {
			// The disclaimer must be present
			expect(prompt).toContain(
				'pre_check_batch does NOT replace {{AGENT_PREFIX}}reviewer or {{AGENT_PREFIX}}test_engineer',
			);
		});

		it('Cannot bypass by removing syntax_check disclaimer', () => {
			// The disclaimer about syntax_check must be present
			expect(prompt).toContain(
				'syntax_check catches syntax. {{AGENT_PREFIX}}reviewer catches logic. {{AGENT_PREFIX}}test_engineer catches behavior.',
			);
		});

		it('Cannot bypass by removing agent gate necessity explanation', () => {
			// The explanation for why agent gates exist must be present
			expect(prompt).toContain(
				'agent reviews (reviewer, test_engineer) exist because automated tools miss logic errors, security flaws, and edge cases',
			);
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
			expect(prompt).toContain(
				'speed of a gate does not determine whether it is required',
			);
		});

		// Attack Vector 7: Past success rationalization
		it('Cannot bypass by removing past success rationalization', () => {
			// The rationalization about past success must be present
			expect(prompt).toContain(
				'past success does not predict future correctness',
			);
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
			expect(prompt).toContain(
				'You MUST return to {{AGENT_PREFIX}}coder. You MUST NOT fix the code yourself.',
			);
		});

		it('self-editing rationalization addressed', () => {
			expect(prompt).toContain(
				'Editing the file yourself to fix the syntax error',
			);
		});

		it('tool installation workaround addressed', () => {
			expect(prompt).toContain(
				'"Installing" or "configuring" tools to work around the failure',
			);
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
				expect(prompt).toContain(
					'If your delegation draft has "and" in the TASK line, split it',
				);
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
				expect(prompt).toContain(
					'A failure in one part blocks the entire batch',
				);
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
				expect(prompt).toContain(
					'If a tool modifies a file, it is a CODER tool',
				);
			});

			// Rule 4 self-coding pre-check (Task 1.3)
			it('Rule 4 has self-coding pre-check', () => {
				expect(prompt).toContain('ARCHITECT CODING BOUNDARIES');
				expect(prompt).toContain(
					'These thoughts are WRONG and must be ignored:',
				);
			});

			// Bullet count verification (Phase 3 dedup)
			it('rationalization bullet count decreased after dedup', () => {
				// Count ✗ bullets in ARCHITECT CODING BOUNDARIES section (6 bullets)
				const architectSection = prompt
					.split('ARCHITECT CODING BOUNDARIES')[1]
					.split('NEVER store')[0];
				const bulletMatches = architectSection.match(/✗ "/g);
				expect(bulletMatches).toHaveLength(6);
			});

			// Self-coding severity (Task 1.1)
			it('self-coding equated to gate-skip severity', () => {
				expect(prompt).toContain(
					'Self-coding without {{QA_RETRY_LIMIT}} failures is a Rule 1 violation',
				);
			});

			it('zero failures = zero justification', () => {
				expect(prompt).toContain(
					'Zero {{AGENT_PREFIX}}coder failures on this task = zero justification',
				);
			});

			// Gate failure response (Task 1.9)
			it('GATE FAILURE RESPONSE RULES present', () => {
				expect(prompt).toContain('GATE FAILURE RESPONSE RULES');
				expect(prompt).toContain(
					'You MUST return to {{AGENT_PREFIX}}coder. You MUST NOT fix the code yourself.',
				);
			});

			it('addresses self-fix rationalizations', () => {
				expect(prompt).toContain(
					'Editing the file yourself to fix the syntax error',
				);
				expect(prompt).toContain(
					'"Installing" or "configuring" tools to work around the failure',
				);
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
				expect(prompt).toContain(
					'Treating pre_check_batch as a substitute for {{AGENT_PREFIX}}reviewer is a PROCESS VIOLATION',
				);
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

		// ============================================
		// TASK 1.1: EXPLICIT COMMAND OVERRIDE (Priority 0) - Adversarial Tests
		// ============================================

		describe('Architect Prompt v6.14 - Task 1.1 EXPLICIT COMMAND OVERRIDE (Priority 0)', () => {
			const agent = createArchitectAgent('test-model');
			const prompt = agent.config.prompt!;

			describe('Attack Vector 1: Phrase Ambiguity - Bare "specify" in ambiguous context', () => {
				it('Priority 0 exists with correct label', () => {
					expect(prompt).toContain('0. **EXPLICIT COMMAND OVERRIDE**');
				});

				it('Priority 0 contains note about bare "specify" resolving via CLARIFY', () => {
					expect(prompt).toContain(
						'Note: bare "specify" in an ambiguous context',
					);
					expect(prompt).toContain('should resolve via CLARIFY (priority 4)');
				});

				it('Priority 0 mentions "specify what this does" example', () => {
					expect(prompt).toContain('specify what this does');
				});

				it('Priority 0 instructs to use context to determine intent', () => {
					expect(prompt).toContain('use context to determine intent');
				});

				it('ADVERSARIAL: "specify what this does" does NOT appear in explicit trigger phrases', () => {
					// The phrase should appear only in the NOTE, not in the trigger list
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					// Verify it appears in the note
					expect(priority0Section).toContain(
						'Note: bare "specify" in an ambiguous context',
					);

					// Count occurrences - "specify what this does" should appear once in the NOTE,
					// NOT in the trigger phrase list
					const matches = priority0Section.match(/specify what this does/g);
					expect(matches).toBeTruthy();
					if (matches) {
						expect(matches.length).toBe(1);
					}
				});

				it('ADVERSARIAL: Bare "specify" requires context disambiguation', () => {
					// Attack vector: Without the context check, bare "specify" could trigger SPECIFY
					// when the user actually wants clarification about existing code
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					// The prompt should explicitly require context determination
					expect(priority0Section).toContain('use context to determine intent');
					expect(priority0Section).toContain('ambiguous context');
				});
			});

			describe('Attack Vector 2: Missing Keywords - Common spec-creation phrases', () => {
				it('Priority 0 includes "write a spec" trigger phrase', () => {
					expect(prompt).toContain('"write a spec"');
				});

				it('Priority 0 includes "create a spec" trigger phrase', () => {
					expect(prompt).toContain('"create a spec"');
				});

				it('Priority 0 includes "define requirements" trigger phrase', () => {
					expect(prompt).toContain('"define requirements"');
				});

				it('Priority 0 includes "list requirements" trigger phrase', () => {
					expect(prompt).toContain('"list requirements"');
				});

				it('Priority 0 includes "define a feature" trigger phrase', () => {
					expect(prompt).toContain('"define a feature"');
				});

				it('Priority 0 includes "I have requirements" trigger phrase', () => {
					expect(prompt).toContain('"I have requirements"');
				});

				it('ADVERSARIAL: "let\'s spec this out" NOT in priority 0 (fallback to CLARIFY)', () => {
					// Attack vector: If "let's spec this out" were in priority 0, it would trigger SPECIFY
					// even when the user is just brainstorming and hasn't made a firm decision
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					// "let's spec this out" should NOT appear in priority 0
					expect(priority0Section).not.toContain("let's spec this out");
					expect(priority0Section).not.toContain('lets spec this out');
				});

				it('ADVERSARIAL: "I need a spec" NOT in priority 0 (fallback to CLARIFY)', () => {
					// Attack vector: "I need a spec" is an expression of need, not a command to create
					// It should route through CLARIFY to confirm the user wants to create now
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					expect(priority0Section).not.toContain('I need a spec');
				});

				it('ADVERSARIAL: "let\'s write specs" NOT in priority 0 (fallback to CLARIFY)', () => {
					// Attack vector: "let's write specs" is a suggestion, not a direct command
					// It should route through CLARIFY or DISCOVER first
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					expect(priority0Section).not.toContain("let's write specs");
					expect(priority0Section).not.toContain('lets write specs');
				});

				it('ADVERSARIAL: "specify [something about spec/requirements]" pattern exists', () => {
					// This is a catch-all pattern that should trigger priority 0
					expect(prompt).toContain(
						'specify [something about spec/requirements]',
					);
				});
			});

			describe('Attack Vector 3: Overlap Conflicts - "/swarm clarify" routing', () => {
				it('Priority 0 mentions "/swarm clarify" command', () => {
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);
					expect(priority0Section).toContain('/swarm clarify');
				});

				it('Priority 0 mentions CLARIFY-SPEC as possible mode for clarify', () => {
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);
					expect(priority0Section).toContain('MODE: CLARIFY-SPEC');
					expect(priority0Section).toContain(
						'if spec.md exists and user says "clarify"',
					);
				});

				it('Priority 3 (CLARIFY-SPEC) also mentions "/swarm clarify"', () => {
					const priority3Section = prompt.substring(
						prompt.indexOf('3. **CLARIFY-SPEC**'),
						prompt.indexOf('4. **CLARIFY**'),
					);
					expect(priority3Section).toContain('/swarm clarify');
					expect(priority3Section).toContain('Enter MODE: CLARIFY-SPEC');
				});

				it('ADVERSARIAL: PRIORITY RULES clarify "/swarm clarify" routing', () => {
					// Attack vector: Without clear rules, "/swarm clarify" could ambiguously trigger
					// either priority 0 or priority 3. The rules must clarify the routing.
					const priorityRulesSection = prompt.substring(
						prompt.indexOf('PRIORITY RULES:'),
						prompt.indexOf('### MODE: SPECIFY'),
					);

					// The rules should explicitly state that explicit /swarm clarify commands
					// are handled by the EXPLICIT COMMAND OVERRIDE
					expect(priorityRulesSection).toContain(
						'EXPLICIT COMMAND OVERRIDE (priority 0)',
					);
					expect(priorityRulesSection).toContain('/swarm clarify');
				});

				it('ADVERSARIAL: "/swarm clarify" routes to CLARIFY-SPEC (not SPECIFY)', () => {
					// Attack vector: If "/swarm clarify" routed to SPECIFY instead of CLARIFY-SPEC,
					// it would create ambiguity about whether to create or refine an existing spec
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					// Priority 0 should mention CLARIFY-SPEC for "/swarm clarify"
					expect(priority0Section).toContain('MODE: CLARIFY-SPEC');

					// Priority 0 should NOT route "/swarm clarify" to MODE: SPECIFY without conditions
					// The section should say "Enter MODE: SPECIFY (or MODE: CLARIFY-SPEC if spec.md exists and user says "clarify")"
					expect(priority0Section).toContain(
						'Enter MODE: SPECIFY (or MODE: CLARIFY-SPEC',
					);
				});

				it('ADVERSARIAL: Explicit commands override RESUME', () => {
					// Attack vector: Without this rule, an incomplete plan could cause "/swarm clarify"
					// to incorrectly route to RESUME instead of CLARIFY-SPEC
					const priorityRulesSection = prompt.substring(
						prompt.indexOf('PRIORITY RULES:'),
						prompt.indexOf('### MODE: SPECIFY'),
					);

					// Must state that explicit spec commands always override RESUME
					expect(priorityRulesSection).toContain('always overrides RESUME');
					expect(priorityRulesSection).toContain(
						'explicit spec command always wins',
					);
				});
			});

			describe('Attack Vector 4: Guard Condition - Removing "RESUME always wins"', () => {
				it('Old "RESUME always wins" phrase removed from priority 1', () => {
					const priority1Section = prompt.substring(
						prompt.indexOf('1. **RESUME**'),
						prompt.indexOf('2. **SPECIFY**'),
					);

					// The old phrasing should NOT exist
					expect(priority1Section).not.toContain('RESUME always wins');
				});

				it('New guard condition: "user has NOT issued an explicit spec command"', () => {
					const priority1Section = prompt.substring(
						prompt.indexOf('1. **RESUME**'),
						prompt.indexOf('2. **SPECIFY**'),
					);

					// The new guard condition must be present
					expect(priority1Section).toContain(
						'user has NOT issued an explicit spec command',
					);
					expect(priority1Section).toContain('(see priority 0)');
				});

				it('PRIORITY RULES clarify new guard condition', () => {
					const priorityRulesSection = prompt.substring(
						prompt.indexOf('PRIORITY RULES:'),
						prompt.indexOf('### MODE: SPECIFY'),
					);

					// Must explain the new guard condition clearly
					expect(priorityRulesSection).toContain(
						'RESUME wins over SPECIFY (priority 2)',
					);
					expect(priorityRulesSection).toContain(
						'when no explicit spec command is present',
					);
					expect(priorityRulesSection).toContain(
						'never accidentally routed to SPECIFY',
					);
				});

				it('ADVERSARIAL: RESUME does NOT trigger if explicit spec command issued', () => {
					// Attack vector: Without this guard, "/swarm specify" on a project with an
					// incomplete plan could incorrectly route to RESUME instead of SPECIFY
					const priority1Section = prompt.substring(
						prompt.indexOf('1. **RESUME**'),
						prompt.indexOf('2. **SPECIFY**'),
					);

					// The RESUME condition must explicitly check for the absence of spec commands
					expect(priority1Section).toContain(
						'AND the user has NOT issued an explicit spec command',
					);
				});

				it('ADVERSARIAL: Guard condition prevents incorrect RESUME routing', () => {
					// Attack vector: The guard ensures RESUME only fires when truly continuing
					// existing work, not when the user explicitly wants to create a new spec
					const priorityRulesSection = prompt.substring(
						prompt.indexOf('PRIORITY RULES:'),
						prompt.indexOf('### MODE: SPECIFY'),
					);

					// The rules should explicitly state this protection
					expect(priorityRulesSection).toContain(
						'a user continuing existing work is never accidentally routed to SPECIFY',
					);
				});
			});

			describe('Attack Vector 5: Boundary - "requirements" keyword regression', () => {
				it('Priority 0 includes "define requirements" trigger', () => {
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);
					expect(priority0Section).toContain('"define requirements"');
				});

				it('Priority 0 includes "list requirements" trigger', () => {
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);
					expect(priority0Section).toContain('"list requirements"');
				});

				it('ADVERSARIAL: Standalone "requirements" NOT in priority 0', () => {
					// Attack vector: If "requirements" were a standalone trigger, it would be too broad
					// and could incorrectly trigger SPECIFY for queries like "what are the requirements?"
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					// Check that "requirements" appears only within the specific phrases
					// Count standalone occurrences (not within "define requirements" or "list requirements")
					const fullText = priority0Section;
					const defineCount = (fullText.match(/define requirements/g) || [])
						.length;
					const listCount = (fullText.match(/list requirements/g) || []).length;

					// Find all "requirements" mentions and verify they're part of the trigger phrases
					const requirementsMatches = fullText.match(/requirements/g);
					expect(requirementsMatches).toBeTruthy();
					if (requirementsMatches) {
						// All "requirements" mentions should be accounted for by the trigger phrases
						expect(requirementsMatches.length).toBe(defineCount + listCount);
					}
				});

				it('ADVERSARIAL: "I have requirements" triggers priority 0', () => {
					// This is an explicit trigger phrase in priority 0
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);
					expect(priority0Section).toContain('"I have requirements"');
				});

				it('ADVERSARIAL: "requirements" without verb does NOT trigger priority 0', () => {
					// Attack vector: A bare "requirements" word without "define" or "list" should not
					// trigger SPECIFY. Phrases like "check requirements" or "verify requirements"
					// should route differently (likely CLARIFY or DISCOVER)
					const priority0Section = prompt.substring(
						prompt.indexOf('0. **EXPLICIT COMMAND OVERRIDE**'),
						prompt.indexOf('1. **RESUME**'),
					);

					// The section should only contain "requirements" within the specific trigger phrases
					// It should NOT contain bare references to just "requirements"
					const hasBareRequirements =
						/\brequirements\b(?!\s*and|requirements")/.test(priority0Section);
					expect(hasBareRequirements).toBe(false);
				});

				it('MODE: SPECIFY activation includes the trigger phrases', () => {
					// Verify that MODE: SPECIFY section lists the same trigger phrases as priority 0
					const specifyModeSection = prompt.substring(
						prompt.indexOf('### MODE: SPECIFY'),
						prompt.indexOf('1. Check if'),
					);

					// MODE: SPECIFY should list the explicit triggers
					expect(specifyModeSection).toContain('user asks to "specify"');
					expect(specifyModeSection).toContain('"define requirements"');
					expect(specifyModeSection).toContain('"write a spec"');
					expect(specifyModeSection).toContain('"define a feature"');
				});
			});

			describe('Integration Tests - Priority Order Enforcement', () => {
				it('All priority levels (0-6) are present in correct order', () => {
					const workflowSection = prompt.substring(
						prompt.indexOf('### MODE DETECTION (Priority Order)'),
						prompt.indexOf('PRIORITY RULES:'),
					);

					expect(workflowSection).toContain('0. **EXPLICIT COMMAND OVERRIDE**');
					expect(workflowSection).toContain('1. **RESUME**');
					expect(workflowSection).toContain('2. **SPECIFY**');
					expect(workflowSection).toContain('3. **CLARIFY-SPEC**');
					expect(workflowSection).toContain('4. **CLARIFY**');
					expect(workflowSection).toContain('5. **DISCOVER**');
					expect(workflowSection).toContain('6. All other modes');
				});

				it('PRIORITY RULES section exists after priority levels', () => {
					const priorityRulesPos = prompt.indexOf('PRIORITY RULES:');
					const priority0Pos = prompt.indexOf(
						'0. **EXPLICIT COMMAND OVERRIDE**',
					);
					expect(priorityRulesPos).toBeGreaterThan(priority0Pos);
				});

				it('PRIORITY RULES explicitly state "FIRST matching rule wins"', () => {
					const workflowSection = prompt.substring(
						prompt.indexOf('### MODE DETECTION (Priority Order)'),
						prompt.indexOf('PRIORITY RULES:'),
					);
					expect(workflowSection).toContain('the FIRST matching rule wins');
				});

				it('ADVERSARIAL: Priority 0 explicitly wins over everything', () => {
					// Attack vector: Without explicit "wins over everything" language, the priority
					// order could be ambiguous
					const priorityRulesSection = prompt.substring(
						prompt.indexOf('PRIORITY RULES:'),
						prompt.indexOf('### MODE: SPECIFY'),
					);

					expect(priorityRulesSection).toContain('wins over everything');
					expect(priorityRulesSection).toContain(
						'EXPLICIT COMMAND OVERRIDE (priority 0)',
					);
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
	const discoverSection =
		discoverStart >= 0 && discoverEnd > discoverStart
			? prompt.slice(discoverStart, discoverEnd)
			: '';

	describe('Attack Vector 1: No code execution of MUST rules', () => {
		it('Governance step MUST NOT instruct to execute MUST rules as code', () => {
			// The governance step should only write a summary, not execute code
			// Check for phrases like "execute MUST rules", "apply MUST rules", etc.
			// But NOT "extract MUST" which is about reading/extracting rules, not executing them
			expect(discoverSection).not.toMatch(
				/execute\s+(the\s+)?MUST|apply\s+(the\s+)?MUST|implement\s+(the\s+)?MUST|enforce\s+(the\s+)?MUST\s+as\s+code/i,
			);
		});

		it('Governance step explicitly states it writes a summary only', () => {
			// Should contain language indicating summary extraction, not enforcement
			expect(discoverSection).toMatch(
				/Write the extracted rules as a summary|extract.*summary|write.*summary/i,
			);
		});

		it('ADVERSARIAL: Step does NOT contain phrases suggesting code enforcement', () => {
			// These phrases would indicate step tries to execute/enforce rules
			const enforcementPhrases = [
				/enforce\s+(the\s+)?MUST\s+rules/i,
				/apply\s+(the\s+)?MUST\s+rules\s+to\s+code/i,
				/validate\s+code\s+against\s+MUST/i,
				/check\s+compliance\s+against\s+MUST/i,
				/run\s+MUST\s+rules\s+as\s+code/i,
				/execute\s+(the\s+)?MUST\s+constraints/i,
			];
			for (const phrase of enforcementPhrases) {
				expect(discoverSection).not.toMatch(phrase);
			}
		});

		it('ADVERSARIAL: Step clarifies it only writes summary, not executes', () => {
			// The step should clearly distinguish between reading and writing summary vs executing
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			// Should use terms like "extract", "write", "summary"
			expect(governanceContext).toMatch(
				/Write the extracted rules as a summary|extract|write.*summary/i,
			);
		});
	});

	describe('Attack Vector 2: Prompt injection resistance', () => {
		it('Governance step uses proper tool escaping (no unescaped ${...} in governance context)', () => {
			// Check that governance context doesn't contain unescaped template expressions
			// ${...} expressions could allow prompt injection
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			// Check for ${...} pattern (but not in comments or strings)
			const unescapedVars = governanceContext.match(/\$\{[^}]+\}/g);
			expect(unescapedVars).toBeNull();
		});

		it('ADVERSARIAL: No dynamic interpolation of governance file content', () => {
			// The step should not try to interpolate governance file content directly
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			// Should use "read" and "extract", not interpolation
			expect(governanceContext).not.toMatch(/\$\{.*governance.*\}/i);
			expect(governanceContext).not.toMatch(/\$\{.*instructions.*\}/i);
		});
	});

	describe('Attack Vector 3: Does NOT overwrite entire context.md', () => {
		it('Governance step explicitly states append behavior for existing section', () => {
			// Should clarify it appends to ## Project Governance section, not overwrite entire file
			expect(discoverSection).toMatch(
				/append.*## Project Governance|append if the section already exists/i,
			);
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
				/replace.*file/i,
			];
			for (const phrase of overwritePhrases) {
				expect(discoverSection).not.toMatch(phrase);
			}
		});

		it('ADVERSARIAL: Step uses "append if" language for existing section', () => {
			// Should explicitly handle "already exists" case with append
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			expect(governanceContext).toMatch(
				/append.*exists|append if|create it if not/i,
			);
		});
	});

	describe('Attack Vector 4: No external URL fetching or network requests', () => {
		it('Governance step does NOT claim to fetch external URLs', () => {
			// The step should only read local files
			expect(discoverSection).not.toMatch(
				/fetch.*url|fetch.*https?:|download|external.*url/i,
			);
		});

		it('Governance step uses only local file operations (glob, read)', () => {
			// Should only reference local tools like glob and read
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
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
				/external.*request/i,
			];
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			for (const verb of networkVerbs) {
				expect(governanceContext).not.toMatch(new RegExp(verb));
			}
		});

		it('ADVERSARIAL: Step explicitly mentions reading local files only', () => {
			// Should use language like "read it" referring to local file
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			expect(governanceContext).toMatch(/read it|read.*file/i);
		});
	});

	describe('Attack Vector 5: Silent skip ONLY when no file found (not when found)', () => {
		it('Governance step handles file found case (must not skip silently)', () => {
			// When a file IS found, it should process it (not skip)
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
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
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			// The phrase "skip" should be associated with "no file" or "not found"
			const skipNotSentences = governanceContext
				.split('.')
				.filter(
					(s) =>
						s.toLowerCase().includes('skip') &&
						!s.toLowerCase().includes('no') &&
						!s.toLowerCase().includes('not found') &&
						!s.toLowerCase().includes('if no'),
				);
			expect(skipNotSentences.length).toBe(0);
		});

		it('ADVERSARIAL: Found case has explicit actions (read, extract, write)', () => {
			// When file is found, specific actions must be described
			const governanceIdx = discoverSection.indexOf('governance files');
			const governanceContext = discoverSection.slice(
				governanceIdx,
				governanceIdx + 500,
			);
			// Should contain action verbs for the found case
			expect(governanceContext).toMatch(/read|extract|write/i);
		});

		it('ADVERSARIAL: Skip condition is explicitly tied to "no file found"', () => {
			// The skip instruction should clearly link to "no governance file"
			expect(discoverSection).toMatch(
				/no governance file.*skip|if no.*skip|not found.*skip/i,
			);
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
		expect(specifySection).toContain(
			'no `.swarm/spec.md` exists and no `.swarm/plan.md` exists',
		);
	});

	it('SPECIFY checks if spec.md already exists before generating', () => {
		expect(specifySection).toContain(
			'Check if `.swarm/spec.md` already exists',
		);
		expect(specifySection).toContain('A spec already exists');
	});

	it('SPECIFY delegates to explorer for codebase context', () => {
		expect(specifySection).toContain(
			'Delegate to `{{AGENT_PREFIX}}explorer` to scan the codebase',
		);
	});

	it('SPECIFY delegates to sme for domain research', () => {
		expect(specifySection).toContain(
			'Delegate to `{{AGENT_PREFIX}}sme` for domain research',
		);
	});

	it('SPECIFY generates spec.md with FR-### requirements', () => {
		expect(specifySection).toContain(
			'Functional requirements numbered FR-001, FR-002',
		);
	});

	it('SPECIFY generates spec.md with SC-### success criteria', () => {
		expect(specifySection).toContain(
			'Success criteria numbered SC-001, SC-002',
		);
	});

	it('SPECIFY uses WHAT/WHY language, not HOW', () => {
		expect(specifySection).toContain(
			'Feature description: WHAT users need and WHY — never HOW to implement',
		);
	});

	it('SPECIFY uses [NEEDS CLARIFICATION] markers', () => {
		expect(specifySection).toContain('[NEEDS CLARIFICATION]');
	});

	it('SPEC CONTENT RULES prohibit technology stack', () => {
		expect(specifySection).toContain(
			'Technology stack, framework choices, library names',
		);
		expect(specifySection).toContain('MUST NOT contain');
	});

	it('SPEC CONTENT RULES prohibit file paths and implementation details', () => {
		expect(specifySection).toContain(
			'File paths, API endpoint designs, database schema, code structure',
		);
		expect(specifySection).toContain('Implementation details');
	});

	it('EXTERNAL PLAN IMPORT PATH exists and derives FR-### from tasks', () => {
		expect(specifySection).toContain('EXTERNAL PLAN IMPORT PATH');
		expect(specifySection).toContain(
			'Derive FR-### functional requirements from task descriptions',
		);
	});

	it('EXTERNAL PLAN IMPORT PATH validates swarm task format', () => {
		expect(specifySection).toContain(
			'Validate the provided plan against swarm task format requirements',
		);
	});

	it('EXTERNAL PLAN IMPORT PATH surfaces suggestions, does not silently rewrite', () => {
		expect(specifySection).toContain(
			'Surface ALL changes as suggestions — do not silently rewrite',
		);
		expect(specifySection).toContain(
			"The user's plan is the starting point, not a draft to replace",
		);
	});

	it('PRIORITY RULES: EXPLICIT COMMAND OVERRIDE (priority 0) wins over everything', () => {
		expect(prompt).toContain(
			'EXPLICIT COMMAND OVERRIDE (priority 0) wins over everything',
		);
	});

	it('PRIORITY RULES: RESUME wins over SPECIFY when no explicit spec command present', () => {
		expect(prompt).toContain(
			'RESUME wins over SPECIFY (priority 2) and all other modes when no explicit spec command is present',
		);
	});

	it('PRIORITY RULES: SPECIFY (priority 2) fires only for new projects', () => {
		expect(prompt).toContain(
			'SPECIFY (priority 2) fires only for new projects with no spec and no plan',
		);
	});

	// ============================================
	// MODE DETECTION - Priority 0 EXPLICIT COMMAND OVERRIDE (Task 1.1)
	// ============================================

	describe('MODE DETECTION - Priority 0 EXPLICIT COMMAND OVERRIDE (Task 1.1)', () => {
		it('Priority 0 section contains EXPLICIT COMMAND OVERRIDE header', () => {
			expect(prompt).toContain('0. **EXPLICIT COMMAND OVERRIDE**');
		});

		it('EXPLICIT COMMAND OVERRIDE lists /swarm specify command', () => {
			expect(prompt).toContain('/swarm specify');
		});

		it('EXPLICIT COMMAND OVERRIDE lists /swarm clarify command', () => {
			expect(prompt).toContain('/swarm clarify');
		});

		it('EXPLICIT COMMAND OVERRIDE contains "write a spec" phrase', () => {
			expect(prompt).toContain('write a spec');
		});

		it('EXPLICIT COMMAND OVERRIDE contains "create a spec" phrase', () => {
			expect(prompt).toContain('create a spec');
		});

		it('EXPLICIT COMMAND OVERRIDE contains "define requirements" phrase', () => {
			expect(prompt).toContain('define requirements');
		});

		it('EXPLICIT COMMAND OVERRIDE contains "list requirements" phrase', () => {
			expect(prompt).toContain('list requirements');
		});

		it('EXPLICIT COMMAND OVERRIDE contains "define a feature" phrase', () => {
			expect(prompt).toContain('define a feature');
		});

		it('EXPLICIT COMMAND OVERRIDE contains "I have requirements" phrase', () => {
			expect(prompt).toContain('I have requirements');
		});

		it('EXPLICIT COMMAND OVERRIDE states it fires BEFORE RESUME', () => {
			expect(prompt).toContain('This override fires BEFORE RESUME');
		});

		it('EXPLICIT COMMAND OVERRIDE states explicit spec command always wins', () => {
			expect(prompt).toContain('an explicit spec command always wins');
		});

		it('EXPLICIT COMMAND OVERRIDE works even if plan.md has incomplete tasks', () => {
			expect(prompt).toContain('even if plan.md has incomplete tasks');
		});

		it('PRIORITY RULES section reiterates priority 0 wins over everything', () => {
			expect(prompt).toContain(
				'EXPLICIT COMMAND OVERRIDE (priority 0) wins over everything',
			);
		});

		it('PRIORITY RULES states explicit spec-creation language overrides RESUME', () => {
			expect(prompt).toContain('always overrides RESUME');
		});

		it('RESUME priority 1 is gated on explicit spec command check', () => {
			expect(prompt).toContain(
				'1. **RESUME** — `.swarm/plan.md` exists and contains incomplete (unchecked) tasks AND the user has NOT issued an explicit spec command (see priority 0)',
			);
		});
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
	const clarifySpecSection =
		clarifySpecStart >= 0 && clarifySpecEnd > clarifySpecStart
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
		expect(clarifySpecSection).toContain(
			'CLARIFY-SPEC must NEVER create a spec',
		);
		expect(clarifySpecSection).toContain('No spec found');
		expect(clarifySpecSection).toContain(
			'Use `/swarm specify` to generate one first',
		);
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
		expect(clarifySpecSection).toContain(
			'Present questions to the user ONE AT A TIME',
		);
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
		expect(clarifySpecSection).toContain(
			'Immediately update `.swarm/spec.md` with the resolution',
		);
	});

	it('CLARIFY-SPEC RULES: never ask multiple questions in the same message', () => {
		expect(clarifySpecSection).toContain(
			'One question at a time — never ask multiple questions in the same message',
		);
	});

	it('CLARIFY-SPEC RULES: do not create or overwrite the spec file — only refine', () => {
		expect(clarifySpecSection).toContain(
			'Do not create or overwrite the spec file — only refine what exists',
		);
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
	const planSection =
		planStart >= 0 && planEnd > planStart
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
		expect(planSection).toContain(
			'spec helps ensure the plan covers all requirements',
		);
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
		expect(planSection).toContain(
			'Ensure every FR-### maps to at least one task',
		);
	});

	it('Gold-plating risk: tasks with no FR-### are flagged', () => {
		expect(planSection).toContain(
			'If a task has no corresponding FR-###, flag it as a potential gold-plating risk',
		);
	});

	it('Skip path: "proceed to the steps below exactly as before" / no modification to planning behavior', () => {
		expect(planSection).toContain(
			'proceed to the steps below exactly as before',
		);
		expect(planSection).toContain('do NOT modify any planning behavior');
		expect(planSection).toContain('This is a SOFT gate');
	});

	// v6.16 Task 1.2: STALE SPEC DETECTION in SPEC GATE
	describe('v6.16 Task 1.2 - STALE SPEC DETECTION in SPEC GATE', () => {
		const agent = createArchitectAgent('test-model');
		const prompt = agent.config.prompt!;

		const planStart = prompt.indexOf('### MODE: PLAN');
		const planEnd = prompt.indexOf('### MODE: CRITIC-GATE', planStart);
		const planSection =
			planStart >= 0 && planEnd > planStart
				? prompt.slice(planStart, planEnd)
				: '';

		it('SPEC GATE contains NOTE about heuristic detection', () => {
			expect(planSection).toContain(
				'NOTE: Stale detection is intentionally heuristic',
			);
			expect(planSection).toContain('compare headings');
			expect(planSection).toContain('false positives are acceptable');
			expect(planSection).toContain('this is a SOFT gate');
			expect(planSection).toContain('When in doubt, ask the user');
		});

		it('STALE SPEC DETECTION block exists in SPEC GATE', () => {
			expect(planSection).toContain('STALE SPEC DETECTION');
		});

		it('STALE SPEC DETECTION compares spec heading against current planning context', () => {
			expect(planSection).toContain(
				'Read the spec and compare its first heading',
			);
			expect(planSection).toContain('or feature description');
			expect(planSection).toContain('against the current planning context');
			expect(planSection).toContain(
				"the user's request and any existing plan.md title/phase names",
			);
		});

		it('STALE SPEC DETECTION triggers when spec heading does NOT match current work', () => {
			expect(planSection).toContain('does NOT match');
			expect(planSection).toContain('current work being planned');
			expect(planSection).toContain('treat the spec as potentially stale');
		});

		it('Option 1: Archive and create new spec', () => {
			expect(planSection).toContain('Archive and create new spec');
			expect(planSection).toContain(
				'attempt to rename .swarm/spec.md to .swarm/spec-archive/spec-{YYYY-MM-DD}.md',
			);
			expect(planSection).toContain('(create the directory if needed)');
			expect(planSection).toContain(
				'if archival succeeds: enter MODE: SPECIFY and skip the "spec already exists" prompt',
			);
			expect(planSection).toContain(
				'if archival fails: inform user of the failure and offer: retry archival, or proceed with option 2, or proceed with option 3',
			);
		});

		it('Option 2: Keep existing spec', () => {
			expect(planSection).toContain('Keep existing spec');
			expect(planSection).toContain('use spec.md as-is');
			expect(planSection).toContain('proceed with planning below');
		});

		it('Option 3: Skip spec entirely', () => {
			expect(planSection).toContain('Skip spec entirely');
			expect(planSection).toContain(
				'proceed to planning below ignoring the existing spec',
			);
		});

		it('STALE SPEC DETECTION offers exactly three options', () => {
			expect(planSection).toContain('offer three options');
			// Count option markers
			const optionMatches = planSection.match(/^\s*\d+\.\s*\*\*/gm);
			expect(optionMatches).toBeTruthy();
			// Should have exactly 3 numbered options in stale detection section
			const staleSectionStart = planSection.indexOf('STALE SPEC DETECTION');
			const staleSectionEnd = planSection.indexOf(
				'proceed with spec:',
				staleSectionStart,
			);
			const staleSection =
				staleSectionStart >= 0 && staleSectionEnd > staleSectionStart
					? planSection.slice(staleSectionStart, staleSectionEnd)
					: '';
			const optionMarkers = staleSection.match(/^\s*\d+\./gm);
			expect(optionMarkers).toBeTruthy();
			if (optionMarkers) {
				expect(optionMarkers.length).toBe(3);
			}
		});

		it('proceed normally sub-steps are properly indented', () => {
			expect(planSection).toContain('proceed with spec:');
			expect(planSection).toContain(
				'Read it and use it as the primary input for planning',
			);
			expect(planSection).toContain(
				'Cross-reference requirements (FR-###) when decomposing tasks',
			);
			expect(planSection).toContain(
				'Ensure every FR-### maps to at least one task',
			);
			expect(planSection).toContain('flag it as a potential gold-plating risk');
		});

		it('STALE SPEC DETECTION activates on heading mismatch (e.g., "user authentication" vs "payment integration")', () => {
			expect(planSection).toContain(
				'spec describes "user authentication" but user is asking to plan "payment integration"',
			);
			expect(planSection).toContain(
				'spec heading or feature description does NOT match',
			);
		});

		it('ADVERSARIAL: STALE SPEC DETECTION cannot be bypassed by removing NOTE', () => {
			// Attack vector: Removing the NOTE about heuristic detection would make the gate appear
			// strict when it's actually a soft gate
			expect(planSection).toContain(
				'NOTE: Stale detection is intentionally heuristic',
			);
			expect(planSection).toContain('false positives are acceptable');
		});

		it('ADVERSARIAL: STALE SPEC DETECTION preserves all three options', () => {
			// Attack vector: If options are removed, the architect would have no way to handle
			// stale specs other than always creating new ones or always keeping old ones
			expect(planSection).toContain('Archive and create new spec');
			expect(planSection).toContain('Keep existing spec');
			expect(planSection).toContain('Skip spec entirely');
		});

		it('ADVERSARIAL: STALE SPEC DETECTION maintains "proceed with spec" path', () => {
			// Attack vector: Removing the "proceed with spec" path would break planning when
			// the spec is actually current (not stale)
			expect(planSection).toContain('proceed with spec:');
			expect(planSection).toContain('If the spec appears current');
			expect(planSection).toContain('OR user chose option 2 above');
		});

		it('FIX VERIFICATION: Option 1 archival error handling mentions "archival fails"', () => {
			// Fix 1: The option 1 archival error handling now mentions "archival fails"
			expect(planSection).toContain('archival fails');
			expect(planSection).toContain('inform user of the failure');
		});

		it('FIX VERIFICATION: Option 3 "proceed without spec" branch has its own condition', () => {
			// Fix 2: The option 3 "proceed without spec" branch is now explicitly handled with its own condition
			expect(planSection).toContain(
				'If user chose option 3 above, proceed without spec',
			);
			expect(planSection).toContain(
				'skip all spec-based steps and proceed directly to planning',
			);
		});
	});
});

// ============================================
// Task 1.3: Spec Archival Instructions in MODE: SPECIFY
// ============================================

describe('Task 1.3 - Spec Archival Instructions in MODE: SPECIFY', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	// Find the MODE: SPECIFY section
	const specifyModeStart = prompt.indexOf('### MODE: SPECIFY');
	const specifyModeEnd = prompt.indexOf('### MODE: CLARIFY-SPEC');
	const specifyModeSection = prompt.slice(specifyModeStart, specifyModeEnd);

	describe('Archive path references .swarm/spec-archive/', () => {
		it('contains .swarm/spec-archive/ path', () => {
			expect(specifyModeSection).toContain('.swarm/spec-archive/');
		});

		it('mentions creating the archive directory', () => {
			expect(specifyModeSection).toContain(
				'create `.swarm/spec-archive/` directory',
			);
		});
	});

	describe('Version-based archive naming', () => {
		it('contains spec-v{version}.md pattern for version-based naming', () => {
			expect(specifyModeSection).toContain('spec-v{version}.md');
		});

		it('extracts version from spec heading patterns', () => {
			expect(specifyModeSection).toContain('v{semver}');
			expect(specifyModeSection).toContain('Version {semver}');
		});

		it('extracts version from package.json as fallback', () => {
			expect(specifyModeSection).toContain('package.json version');
		});

		it('specifies version extraction priority order', () => {
			expect(specifyModeSection).toContain('priority order');
		});
	});

	describe('Fallback date-based naming', () => {
		it('contains spec-{YYYY-MM-DD}.md pattern for date fallback', () => {
			expect(specifyModeSection).toContain('spec-{YYYY-MM-DD}.md');
		});

		it('states date fallback when version cannot be determined', () => {
			expect(specifyModeSection).toContain('if version cannot be determined');
		});
	});

	describe('Archive location logging', () => {
		it('mentions logging archive location to user', () => {
			expect(specifyModeSection).toContain(
				'log the archive location to the user',
			);
		});

		it('contains example log message', () => {
			expect(specifyModeSection).toContain(
				'Archived existing spec to .swarm/spec-archive/spec-v{version}.md',
			);
		});
	});

	describe('Bypass for stale spec archival path', () => {
		it('contains condition to skip archival check for stale spec path', () => {
			expect(specifyModeSection).toContain(
				'If this is called from the stale spec archival path',
			);
			expect(specifyModeSection).toContain('skip this check');
		});
	});

	describe('Archive FIRST instruction placement', () => {
		it('ARCHIVE FIRST instruction appears before generation (step 2)', () => {
			const archiveFirstPos = specifyModeSection.indexOf('ARCHIVE FIRST');
			const step2Pos = specifyModeSection.indexOf('2. Delegate to');
			expect(archiveFirstPos).toBeGreaterThan(-1);
			expect(step2Pos).toBeGreaterThan(-1);
			expect(archiveFirstPos).toBeLessThan(step2Pos);
		});
	});

	describe('ADVERSARIAL: Archive bypass protection', () => {
		it('bypass condition is specific to stale spec archival path only', () => {
			// The bypass should only apply when called from MODE: PLAN's stale spec archival path
			expect(specifyModeSection).toContain('MODE: PLAN option 1');
		});

		it('cannot bypass archival by removing archive check', () => {
			// The archive check must exist
			expect(specifyModeSection).toContain(
				'Check if `.swarm/spec.md` already exists',
			);
		});

		it('ARCHIVE FIRST is mandatory on overwrite path', () => {
			// The overwrite path MUST archive first
			expect(specifyModeSection).toContain('Overwrite → ARCHIVE FIRST');
		});
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

	it('Step 5.5 surfaces non-ALIGNED drift results as warning to user', () => {
		expect(phaseWrapSection).toContain('anything other than ALIGNED');
		expect(phaseWrapSection).toContain('MINOR_DRIFT');
		expect(phaseWrapSection).toContain('MAJOR_DRIFT');
		expect(phaseWrapSection).toContain('OFF_SPEC');
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

// ============================================
// Task 1.4: PLAN INGESTION DETECTION in MODE: PLAN SPEC GATE
// ============================================

describe('Task 1.4 - PLAN INGESTION DETECTION in MODE: PLAN SPEC GATE', () => {
	const agent = createArchitectAgent('test-model');
	const prompt = agent.config.prompt!;

	const planStart = prompt.indexOf('### MODE: PLAN');
	const planEnd = prompt.indexOf('### MODE: CRITIC-GATE', planStart);
	const planSection =
		planStart >= 0 && planEnd > planStart
			? prompt.slice(planStart, planEnd)
			: '';

	describe('Verification Tests', () => {
		it('PLAN INGESTION DETECTION text is present in MODE: PLAN', () => {
			expect(planSection).toContain('PLAN INGESTION DETECTION');
		});

		it('Soft gate language ("SOFT gate") is present', () => {
			expect(planSection).toContain('SOFT gate');
			expect(planSection).toMatch(/This is a SOFT gate/);
		});

		it('Plan ingestion phrases are listed (ingest this plan, implement this plan, etc.)', () => {
			expect(planSection).toContain('ingest this plan');
			expect(planSection).toContain('implement this plan');
			expect(planSection).toContain('prepare for implementation');
			expect(planSection).toContain('here is a plan');
			expect(planSection).toContain("here's the plan");
		});

		it('Two-option offer with spec generation is present', () => {
			expect(planSection).toContain('Generate spec from this plan first');
			expect(planSection).toContain(
				'enter EXTERNAL PLAN IMPORT PATH in MODE: SPECIFY',
			);
			expect(planSection).toContain(
				'reverse-engineer a spec.md from the provided plan',
			);
			expect(planSection).toContain('then return to planning');
		});

		it('Two-option offer with skip is present', () => {
			expect(planSection).toContain(
				'Skip spec and proceed with the provided plan',
			);
			expect(planSection).toContain(
				'proceed directly to plan ingestion and planning without creating a spec',
			);
		});

		it('Option 2 always lets the user proceed without a spec', () => {
			// Find the soft gate statement that confirms option 2 bypass
			const ingestionSection = planSection.slice(
				planSection.indexOf('PLAN INGESTION DETECTION'),
				planSection.indexOf('If no plan ingestion detected:'),
			);
			expect(ingestionSection).toContain(
				'option 2 always lets the user proceed without a spec',
			);
		});
	});

	describe('Adversarial Tests', () => {
		it('ADVERSARIAL: Bare "plan" word alone does not trigger detection', () => {
			// The phrase "plan" alone should NOT be in the trigger list
			const triggerSection = planSection.slice(
				planSection.indexOf('phrases like'),
				planSection.indexOf(')', planSection.indexOf('phrases like')),
			);
			// Verify "plan" as a standalone word is NOT in the trigger phrases
			const hasBarePlan = /"plan"/.test(triggerSection);
			const hasQuotedPlanWithContext =
				/"(ingest|implement|prepare for).*plan"/.test(triggerSection);

			// Should have context phrases, not bare "plan"
			expect(hasBarePlan).toBe(false);
			expect(hasQuotedPlanWithContext).toBe(true);
		});

		it('ADVERSARIAL: Option 2 explicitly allows bypass (cannot be gated)', () => {
			// Verify that option 2 explicitly says the user can proceed without creating a spec
			const ingestionSection = planSection.slice(
				planSection.indexOf('PLAN INGESTION DETECTION'),
				planSection.indexOf('If no plan ingestion detected:'),
			);

			// Must contain the explicit bypass language
			expect(ingestionSection).toContain(
				'proceed directly to plan ingestion and planning without creating a spec',
			);
			expect(ingestionSection).toContain(
				'option 2 always lets the user proceed without a spec',
			);

			// Must be in a soft gate context
			expect(ingestionSection).toMatch(/SOFT gate/);
		});

		it('ADVERSARIAL: Plan ingestion detection cannot be bypassed by removing the phrase list', () => {
			// All 5 phrases must be present
			const triggerStart = planSection.indexOf('phrases like');
			const triggerEnd = planSection.indexOf(')', triggerStart);
			const triggerSection = planSection.slice(triggerStart, triggerEnd);

			const requiredPhrases = [
				'ingest this plan',
				'implement this plan',
				'prepare for implementation',
				'here is a plan',
				"here's the plan",
			];

			for (const phrase of requiredPhrases) {
				expect(triggerSection).toContain(phrase);
			}
		});

		it('ADVERSARIAL: Spec generation path includes clear return-to-planning instruction', () => {
			// Verify that option 1 says "then return to planning" to ensure flow clarity
			const ingestionSection = planSection.slice(
				planSection.indexOf('PLAN INGESTION DETECTION'),
				planSection.indexOf('If no plan ingestion detected:'),
			);
			expect(ingestionSection).toContain('then return to planning');
		});
	});

	// ============================================
	// Phase 9: Task 15D - QA Gate Hardening & Anti-Exemption Rules
	// ============================================

	describe('Phase 9 Task 15D - QA Gate Hardening & Slash Commands', () => {
		const prompt = createArchitectAgent('test-model').config.prompt!;

		it('contains ## SLASH COMMANDS section with all available commands', () => {
			expect(prompt).toContain('## SLASH COMMANDS');
			expect(prompt).toContain('knowledge quarantine');
			expect(prompt).toContain('knowledge restore');
			expect(prompt).toContain('dark-matter');
			expect(prompt).toContain('/swarm');
		});

		it('contains POC/prototype anti-exemption rule', () => {
			expect(prompt).toContain(
				"It's just a schema change / config flag / one-liner / column / field / import",
			);
			expect(prompt).toContain('speed without QA gates is how bugs ship');
		});

		it('contains batch-QA-at-end anti-exemption rule', () => {
			expect(prompt).toContain('PARTIAL GATE RATIONALIZATIONS');
			expect(prompt).toContain('The QA gate is ALL steps or NONE.');
		});

		it('contains past-violation consistency anti-exemption rule', () => {
			expect(prompt).toContain(
				'past success does not predict future correctness',
			);
		});

		it('contains runtime enforcement hint in TIERED QA GATE section', () => {
			expect(prompt).toContain('enforced by runtime hooks');
			expect(prompt).toContain('BLOCKED by the plugin');
		});
	});
});
