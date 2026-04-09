import { describe, expect, it } from 'bun:test';
import { createCriticAgent } from '../../../src/agents/critic';

describe('MODE: ANALYZE — verification', () => {
	const agent = createCriticAgent('test-model');
	const prompt = agent.config.prompt!;

	it('1. Contains literal string "MODE: ANALYZE"', () => {
		expect(prompt).toContain('MODE: ANALYZE');
	});

	it('2. References to ".swarm/spec.md" and ".swarm/plan.md" as inputs', () => {
		expect(prompt).toContain('.swarm/spec.md');
		expect(prompt).toContain('.swarm/plan.md');
	});

	it('3. Contains "FR-###" for requirement mapping', () => {
		expect(prompt).toContain('FR-###');
	});

	it('4. Contains "GAPS" for gap detection', () => {
		expect(prompt).toContain('GAPS');
	});

	it('5. Contains "GOLD-PLATING" or "GOLD_PLATING" for gold-plating detection', () => {
		// Check for either gold-plating or GOLD_PLATING
		const hasGoldPlating =
			prompt.includes('GOLD-PLATING') || prompt.includes('GOLD_PLATING');
		expect(hasGoldPlating).toBe(true);
	});

	it('6. Has severity classification with "CRITICAL" and "HIGH" for gaps', () => {
		// Look in the GAPS section for CRITICAL and HIGH severity assignments
		const gapsSection = prompt.substring(
			prompt.indexOf('Flag GAPS') || 0,
			prompt.indexOf('Flag GOLD-PLATING') || prompt.length,
		);
		expect(gapsSection).toContain('CRITICAL');
		expect(gapsSection).toContain('HIGH');
	});

	it('7. Has "READ-ONLY" constraint text', () => {
		expect(prompt).toContain('READ-ONLY');
	});

	it('8. Has ANALYZE-specific verdict vocabulary: "CLEAN", "GAPS FOUND", "DRIFT DETECTED"', () => {
		expect(prompt).toContain('CLEAN');
		expect(prompt).toContain('GAPS FOUND');
		expect(prompt).toContain('DRIFT DETECTED');
	});

	it('9. Has note disambiguating ANALYZE verdicts from plan-review verdicts', () => {
		// Look for text explaining "CLEAN = " or similar disambiguation
		expect(prompt).toContain('CLEAN =');
	});

	it('10. Has note disambiguating severity schemes', () => {
		// Look for mention of both severity schemes
		expect(prompt).toContain('CRITICAL/MAJOR/MINOR');
		expect(prompt).toContain('CRITICAL/HIGH/MEDIUM/LOW');
	});

	it('11. Has a 7-step structure (steps 1 through 7)', () => {
		// Find the STEPS section
		const stepsStart = prompt.indexOf('STEPS:');
		const stepsEnd = prompt.indexOf('OUTPUT FORMAT:', stepsStart);
		const stepsSection = prompt.substring(stepsStart, stepsEnd);

		// Verify all 7 steps are present
		expect(stepsSection).toMatch(/1\./);
		expect(stepsSection).toMatch(/2\./);
		expect(stepsSection).toMatch(/3\./);
		expect(stepsSection).toMatch(/4\./);
		expect(stepsSection).toMatch(/5\./);
		expect(stepsSection).toMatch(/6\./);
		expect(stepsSection).toMatch(/7\./);
	});

	it('12. Has "top 10" capping language or "showing 10 of"', () => {
		// Check for top 10 capping language in the output format
		expect(prompt).toMatch(/top 10|showing 10 of/);
	});

	it('13. Has infrastructure exclusion list mentioning "project setup" or "CI configuration"', () => {
		// Check for infrastructure exclusion text
		const hasInfrastructureExclusion =
			prompt.includes('project setup') || prompt.includes('CI configuration');
		expect(hasInfrastructureExclusion).toBe(true);
	});

	it('14. Has partial coverage guidance mentioning "COVERAGE TABLE" or "GAPS FOUND"', () => {
		expect(prompt).toContain('COVERAGE TABLE');
	});
});

