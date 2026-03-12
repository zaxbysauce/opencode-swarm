/**
 * Tests for v6.1 docs and designer agent creation functions
 */
import { describe, test, expect } from 'bun:test';
import { createDocsAgent, createDesignerAgent } from '../../../src/agents';

describe('createDocsAgent', () => {
	const testModel = 'google/gemini-2.0-flash';

	test('returns AgentDefinition with name "docs"', () => {
		const agent = createDocsAgent(testModel);
		expect(agent).toHaveProperty('name', 'docs');
	});

	test('has description containing "documentation"', () => {
		const agent = createDocsAgent(testModel);
		expect(agent.description?.toLowerCase()).toContain('documentation');
	});

	test('has temperature 0.2', () => {
		const agent = createDocsAgent(testModel);
		expect(agent.config.temperature).toBe(0.2);
	});

	test('has model "google/gemini-2.0-flash"', () => {
		const agent = createDocsAgent(testModel);
		expect(agent.config.model).toBe(testModel);
	});

	test('prompt contains "IDENTITY" and "SCOPE" and "WORKFLOW"', () => {
		const agent = createDocsAgent(testModel);
		const prompt = agent.config.prompt || '';
		expect(prompt).toContain('## IDENTITY');
		expect(prompt).toContain('SCOPE:');
		expect(prompt).toContain('WORKFLOW:');
	});

	test('customPrompt replaces base prompt entirely', () => {
		const customPrompt = 'Custom documentation prompt';
		const agent = createDocsAgent(testModel, customPrompt);
		expect(agent.config.prompt).toBe(customPrompt);
	});

	test('customAppendPrompt appends to base prompt', () => {
		const appendPrompt = 'Additional docs instructions';
		const agent = createDocsAgent(testModel, undefined, appendPrompt);
		expect(agent.config.prompt).toEndWith(appendPrompt);
		// Verify base prompt is still present
		expect(agent.config.prompt).toContain('## IDENTITY');
	});

	test('no customPrompt/appendPrompt uses base DOCS_PROMPT', () => {
		const agent = createDocsAgent(testModel);
		expect(agent.config.prompt).toContain('## IDENTITY');
		expect(agent.config.prompt).toContain('You are Docs');
	});

	test('custom prompt takes precedence over append prompt', () => {
		const custom = 'Custom only';
		const append = 'This should be ignored';
		const agent = createDocsAgent(testModel, custom, append);
		expect(agent.config.prompt).toBe(custom);
		expect(agent.config.prompt).not.toContain(append);
	});

	test('has no tools block (config.tools should be undefined)', () => {
		const agent = createDocsAgent(testModel);
		expect(agent.config.tools).toBeUndefined();
	});

	test('prompt starts with ## IDENTITY header', () => {
		const agent = createDocsAgent(testModel);
		expect(agent.config.prompt?.startsWith('## IDENTITY')).toBe(true);
	});

	test('contains anti-delegation directive', () => {
		const agent = createDocsAgent(testModel);
		const prompt = agent.config.prompt || '';
		expect(prompt).toContain('DO NOT use the Task tool to delegate to other agents');
	});

	test('contains identity reinforcement', () => {
		const agent = createDocsAgent(testModel);
		const prompt = agent.config.prompt || '';
		expect(prompt).toContain('You ARE the agent that does the work');
	});
});

describe('createDesignerAgent', () => {
	const testModel = 'google/gemini-2.0-flash';

	test('returns AgentDefinition with name "designer"', () => {
		const agent = createDesignerAgent(testModel);
		expect(agent).toHaveProperty('name', 'designer');
	});

	test('has description containing "UI" or "design"', () => {
		const agent = createDesignerAgent(testModel);
		const desc = agent.description?.toLowerCase() || '';
		expect(desc.includes('ui') || desc.includes('design')).toBe(true);
	});

	test('has temperature 0.3', () => {
		const agent = createDesignerAgent(testModel);
		expect(agent.config.temperature).toBe(0.3);
	});

	test('has model "google/gemini-2.0-flash"', () => {
		const agent = createDesignerAgent(testModel);
		expect(agent.config.model).toBe(testModel);
	});

	test('prompt contains "IDENTITY" and "DESIGN CHECKLIST" and "WCAG"', () => {
		const agent = createDesignerAgent(testModel);
		const prompt = agent.config.prompt || '';
		expect(prompt).toContain('## IDENTITY');
		expect(prompt).toContain('DESIGN CHECKLIST:');
		expect(prompt).toContain('WCAG');
	});

	test('customPrompt replaces base prompt entirely', () => {
		const customPrompt = 'Custom designer prompt';
		const agent = createDesignerAgent(testModel, customPrompt);
		expect(agent.config.prompt).toBe(customPrompt);
	});

	test('customAppendPrompt appends to base prompt', () => {
		const appendPrompt = 'Additional design instructions';
		const agent = createDesignerAgent(testModel, undefined, appendPrompt);
		expect(agent.config.prompt).toEndWith(appendPrompt);
		// Verify base prompt is still present
		expect(agent.config.prompt).toContain('## IDENTITY');
	});

	test('has no tools block (config.tools should be undefined)', () => {
		const agent = createDesignerAgent(testModel);
		expect(agent.config.tools).toBeUndefined();
	});

	test('prompt starts with ## IDENTITY header', () => {
		const agent = createDesignerAgent(testModel);
		expect(agent.config.prompt?.startsWith('## IDENTITY')).toBe(true);
	});

	test('contains anti-delegation directive', () => {
		const agent = createDesignerAgent(testModel);
		const prompt = agent.config.prompt || '';
		expect(prompt).toContain('DO NOT use the Task tool to delegate to other agents');
	});

	test('contains identity reinforcement', () => {
		const agent = createDesignerAgent(testModel);
		const prompt = agent.config.prompt || '';
		expect(prompt).toContain('You ARE the agent that does the work');
	});

	test('contains WCAG AA contrast requirements', () => {
		const agent = createDesignerAgent(testModel);
		const prompt = agent.config.prompt || '';
		expect(prompt).toContain('4.5:1');
	});
});
