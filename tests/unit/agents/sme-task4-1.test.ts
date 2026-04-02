/**
 * Tests for SME agent (Subject Matter Expert)
 * Verifies Task 4.1 requirements:
 * 1. Confidence levels HIGH/MEDIUM/LOW
 * 2. Staleness awareness
 * 3. Scope boundary
 * 4. Platform awareness
 * 5. Verbosity control
 * 6. Token budget ≤500
 */

import { describe, expect, it } from 'bun:test';
import { createSMEAgent } from '../../../src/agents/sme';

describe('SME Agent - Task 4.1 Verification', () => {
	describe('Requirement 1: Confidence levels HIGH/MEDIUM/LOW', () => {
		it('SME prompt includes confidence level instructions', () => {
			const agent = createSMEAgent('gpt-4');

			// Check that the prompt contains the confidence level section
			expect(agent.config.prompt).toContain('CONFIDENCE');
			expect(agent.config.prompt).toContain('HIGH');
			expect(agent.config.prompt).toContain('MEDIUM');
			expect(agent.config.prompt).toContain('LOW');

			// Verify the specific confidence definitions
			expect(agent.config.prompt).toContain('verified from multiple sources');
			expect(agent.config.prompt).toContain('single authoritative source');
			expect(agent.config.prompt).toContain(
				'inferred or from community sources',
			);
		});

		it('SME prompt requires confidence in OUTPUT FORMAT', () => {
			const agent = createSMEAgent('gpt-4');

			// Check that output format includes confidence field
			expect(agent.config.prompt).toContain('CONFIDENCE: HIGH | MEDIUM | LOW');
		});
	});

	describe('Requirement 2: Staleness awareness', () => {
		it('SME prompt includes staleness awareness instructions', () => {
			const agent = createSMEAgent('gpt-4');

			// Check that the prompt contains staleness awareness section
			expect(agent.config.prompt).toContain('STALENESS AWARENESS');
			expect(agent.config.prompt).toContain('cachedAt');
			expect(agent.config.prompt).toContain('TTL');
			expect(agent.config.prompt).toContain('STALE_RISK');
		});

		it('SME prompt explains how to check for staleness', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify the staleness check logic is described
			expect(agent.config.prompt).toContain(
				'check cachedAt timestamp against TTL',
			);
			expect(agent.config.prompt).toContain('If approaching TTL');
		});
	});

	describe('Requirement 3: Scope boundary', () => {
		it('SME prompt includes scope boundary definition', () => {
			const agent = createSMEAgent('gpt-4');

			// Check that the prompt contains scope boundary section
			expect(agent.config.prompt).toContain('SCOPE BOUNDARY');
		});

		it('SME prompt clearly states what SME does NOT do', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify the scope boundary is clear
			expect(agent.config.prompt).toContain(
				'You MAY recommend domain-specific approaches, APIs, constraints, and trade-offs',
			);
			expect(agent.config.prompt).toContain(
				'do NOT make final architecture decisions',
			);
			expect(agent.config.prompt).toContain('choose product scope');
			expect(agent.config.prompt).toContain("Architect's and Coder's domains");
		});

		it('SME prompt states what SME DOES do', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify the primary function is clear
			expect(agent.config.prompt).toContain('You research and report');
		});
	});

	describe('Requirement 4: Platform awareness', () => {
		it('SME prompt includes platform awareness instructions', () => {
			const agent = createSMEAgent('gpt-4');

			// Check that the prompt contains platform awareness section
			expect(agent.config.prompt).toContain('PLATFORM AWARENESS');
		});

		it('SME prompt lists specific areas requiring platform verification', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify specific OS-interaction patterns are mentioned
			expect(agent.config.prompt).toContain('file system operations');
			expect(agent.config.prompt).toContain('Node.js APIs');
			expect(agent.config.prompt).toContain('path handling');
			expect(agent.config.prompt).toContain('process management');

			// Verify cross-platform requirement
			expect(agent.config.prompt).toContain('Windows, macOS, Linux');
			expect(agent.config.prompt).toContain('cross-platform compatibility');
		});

		it('SME prompt provides concrete example of platform difference', () => {
			const agent = createSMEAgent('gpt-4');

			// Check for the fs.renameSync example
			expect(agent.config.prompt).toContain('fs.renameSync');
			expect(agent.config.prompt).toContain(
				'cannot atomically overwrite existing directories on Windows',
			);
		});

		it('SME prompt includes PLATFORM field in OUTPUT FORMAT', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify output format has platform field
			expect(agent.config.prompt).toContain(
				'PLATFORM: [cross-platform notes if OS-interaction APIs]',
			);
		});
	});

	describe('Requirement 5: Verbosity control', () => {
		it('SME prompt includes verbosity control instructions', () => {
			const agent = createSMEAgent('gpt-4');

			// Check that the prompt contains verbosity control section
			expect(agent.config.prompt).toContain('VERBOSITY CONTROL');
		});

		it('SME prompt provides specific guidance for different scenarios', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify the verbosity guidelines
			expect(agent.config.prompt).toContain(
				'HIGH confidence on simple lookup = 1-2 lines',
			);
			expect(agent.config.prompt).toContain(
				'LOW confidence on ambiguous topic = full reasoning with sources',
			);
		});

		it('SME prompt warns against padding HIGH-confidence answers', () => {
			const agent = createSMEAgent('gpt-4');

			// Check the guidance against hedging
			expect(agent.config.prompt).toContain(
				'Do not pad HIGH-confidence answers with hedging language',
			);
		});

		it('SME prompt includes concise rule', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify the concise rule exists
			expect(agent.config.prompt).toContain('under 1500 characters');
		});
	});

	describe('Requirement 6: Token budget', () => {
		it('SME prompt enforces brevity limits', () => {
			const agent = createSMEAgent('gpt-4');

			// Check for character/token limits
			expect(agent.config.prompt).toContain('under 1500 characters');
			expect(agent.config.prompt).toContain('Be concise');
		});

		it('SME prompt has token budget rule in RULES section', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify the prompt exists
			expect(agent.config.prompt).toBeDefined();

			// Verify the concise rule is in the RULES section
			const rulesSectionMatch = agent.config.prompt?.match(
				/## RULES[\s\S]*?(?=\n##|$)/,
			);
			expect(rulesSectionMatch).toBeTruthy();

			if (rulesSectionMatch) {
				expect(rulesSectionMatch[0]).toContain('Be concise');
				expect(rulesSectionMatch[0]).toContain('under 1500 characters');
			}
		});
	});

	describe('Agent configuration', () => {
		it('createSMEAgent returns correct agent name', () => {
			const agent = createSMEAgent('gpt-4');
			expect(agent.name).toBe('sme');
		});

		it('createSMEAgent has appropriate description', () => {
			const agent = createSMEAgent('gpt-4');
			expect(agent.description).toContain('subject matter expert');
			expect(agent.description).toContain('deep technical guidance');
		});

		it('SME agent has low temperature for consistent responses', () => {
			const agent = createSMEAgent('gpt-4');
			expect(agent.config.temperature).toBe(0.2);
		});

		it('SME agent disables write tools (read-only)', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify write tools are disabled
			expect(agent.config.tools?.write).toBe(false);
			expect(agent.config.tools?.edit).toBe(false);
			expect(agent.config.tools?.patch).toBe(false);
		});

		it('createSMEAgent uses provided model', () => {
			const agent = createSMEAgent('claude-3-opus');
			expect(agent.config.model).toBe('claude-3-opus');
		});
	});

	describe('Custom prompt support', () => {
		it('createSMEAgent can override prompt completely', () => {
			const customPrompt = '## CUSTOM\nThis is a custom prompt';
			const agent = createSMEAgent('gpt-4', customPrompt);

			expect(agent.config.prompt).toBe(customPrompt);
		});

		it('createSMEAgent can append to default prompt', () => {
			const customAppend = '\n## CUSTOM\nThis is appended';
			const agent = createSMEAgent('gpt-4', undefined, customAppend);

			expect(agent.config.prompt).toContain('IDENTITY');
			expect(agent.config.prompt).toContain('CONFIDENCE');
			expect(agent.config.prompt).toContain('STALENESS AWARENESS');
			expect(agent.config.prompt).toContain('This is appended');
		});

		it('createSMEAgent uses default prompt when no customizations provided', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify all key sections are present
			expect(agent.config.prompt).toContain('IDENTITY');
			expect(agent.config.prompt).toContain('CONFIDENCE');
			expect(agent.config.prompt).toContain('STALENESS AWARENESS');
			expect(agent.config.prompt).toContain('SCOPE BOUNDARY');
			expect(agent.config.prompt).toContain('PLATFORM AWARENESS');
			expect(agent.config.prompt).toContain('VERBOSITY CONTROL');
		});
	});

	describe('OUTPUT FORMAT verification', () => {
		it('SME prompt includes all required output fields', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify all output format fields are present
			expect(agent.config.prompt).toContain('CONFIDENCE:');
			expect(agent.config.prompt).toContain('CRITICAL:');
			expect(agent.config.prompt).toContain('APPROACH:');
			expect(agent.config.prompt).toContain('API:');
			expect(agent.config.prompt).toContain('PLATFORM:');
			expect(agent.config.prompt).toContain('GOTCHAS:');
			expect(agent.config.prompt).toContain('DEPS:');
		});
	});

	describe('Research caching', () => {
		it('SME prompt includes research caching instructions', () => {
			const agent = createSMEAgent('gpt-4');

			// Check for research caching section
			expect(agent.config.prompt).toContain('RESEARCH CACHING');
		});

		it('SME prompt explains cache lookup process', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify cache lookup logic
			expect(agent.config.prompt).toContain('.swarm/context.md');
			expect(agent.config.prompt).toContain('## Research Sources');
		});

		it('SME prompt handles cache hit, miss, and bypass scenarios', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify all cache scenarios are covered
			expect(agent.config.prompt).toContain('## Research Sources');
			expect(agent.config.prompt).toContain(
				'If URL/topic IS listed in ## Research Sources',
			);
			expect(agent.config.prompt).toContain('If cache miss');
			expect(agent.config.prompt).toContain('Cache bypass');
		});

		it('SME prompt specifies read-only nature for cache', () => {
			const agent = createSMEAgent('gpt-4');

			// Verify cache persistence responsibility
			expect(agent.config.prompt).toContain('SME is read-only');
			expect(agent.config.prompt).toContain('Cache persistence is Architect');
		});
	});
});