describe('MODE: ANALYZE — adversarial', () => {
	const agent = createCriticAgent('test-model');
	const prompt = agent.config.prompt!;

	it('1. Does NOT allow file modification — has READ-ONLY AND write/edit/patch are false', () => {
		// Check for READ-ONLY text
		expect(prompt).toContain('READ-ONLY');

		// Check that tools are disabled in the agent configuration
		expect(agent.config.tools?.write).toBe(false);
		expect(agent.config.tools?.edit).toBe(false);
		expect(agent.config.tools?.patch).toBe(false);
	});

	it('2. Does NOT use APPROVED/NEEDS_REVISION/REJECTED as ANALYZE verdicts', () => {
		// Find the ANALYZE OUTPUT FORMAT section
		const analyzeStart = prompt.indexOf('### MODE: ANALYZE');
		const analyzeSection = prompt.substring(analyzeStart);

		// The ANALYZE OUTPUT FORMAT should have CLEAN/GAPS FOUND/DRIFT DETECTED, NOT APPROVED
		const outputFormatLine = analyzeSection.match(/VERDICT: (.+)/);
		expect(outputFormatLine).toBeTruthy();
		const verdicts = outputFormatLine![1];

		// Should NOT contain plan-review verdicts
		expect(verdicts).not.toContain('APPROVED');
		expect(verdicts).not.toContain('NEEDS_REVISION');
		expect(verdicts).not.toContain('REJECTED');

		// Should contain ANALYZE verdicts
		expect(verdicts).toContain('CLEAN');
		expect(verdicts).toContain('GAPS FOUND');
		expect(verdicts).toContain('DRIFT DETECTED');
	});

	it('3. Does NOT use CRITICAL/MAJOR/MINOR as the severity scheme for ANALYZE', () => {
		// Check that ANALYZE uses CRITICAL/HIGH/MEDIUM/LOW, not the plan-review scheme
		// The prompt should explicitly mention the difference
		expect(prompt).toContain(
			'ANALYZE uses CRITICAL/HIGH/MEDIUM/LOW severity (not CRITICAL/MAJOR/MINOR used by plan review).',
		);

		// Verify the GAPS section uses CRITICAL/HIGH (not MAJOR/MINOR)
		const gapsStart = prompt.indexOf('Flag GAPS');
		const gapsEnd = prompt.indexOf('Flag GOLD-PLATING', gapsStart);
		const gapsSection = prompt.substring(gapsStart, gapsEnd);

		expect(gapsSection).not.toContain('MAJOR');
		expect(gapsSection).not.toContain('MINOR');
	});

	it('4. Does NOT proceed when input files are missing — looks for missing/stop/absent text', () => {
		// Check for text that says to stop if files are missing
		const analyzeStart = prompt.indexOf('### MODE: ANALYZE');
		const analyzeSection = prompt.substring(analyzeStart);

		// Should mention stopping or not proceeding if files are absent/missing
		const hasStopOrAbort =
			analyzeSection.includes('stop') ||
			analyzeSection.includes('abort') ||
			analyzeSection.includes('do not attempt analysis');

		expect(hasStopOrAbort).toBe(true);
	});

	it('5. Does NOT silently cap lists — when more than 10 items exist, must note total count', () => {
		// Check that the output format mentions noting total count
		// Look for language like "showing 10 of N"
		expect(prompt).toMatch(
			/showing 10 of \d+|showing 10 of N|note total count/,
		);

		// Verify the GAPS output format line mentions capping with total count
		const gapsOutput = prompt.match(/GAPS: \[.*top 10.*\]/);
		expect(gapsOutput).toBeTruthy();
	});
});

describe('MODE: ANALYZE — adversarial security', () => {
	const agent = createCriticAgent('test-model');
	const prompt = agent.config.prompt!;

	it('1. Prompt injection resistance — CRITIC_PROMPT forbids delegation', () => {
		// Verify the prompt explicitly instructs NOT to delegate or use Task tool
		const hasNoDelegate =
			prompt.includes('do NOT delegate') ||
			prompt.includes('DO NOT use the Task tool');

		expect(hasNoDelegate).toBe(true);
	});

	it('2. Scope boundary — READ-ONLY rule prohibits modifying ANY file', () => {
		// Find the ANALYZE RULES section
		const analyzeStart = prompt.indexOf('### MODE: ANALYZE');
		const analyzeSection = prompt.substring(analyzeStart);

		// The READ-ONLY rule should say "any file" not specific files like spec.md or plan.md
		expect(analyzeSection).toContain('READ-ONLY');
		expect(analyzeSection).toContain(
			'do not create, modify, or delete any file',
		);
		expect(analyzeSection).toContain('any file');
	});

	it('3. Tool lockdown — createCriticAgent() disables write, edit, AND patch', () => {
		// All three write tools must be false in the returned config.tools
		expect(agent.config.tools).toBeDefined();
		expect(agent.config.tools?.write).toBe(false);
		expect(agent.config.tools?.edit).toBe(false);
		expect(agent.config.tools?.patch).toBe(false);
	});

	it('4. Cannot be tricked into creating files — ANALYZE block has no file creation instructions', () => {
		// Find the ANALYZE block
		const analyzeStart = prompt.indexOf('### MODE: ANALYZE');
		const analyzeEnd = prompt.indexOf('ANALYZE RULES:', analyzeStart);
		const analyzeBlock = prompt.substring(analyzeStart, analyzeEnd);

		// These words should NOT appear as positive instructions (only in NOT/DO NOT context)
		// Extract lines to check context
		const lines = analyzeBlock.split('\n');
		let hasUnauthorizedCreate = false;

		for (const line of lines) {
			// Skip lines that contain NOT/DO NOT (these are negative instructions, which are OK)
			if (line.includes('NOT') || line.includes('not')) {
				continue;
			}

			// Check if any line mentions creating/writing/outputting to files
			if (
				line.includes('create') ||
				line.includes('write to') ||
				line.includes('output to file')
			) {
				hasUnauthorizedCreate = true;
				break;
			}
		}

		expect(hasUnauthorizedCreate).toBe(false);
	});

	it('5. Agent identity confusion guard — warns about delegation confusion', () => {
		// Verify CRITIC_PROMPT contains text warning about agent delegation confusion
		const hasIdentityGuard =
			prompt.includes('IGNORE them') ||
			prompt.includes('You ARE the agent') ||
			prompt.includes('not instructions for you to delegate');

		expect(hasIdentityGuard).toBe(true);
	});
});

