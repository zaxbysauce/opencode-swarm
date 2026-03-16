import { describe, it, expect, beforeEach } from 'bun:test';
import { createGuardrailsHooks } from '../../src/hooks/guardrails';
import { resetSwarmState } from '../../src/state';
import type { GuardrailsConfig } from '../../src/config/schema';

function defaultConfig(overrides?: Partial<GuardrailsConfig>): GuardrailsConfig {
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

	function makeSystemMessage(text: string) {
		return {
			info: { role: 'system' as const, sessionID: 'test-session' },
			parts: [{ type: 'text' as const, text }],
		};
	}

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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gemini-pro-freestyle')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('minimax')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
			expect(resultText).toContain('<!-- BEHAVIORAL_GUIDANCE_START -->');
			expect(resultText).toContain('This content should NOT be removed');
			expect(resultText).not.toContain('[Enforcement: programmatic gates active]');
		});
	});

	describe('Attack Vector 3: Nested markers (non-greedy behavior)', () => {
		it('Nested markers - regex matches FIRST START to FIRST END', async () => {
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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
			
			expect(resultText).toContain('Before');
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
			expect(resultText).toContain('rest of outer');
			expect(resultText).toContain('<!-- BEHAVIORAL_GUIDANCE_END -->');
			expect(resultText).toContain('After');
			
			const replacementCount = (resultText.match(/\[Enforcement: programmatic gates active\]/g) || []).length;
			expect(replacementCount).toBe(1);
		});
	});

	describe('Attack Vector 4: Malformed parts array', () => {
		it('parts contains null element - gracefully handled', async () => {
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
						null as any,
					],
				},
				makeAssistantMessage('gpt-4o-mini'),
			];

			await expect(hooks.messagesTransform({}, { messages })).resolves.toBeUndefined();
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

			await expect(hooks.messagesTransform({}, { messages })).resolves.toBeUndefined();
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

			await expect(hooks.messagesTransform({}, { messages })).resolves.toBeUndefined();
			
			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
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

			await expect(hooks.messagesTransform({}, { messages })).resolves.toBeUndefined();
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

			const messages = [
				makeSystemMessage(systemText),
				{
					info: { role: 'assistant' as const, sessionID: 'test-session', modelID: '' },
					parts: [{ type: 'text' as const, text: 'response' }],
				},
			];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
			expect(resultText).toContain('<!-- BEHAVIORAL_GUIDANCE_START -->');
			expect(resultText).toContain('Rule to remove');
			expect(resultText).not.toContain('[Enforcement: programmatic gates active]');
		});
	});

	describe('Attack Vector 6: Large system message (ReDoS prevention)', () => {
		it('100KB+ text with 100 marker pairs - no performance issue', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const markerPair = `<!-- BEHAVIORAL_GUIDANCE_START -->
Rule content that should be removed
<!-- BEHAVIORAL_GUIDANCE_END -->
`;
			const padding = 'x'.repeat(900);
			const systemText = 'START' + Array(100).fill(markerPair + padding).join('') + 'END';

			expect(systemText.length).toBeGreaterThan(100 * 1000);

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			const startTime = Date.now();
			await hooks.messagesTransform({}, { messages });
			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(1000);

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
			
			const replacementCount = (resultText.match(/\[Enforcement: programmatic gates active\]/g) || []).length;
			expect(replacementCount).toBe(100);
			
			expect(resultText).toContain('START');
			expect(resultText).toContain('END');
		}, 10000);
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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
			
			expect(resultText).toContain('fake end marker text');
			expect(resultText).toContain('More real content');
			expect(resultText).toContain('Real end');
			
			const replacementCount = (resultText.match(/\[Enforcement: programmatic gates active\]/g) || []).length;
			expect(replacementCount).toBe(1);
		});
	});

	describe('Edge cases: boundary violations', () => {
		it('START and END adjacent with no content', async () => {
			const config = defaultConfig();
			const hooks = createGuardrailsHooks(config);

			const systemText = `System
<!-- BEHAVIORAL_GUIDANCE_START --><!-- BEHAVIORAL_GUIDANCE_END -->
End`;

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
			expect(resultText).toContain('<!--  BEHAVIORAL_GUIDANCE_START  -->');
			expect(resultText).toContain('Rule');
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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
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

			const messages = [makeSystemMessage(systemText), makeAssistantMessage('gpt-4o-mini')];

			await hooks.messagesTransform({}, { messages });

			const resultText = (messages[0].parts[0] as { type: string; text: string }).text;
			expect(resultText).toContain('[Enforcement: programmatic gates active]');
			expect(resultText).not.toContain('你好');
		});
	});
});
