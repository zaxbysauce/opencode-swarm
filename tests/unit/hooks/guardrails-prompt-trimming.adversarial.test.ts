import { beforeEach, describe, expect, it } from 'bun:test';
import type { GuardrailsConfig } from '../../../src/config/schema';
import { createGuardrailsHooks } from '../../../src/hooks/guardrails';
import { resetSwarmState } from '../../../src/state';

function defaultConfig(
	overrides?: Partial<GuardrailsConfig>,
): GuardrailsConfig {
	return {
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		idle_timeout_minutes: 60,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.75,
		profiles: undefined,
		...overrides,
	};
}

describe('ADVERSARIAL: guardrails prompt trimming security tests (Task 4.5)', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	// Helper to create a system message with BEHAVIORAL_GUIDANCE markers
	function makeSystemMessage(text: string) {
		return {
			info: { role: 'system' as const, sessionID: 'test-session' },
			parts: [{ type: 'text' as const, text }],
		};
	}

	// Helper to create an assistant message with modelID
	function makeAssistantMessage(modelID: string) {
		return {
			info: { role: 'assistant' as const, sessionID: 'test-session', modelID },
			parts: [{ type: 'text' as const, text: 'assistant response' }],
		};
	}

	describe('Attack Vector 1: Crafted modelID substring matching', () => {
		it('modelID containing "free" triggers trimming: gemini-pro-freestyle', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule to remove
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gemini-pro-freestyle'),
			];

			await hooks.messagesTransform({}, { messages });

			// Should NOT crash and should trim (substring match on 'free')
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
			expect(resultText).not.toContain('Rule to remove');
		});

		it('modelID containing "mini" triggers trimming: minimax', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule to remove
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('minimax'),
			];

			await hooks.messagesTransform({}, { messages });

			// Should NOT crash and should trim (substring match on 'mini')
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
		});

		it('modelID containing "small" triggers trimming: smallest-llm', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule to remove
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('smallest-llm'),
			];

			await hooks.messagesTransform({}, { messages });

			// Should NOT crash and should trim (substring match on 'small')
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
		});
	});

	describe('Attack Vector 2: Unclosed START marker (no END)', () => {
		it('START marker without END - no match, message preserved', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
This content should NOT be removed because there is no END marker
More content here
End of prompt`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			// The regex should NOT match (no END found), so original text preserved
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('<!-- BEHAVIORAL_GUIDANCE_START -->');
			expect(resultText).toContain('This content should NOT be removed');
			expect(resultText).not.toContain(
				'[Enforcement: programmatic gates active]',
			);
		});

		it('Multiple START markers without END - no matches', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
First block
<!-- BEHAVIORAL_GUIDANCE_START -->
Second block
<!-- BEHAVIORAL_GUIDANCE_START -->
Third block
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			// None should be replaced since no END markers
			expect(resultText).not.toContain(
				'[Enforcement: programmatic gates active]',
			);
			expect(resultText).toContain('First block');
			expect(resultText).toContain('Second block');
		});
	});

	describe('Attack Vector 3: Nested markers (non-greedy behavior)', () => {
		it('Nested markers - regex matches FIRST START to FIRST END (outer pair)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `Before
<!-- BEHAVIORAL_GUIDANCE_START -->
outer content
<!-- BEHAVIORAL_GUIDANCE_START -->
inner content
<!-- BEHAVIORAL_GUIDANCE_END -->
rest of outer
<!-- BEHAVIORAL_GUIDANCE_END -->
After`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;

			// The regex with non-greedy *? still matches from FIRST START to FIRST END
			// So it removes: outer content\n<!-- BEHAVIORAL_GUIDANCE_START --> inner content <!-- END -->
			// But leaves the outer END marker because it consumed up to the first END
			expect(resultText).toContain('Before');
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
			expect(resultText).toContain('rest of outer');
			expect(resultText).toContain('<!-- BEHAVIORAL_GUIDANCE_END -->'); // Second END remains
			expect(resultText).toContain('After');

			// Should have exactly 1 replacement
			const replacementCount = (
				resultText.match(/\[Enforcement: programmatic gates active\]/g) || []
			).length;
			expect(replacementCount).toBe(1);
		});

		it('Triple nested markers - matches first START to first END', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `Start
<!-- BEHAVIORAL_GUIDANCE_START -->
level 1
<!-- BEHAVIORAL_GUIDANCE_START -->
level 2
<!-- BEHAVIORAL_GUIDANCE_START -->
level 3 content
<!-- BEHAVIORAL_GUIDANCE_END -->
level 2 rest
<!-- BEHAVIORAL_GUIDANCE_END -->
level 1 rest
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;

			// Regex matches from first START to first END
			// So level 3 content is removed but level 2 and level 1 content remains
			expect(resultText).toContain('level 1');
			expect(resultText).toContain('level 2');
			expect(resultText).not.toContain('level 3 content');
			expect(resultText).toContain('level 2 rest');
			expect(resultText).toContain('level 1 rest');
			expect(resultText).toContain('End');

			const replacementCount = (
				resultText.match(/\[Enforcement: programmatic gates active\]/g) || []
			).length;
			expect(replacementCount).toBe(1);
		});
	});

	describe('Attack Vector 4: Malformed parts array', () => {
		it('parts contains null element - CRASHES (security bug: no null check)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				{
					info: { role: 'system' as const, sessionID: 'test-session' },
					parts: [{ type: 'text' as const, text: systemText }, null as any],
				},
				makeAssistantMessage('gpt-4o-mini'),
			];

			// FIXED: Code now gracefully handles null elements (no crash, no DoS vector)
			await expect(
				hooks.messagesTransform({}, { messages }),
			).resolves.toBeUndefined();
		});

		it('parts contains undefined element - gracefully skipped', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				{
					info: { role: 'system' as const, sessionID: 'test-session' },
					parts: [
						{ type: 'text' as const, text: systemText },
						undefined as any,
					],
				},
				makeAssistantMessage('gpt-4o-mini'),
			];

			// FIXED: Code now gracefully handles undefined elements (no crash)
			await expect(
				hooks.messagesTransform({}, { messages }),
			).resolves.toBeUndefined();
		});

		it('parts contains image part (non-text) - safely skipped', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				{
					info: { role: 'system' as const, sessionID: 'test-session' },
					parts: [
						{ type: 'text' as const, text: systemText },
						{ type: 'image' as const, data: 'fake-image-data' },
					],
				},
				makeAssistantMessage('gpt-4o-mini'),
			];

			// This is safe - non-text parts are correctly skipped
			await expect(
				hooks.messagesTransform({}, { messages }),
			).resolves.toBeUndefined();

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
		});

		it('parts contains part with missing type property - safely skipped', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				{
					info: { role: 'system' as const, sessionID: 'test-session' },
					parts: [
						{ type: 'text' as const, text: systemText },
						{ data: 'some-data' } as any, // missing 'type' property
					],
				},
				makeAssistantMessage('gpt-4o-mini'),
			];

			// Missing type is safely handled (type check fails)
			await expect(
				hooks.messagesTransform({}, { messages }),
			).resolves.toBeUndefined();

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
		});

		it('parts is an empty array - no crash', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const messages = [
				{
					info: { role: 'system' as const, sessionID: 'test-session' },
					parts: [],
				},
				makeAssistantMessage('gpt-4o-mini'),
			];

			await expect(
				hooks.messagesTransform({}, { messages }),
			).resolves.toBeUndefined();
		});
	});

	describe('Attack Vector 5: Empty string modelID', () => {
		it('Empty string modelID - no trim due to guard', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule to remove
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			// Empty string modelID - falsy, should NOT trigger trim
			const messages = [
				makeSystemMessage(systemText),
				{
					info: {
						role: 'assistant' as const,
						sessionID: 'test-session',
						modelID: '',
					},
					parts: [{ type: 'text' as const, text: 'response' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// The modelID && guard should prevent trimming
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('<!-- BEHAVIORAL_GUIDANCE_START -->');
			expect(resultText).toContain('Rule to remove');
			expect(resultText).not.toContain(
				'[Enforcement: programmatic gates active]',
			);
		});

		it('Whitespace-only modelID - no trim (falsy)', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
<!-- BEHAVIORAL_GUIDANCE_START -->
Rule to remove
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				{
					info: {
						role: 'assistant' as const,
						sessionID: 'test-session',
						modelID: '   ',
					},
					parts: [{ type: 'text' as const, text: 'response' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			// Whitespace is truthy, but isLowCapabilityModel returns false for empty string
			// However, '   ' will still pass the && check, so it's about isLowCapabilityModel
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			// isLowCapabilityModel returns false for empty/undefined, but '   ' is truthy
			// Actually it will call isLowCapabilityModel('   ') which will do toLowerCase()
			// and check includes - no match, so should NOT trim
			expect(resultText).toContain('Rule to remove');
		});
	});

	describe('Attack Vector 6: Large system message (ReDoS prevention)', () => {
		it('100KB+ text with 100 marker pairs - no performance issue', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Generate 100KB+ text with 100 marker pairs
			const markerPair = `<!-- BEHAVIORAL_GUIDANCE_START -->
Rule content that should be removed
<!-- BEHAVIORAL_GUIDANCE_END -->
`;
			const padding = 'x'.repeat(900); // ~1KB per segment
			const systemText =
				'START' +
				Array(100)
					.fill(markerPair + padding)
					.join('') +
				'END';

			expect(systemText.length).toBeGreaterThan(100 * 1000); // Verify >100KB

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			// Should complete in reasonable time (no ReDoS)
			const startTime = Date.now();
			await hooks.messagesTransform({}, { messages });
			const duration = Date.now() - startTime;

			// Should complete in under 1 second (generous timeout)
			expect(duration).toBeLessThan(1000);

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;

			// All 100 markers should be replaced
			const replacementCount = (
				resultText.match(/\[Enforcement: programmatic gates active\]/g) || []
			).length;
			expect(replacementCount).toBe(100);

			// Start and end should be preserved
			expect(resultText).toContain('START');
			expect(resultText).toContain('END');
		}, 10000); // 10 second timeout for this test

		it('Pathological case: markers with huge content between them', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			// Single marker pair with 1MB of content inside
			const hugeContent = 'x'.repeat(1024 * 1024);
			const systemText = `START
<!-- BEHAVIORAL_GUIDANCE_START -->
${hugeContent}
<!-- BEHAVIORAL_GUIDANCE_END -->
END`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			const startTime = Date.now();
			await hooks.messagesTransform({}, { messages });
			const duration = Date.now() - startTime;

			// Should complete in reasonable time
			expect(duration).toBeLessThan(2000);

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
			expect(resultText).toContain('START');
			expect(resultText).toContain('END');
		}, 30000); // 30 second timeout for this heavy test
	});

	describe('Attack Vector 7: Adversarial marker injection', () => {
		it('Content between markers contains fake END marker - non-greedy stops at first END', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `Real start
<!-- BEHAVIORAL_GUIDANCE_START -->
Real content here
<!-- BEHAVIORAL_GUIDANCE_END --> fake end marker text
More real content
<!-- BEHAVIORAL_GUIDANCE_END -->
Real end`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;

			// Non-greedy should stop at FIRST <!-- BEHAVIORAL_GUIDANCE_END -->
			// So "fake end marker text" should remain, and second END should also remain
			expect(resultText).toContain('fake end marker text');
			expect(resultText).toContain('More real content');
			expect(resultText).toContain('Real end');

			// Only the first block should be replaced
			const replacementCount = (
				resultText.match(/\[Enforcement: programmatic gates active\]/g) || []
			).length;
			expect(replacementCount).toBe(1);
		});

		it('Multiple fake END markers between real markers', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `Start
<!-- BEHAVIORAL_GUIDANCE_START -->
content with <!-- BEHAVIORAL_GUIDANCE_END --> fake1 <!-- BEHAVIORAL_GUIDANCE_END --> fake2
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;

			// Should only match up to first END, leaving fake markers
			expect(resultText).toContain('fake1');
			expect(resultText).toContain('fake2');
			expect(resultText).toContain('End');

			const replacementCount = (
				resultText.match(/\[Enforcement: programmatic gates active\]/g) || []
			).length;
			expect(replacementCount).toBe(1);
		});

		it('START-like text in content - any text containing START triggers full replacement', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System prompt
Some text that says <!-- BEHAVIORAL_GUIDANCE_START --> in it
<!-- BEHAVIORAL_GUIDANCE_START -->
Real rule
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			// The implementation uses includes() to check for START marker
			// If found, it replaces ALL marker pairs in the text
			// So the fake START in the middle ALSO gets processed
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;

			// Both the fake START line AND the real markers are processed
			// The pre-check finds the substring, then regex replaces ALL pairs
			expect(resultText).not.toContain('Real rule');
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
			// Note: The line with fake START marker is NOT replaced because there's no matching END
		});
	});

	describe('Edge cases: boundary violations', () => {
		it('START and END adjacent with no content', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System
<!-- BEHAVIORAL_GUIDANCE_START --><!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			// Adjacent markers should be matched and replaced
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
		});

		it('Whitespace variations in markers - exact match required for pre-check', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System
<!--  BEHAVIORAL_GUIDANCE_START  -->
Rule
<!--   BEHAVIORAL_GUIDANCE_END   -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			// The regex allows whitespace around marker names,
			// BUT the pre-check uses includes('<!-- BEHAVIORAL_GUIDANCE_START -->')
			// which requires EXACT match. Extra whitespace won't trigger.
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			// Since exact match not found, markers are NOT replaced
			expect(resultText).toContain('<!--  BEHAVIORAL_GUIDANCE_START  -->');
			expect(resultText).toContain('Rule'); // Not removed
		});

		it('Case variation in markers', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System
<!-- behavioral_guidance_start -->
Rule
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			// Regex uses literal case, so lowercase START won't match
			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('<!-- behavioral_guidance_start -->');
			expect(resultText).toContain('Rule'); // Not removed
		});
	});

	describe('Security: No code execution / injection via marker content', () => {
		it('Marker content with script-like text is safely removed', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System
<!-- BEHAVIORAL_GUIDANCE_START -->
<script>alert('xss')</script>
rm -rf /
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			// Content should be replaced, not executed
			expect(resultText).not.toContain('<script>');
			expect(resultText).not.toContain('rm -rf');
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
		});

		it('Unicode content in markers is safely handled', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System
<!-- BEHAVIORAL_GUIDANCE_START -->
Unicode: 你好 🌍 emoji
Special: ñ, ü, é
<!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [
				makeSystemMessage(systemText),
				makeAssistantMessage('gpt-4o-mini'),
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (
				messages[0].parts[0] as { type: string; text: string }
			).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
			expect(resultText).not.toContain('你好');
		});
	});
});