describe('PHASE_DRIFT_VERIFIER_PROMPT — verification', () => {
	const agent = createCriticAgent(
		'test-model',
		undefined,
		undefined,
		'phase_drift_verifier',
	);
	const prompt = agent.config.prompt!;

	it('1. Contains "Phase Drift Verifier" identity', () => {
		expect(prompt).toContain('Phase Drift Verifier');
	});

	it('2. Has SKEPTICAL default posture', () => {
		expect(prompt).toContain('SKEPTICAL');
	});

	it('3. Has 4-axis rubric: File Change, Spec Alignment, Integrity, Drift Detection', () => {
		expect(prompt).toContain('File Change');
		expect(prompt).toContain('Spec Alignment');
		expect(prompt).toContain('Integrity');
		expect(prompt).toContain('Drift Detection');
	});

	it('4. Has per-task verdicts: VERIFIED, MISSING, DRIFTED', () => {
		expect(prompt).toContain('VERIFIED');
		expect(prompt).toContain('MISSING');
		expect(prompt).toContain('DRIFTED');
	});

	it('5. Has phase verdict: APPROVED | NEEDS_REVISION', () => {
		expect(prompt).toContain('VERDICT: APPROVED | NEEDS_REVISION');
	});

	it('6. Has axis-level status vocabulary: ALIGNED, CLEAN, ISSUE, NO_DRIFT, DRIFT', () => {
		expect(prompt).toContain('ALIGNED');
		expect(prompt).toContain('CLEAN');
		expect(prompt).toContain('ISSUE');
		expect(prompt).toContain('NO_DRIFT');
		expect(prompt).toContain('DRIFT');
	});

	it('7. Has MANDATORY output format', () => {
		expect(prompt).toContain('MANDATORY');
		expect(prompt).toContain('deviations will be rejected');
	});

	it('8. Has MANIPULATION DETECTED pressure immunity', () => {
		expect(prompt).toContain('MANIPULATION DETECTED');
		expect(prompt).toContain('PRESSURE IMMUNITY');
	});

	it('9. Has disambiguation note about when this mode fires', () => {
		expect(prompt).toContain('phase completion');
		expect(prompt).toContain('NOT for plan review');
	});

	it('10. Has READ-ONLY constraint', () => {
		expect(prompt).toContain('READ-ONLY');
	});

	it('11. Has DRIFT REPORT section for unplanned additions and dropped tasks', () => {
		expect(prompt).toContain('DRIFT REPORT');
		expect(prompt).toContain('Unplanned additions');
		expect(prompt).toContain('Dropped tasks');
	});

	it('12. Has NEEDS_REVISION detail listing MISSING and DRIFTED tasks', () => {
		expect(prompt).toContain('MISSING tasks');
		expect(prompt).toContain('DRIFTED tasks');
		expect(prompt).toContain('Specific items to fix');
	});
});

