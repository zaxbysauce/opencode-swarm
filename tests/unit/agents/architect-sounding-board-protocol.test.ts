import { beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('src/agents/architect.ts - SOUNDING BOARD PROTOCOL (Task 1.1)', () => {
	const ARCHITECT_FILE = join(process.cwd(), 'src', 'agents', 'architect.ts');

	let architectContent: string;

	beforeEach(() => {
		architectContent = readFileSync(ARCHITECT_FILE, 'utf-8');
	});

	describe('1. SOUNDING BOARD PROTOCOL block exists', () => {
		it('should contain the SOUNDING BOARD PROTOCOL header', () => {
			const hasProtocolBlock = architectContent.includes(
				'SOUNDING BOARD PROTOCOL',
			);
			expect(hasProtocolBlock).toBe(true);
		});

		it('should have the protocol section starting with "6a. **SOUNDING BOARD PROTOCOL**"', () => {
			const hasFullHeader = architectContent.includes(
				'6a. **SOUNDING BOARD PROTOCOL**',
			);
			expect(hasFullHeader).toBe(true);
		});
	});

	describe('2. Four verdict types are present', () => {
		it('should contain UNNECESSARY verdict', () => {
			expect(architectContent).toContain('UNNECESSARY');
			expect(architectContent).toMatch(
				/UNNECESSARY:\s*You already have enough context/i,
			);
		});

		it('should contain REPHRASE verdict', () => {
			expect(architectContent).toContain('REPHRASE');
			expect(architectContent).toMatch(
				/REPHRASE:\s*The question is valid but poorly formed/i,
			);
		});

		it('should contain APPROVED verdict', () => {
			expect(architectContent).toContain('APPROVED');
			expect(architectContent).toMatch(
				/APPROVED:\s*The question is necessary and well-formed/i,
			);
		});

		it('should contain RESOLVE verdict', () => {
			expect(architectContent).toContain('RESOLVE');
			expect(architectContent).toMatch(
				/RESOLVE:\s*Critic can answer the question directly/i,
			);
		});
	});

	describe('3. Anti-exemption clause is present', () => {
		it('should contain the anti-exemption statement', () => {
			const antiExemptionPatterns = [
				'You may NOT skip sounding board consultation',
				'"It\'s a simple question" is not an exemption',
			];

			for (const pattern of antiExemptionPatterns) {
				expect(architectContent).toContain(pattern);
			}
		});
	});

	describe('4. Triggers are listed', () => {
		it('should contain triggers section with specific scenarios', () => {
			const triggerKeywords = [
				'logic loops',
				'3+ attempts',
				'ambiguous requirements',
				'scope uncertainty',
				'dependency questions',
				'architecture decisions',
				'>2 viable paths',
			];

			for (const keyword of triggerKeywords) {
				expect(architectContent).toContain(keyword);
			}
		});

		it('should have the Triggers: header', () => {
			expect(architectContent).toMatch(/Triggers:/i);
		});
	});

	describe('5. JSONL event types are mentioned', () => {
		it('should mention sounding_board_consulted event', () => {
			expect(architectContent).toContain('sounding_board_consulted');
			expect(architectContent).toMatch(
				/JSONL event 'sounding_board_consulted'/,
			);
		});

		it('should mention architect_loop_detected event', () => {
			expect(architectContent).toContain('architect_loop_detected');
			expect(architectContent).toMatch(/JSONL event 'architect_loop_detected'/);
		});

		it('should have Emit JSONL event statements', () => {
			expect(architectContent).toMatch(/Emit JSONL event/);
		});
	});

	describe('6. Token budget check (≤150 tokens)', () => {
		it('should have the protocol section within reasonable token budget', () => {
			// Extract the SOUNDING BOARD PROTOCOL section
			const protocolStartMatch = architectContent.match(
				/6a\. \*\*SOUNDING BOARD PROTOCOL\*\*/,
			);
			expect(protocolStartMatch).toBeTruthy();

			const protocolStartIndex = architectContent.indexOf(
				protocolStartMatch![0],
			);
			// Find the end of the protocol section (6a ends at 6b; 6b-6f are separate sub-sections)
			const afterProtocol = architectContent.slice(protocolStartIndex);
			const nextSubsectionMatch = afterProtocol.match(/\n\s*6b\. \*\*/);
			const nextSectionMatch = afterProtocol.match(/\n\s*7\. \*\*/);
			const endMatch = nextSubsectionMatch ?? nextSectionMatch;
			const protocolEndIndex = endMatch
				? protocolStartIndex + endMatch.index
				: architectContent.length;

			const protocolSection = architectContent
				.slice(protocolStartIndex, protocolEndIndex)
				.trim();

			// Count tokens (rough estimation: ~0.75 words per token, or character count / 4)
			// Using a simple word-based estimation
			const words = protocolSection.split(/\s+/).filter((w) => w.length > 0);
			// eslint-disable-next-line @typescript-eslint/no-magic-numbers
			const estimatedTokens = Math.ceil(words.length / 0.75);

			// The requirement is ≤150 tokens
			// Note: The actual section might be slightly over, but should be close
			expect(estimatedTokens).toBeLessThanOrEqual(150);
		});
	});

	describe('Complete protocol verification', () => {
		it('should have all required components together', () => {
			const requiredComponents = [
				'SOUNDING BOARD PROTOCOL',
				'UNNECESSARY',
				'REPHRASE',
				'APPROVED',
				'RESOLVE',
				'You may NOT skip sounding board consultation',
				'Triggers:',
				'logic loops',
				'sounding_board_consulted',
				'architect_loop_detected',
				'Emit JSONL event',
			];

			for (const component of requiredComponents) {
				expect(architectContent).toContain(component);
			}
		});
	});
});