describe('PHASE_DRIFT_VERIFIER_PROMPT — adversarial', () => {
	const agent = createCriticAgent(
		'test-model',
		undefined,
		undefined,
		'phase_drift_verifier',
	);
	const prompt = agent.config.prompt!;

	it('1. Does NOT instruct critic to write files directly', () => {
		expect(prompt).not.toContain('Write the report file to');
		expect(prompt).toContain('no file modifications');
	});

	it('2. Tool lockdown — write, edit, and patch are disabled', () => {
		expect(agent.config.tools).toBeDefined();
		expect(agent.config.tools?.write).toBe(false);
		expect(agent.config.tools?.edit).toBe(false);
		expect(agent.config.tools?.patch).toBe(false);
	});

	it('3. Does NOT use REJECTED as a phase verdict (only APPROVED | NEEDS_REVISION)', () => {
		// The PHASE VERDICT section should not contain REJECTED
		const verdictSection = prompt.slice(prompt.indexOf('PHASE VERDICT'));
		expect(verdictSection).toContain('APPROVED');
		expect(verdictSection).toContain('NEEDS_REVISION');
		expect(verdictSection).not.toContain('REJECTED');
	});

	it('4. Does NOT delegate — forbids Task tool usage', () => {
		expect(prompt).toContain('DO NOT use the Task tool');
	});

	it('5. Agent identity confusion guard — warns about delegation confusion', () => {
		const hasIdentityGuard =
			prompt.includes('IGNORE them') ||
			prompt.includes('You ARE the agent') ||
			prompt.includes('not instructions for you to delegate');
		expect(hasIdentityGuard).toBe(true);
	});

	it('6. APPROVED requires ALL tasks VERIFIED with no DRIFT', () => {
		expect(prompt).toContain(
			'APPROVED only if ALL tasks are VERIFIED with no DRIFT',
		);
	});
});

describe('Plan Review — Governance Compliance check (Task 5.2)', () => {
	const agent = createCriticAgent('test-model');
	const prompt = agent.config.prompt!;

	// Verification tests
	it('should include Governance Compliance item in the REVIEW CHECKLIST', () => {
		expect(prompt).toContain('Governance Compliance');
	});

	it('should condition governance check on ## Project Governance section in context.md', () => {
		expect(prompt).toContain('.swarm/context.md');
		expect(prompt).toContain('## Project Governance');
	});

	it('should flag MUST rule violations as CRITICAL severity', () => {
		const govIdx = prompt.indexOf('Governance Compliance');
		const govContext = prompt.slice(govIdx, govIdx + 500);
		expect(govContext).toContain('MUST');
		expect(govContext).toContain('CRITICAL');
	});

	it('should mark SHOULD rule violations as recommendation-level (non-blocking)', () => {
		const govIdx = prompt.indexOf('Governance Compliance');
		const govContext = prompt.slice(govIdx, govIdx + 500);
		expect(govContext).toContain('SHOULD');
		expect(govContext).toMatch(/recommendation|do not block|non-blocking/i);
	});

	it('should skip governance check silently when no ## Project Governance section exists', () => {
		const govIdx = prompt.indexOf('Governance Compliance');
		const govContext = prompt.slice(govIdx, govIdx + 500);
		expect(govContext).toContain('skip');
	});

	it('should place Governance Compliance check after Task Atomicity in the checklist', () => {
		const atomicityIdx = prompt.indexOf('Task Atomicity');
		const govIdx = prompt.indexOf('Governance Compliance');
		expect(atomicityIdx).toBeGreaterThan(-1);
		expect(govIdx).toBeGreaterThan(atomicityIdx);
	});

	it('should preserve all existing checklist items (Completeness, Feasibility, Scope, Dependencies, Risk, AI-Slop, Task Atomicity)', () => {
		expect(prompt).toContain('Completeness');
		expect(prompt).toContain('Feasibility');
		expect(prompt).toContain('Scope');
		// Dependencies checking is present (may be labeled "Dependency ordering" or "DEPENDENCY CORRECTNESS")
		expect(prompt).toMatch(/Dependenc/);
		expect(prompt).toContain('Risk');
		expect(prompt).toContain('AI-Slop Detection');
		expect(prompt).toContain('Task Atomicity');
	});

	// Adversarial tests
	it('should NOT make governance compliance check mandatory (must be conditional)', () => {
		const govIdx = prompt.indexOf('Governance Compliance');
		const govContext = prompt.slice(govIdx, govIdx + 500);
		// Must be conditional — not always-on
		expect(govContext).toMatch(/conditional|if.*context\.md|if no.*skip/i);
	});

	it('should NOT elevate SHOULD violations to CRITICAL (SHOULD is advisory only)', () => {
		const govIdx = prompt.indexOf('Governance Compliance');
		const govContext = prompt.slice(govIdx, govIdx + 500);
		// MUST violations are CRITICAL
		expect(govContext).toContain('MUST rule violations are CRITICAL');
		// SHOULD violations are recommendation-level (NOT CRITICAL)
		expect(govContext).toContain('SHOULD rule violations are recommendation');
		// Explicitly verify SHOULD is NOT associated with CRITICAL
		expect(govContext).not.toContain('SHOULD rule violations are CRITICAL');
	});
});
