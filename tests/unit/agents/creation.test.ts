import { describe, test, expect } from 'bun:test';
import {
	createArchitectAgent,
	createCoderAgent,
	createExplorerAgent,
	createSMEAgent,
	createReviewerAgent,
	createCriticAgent,
	createTestEngineerAgent,
} from '../../../src/agents';

describe('Agent Creation Functions', () => {
	const testModel = 'test-model';

	describe('createArchitectAgent', () => {
		const agent = createArchitectAgent(testModel);

		test('returns correct agent definition structure', () => {
			expect(agent).toHaveProperty('name', 'architect');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
		});

		test('has correct model', () => {
			expect(agent.config.model).toBe(testModel);
		});

		test('has correct temperature', () => {
			expect(agent.config.temperature).toBe(0.1);
		});

		test('has non-empty description', () => {
			expect(typeof agent.description).toBe('string');
			expect(agent.description?.length).toBeGreaterThan(0);
		});

		test('has non-empty prompt', () => {
			expect(typeof agent.config.prompt).toBe('string');
			expect(agent.config.prompt?.length).toBeGreaterThan(0);
		});

		test('prompt contains required placeholders', () => {
			const prompt = agent.config.prompt || '';
			expect(prompt).toContain('{{SWARM_ID}}');
			expect(prompt).toContain('{{AGENT_PREFIX}}');
			expect(prompt).toContain('{{QA_RETRY_LIMIT}}');
		});

		test('has no tool restrictions', () => {
			expect(agent.config.tools).toBeUndefined();
		});

		test('handles custom prompt correctly', () => {
			const customPrompt = 'custom prompt';
			const agentWithCustom = createArchitectAgent(testModel, customPrompt);
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
		});

		test('handles append prompt correctly', () => {
			const appendPrompt = 'additional prompt';
			const agentWithAppend = createArchitectAgent(testModel, undefined, appendPrompt);
			expect(agentWithAppend.config.prompt).toEndWith(appendPrompt);
		});

		test('custom prompt takes precedence over append prompt', () => {
			const custom = 'custom';
			const append = 'append';
			const agentWithBoth = createArchitectAgent(testModel, custom, append);
			expect(agentWithBoth.config.prompt).toBe(custom);
		});
	});

	describe('createCoderAgent', () => {
		const agent = createCoderAgent(testModel);

		test('returns correct agent definition structure', () => {
			expect(agent).toHaveProperty('name', 'coder');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
		});

		test('has correct model', () => {
			expect(agent.config.model).toBe(testModel);
		});

		test('has correct temperature', () => {
			expect(agent.config.temperature).toBe(0.2);
		});

		test('has non-empty description', () => {
			expect(typeof agent.description).toBe('string');
			expect(agent.description?.length).toBeGreaterThan(0);
		});

		test('has non-empty prompt', () => {
			expect(typeof agent.config.prompt).toBe('string');
			expect(agent.config.prompt?.length).toBeGreaterThan(0);
		});

		test('has no tool restrictions', () => {
			expect(agent.config.tools).toBeUndefined();
		});

		test('handles custom prompt correctly', () => {
			const customPrompt = 'custom prompt';
			const agentWithCustom = createCoderAgent(testModel, customPrompt);
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
		});

		test('handles append prompt correctly', () => {
			const appendPrompt = 'additional prompt';
			const agentWithAppend = createCoderAgent(testModel, undefined, appendPrompt);
			expect(agentWithAppend.config.prompt).toEndWith(appendPrompt);
		});

		test('custom prompt takes precedence over append prompt', () => {
			const custom = 'custom';
			const append = 'append';
			const agentWithBoth = createCoderAgent(testModel, custom, append);
			expect(agentWithBoth.config.prompt).toBe(custom);
		});
	});

	describe('createExplorerAgent', () => {
		const agent = createExplorerAgent(testModel);

		test('returns correct agent definition structure', () => {
			expect(agent).toHaveProperty('name', 'explorer');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
		});

		test('has correct model', () => {
			expect(agent.config.model).toBe(testModel);
		});

		test('has correct temperature', () => {
			expect(agent.config.temperature).toBe(0.1);
		});

		test('has non-empty description', () => {
			expect(typeof agent.description).toBe('string');
			expect(agent.description?.length).toBeGreaterThan(0);
		});

		test('has non-empty prompt', () => {
			expect(typeof agent.config.prompt).toBe('string');
			expect(agent.config.prompt?.length).toBeGreaterThan(0);
		});

		test('is read-only with tools restrictions', () => {
			expect(agent.config.tools).toBeDefined();
			expect(agent.config.tools?.write).toBe(false);
			expect(agent.config.tools?.edit).toBe(false);
			expect(agent.config.tools?.patch).toBe(false);
		});

		test('handles custom prompt correctly', () => {
			const customPrompt = 'custom prompt';
			const agentWithCustom = createExplorerAgent(testModel, customPrompt);
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
		});

		test('handles append prompt correctly', () => {
			const appendPrompt = 'additional prompt';
			const agentWithAppend = createExplorerAgent(testModel, undefined, appendPrompt);
			expect(agentWithAppend.config.prompt).toEndWith(appendPrompt);
		});

		test('custom prompt takes precedence over append prompt', () => {
			const custom = 'custom';
			const append = 'append';
			const agentWithBoth = createExplorerAgent(testModel, custom, append);
			expect(agentWithBoth.config.prompt).toBe(custom);
		});
	});

	describe('createSMEAgent', () => {
		const agent = createSMEAgent(testModel);

		test('returns correct agent definition structure', () => {
			expect(agent).toHaveProperty('name', 'sme');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
		});

		test('has correct model', () => {
			expect(agent.config.model).toBe(testModel);
		});

		test('has correct temperature', () => {
			expect(agent.config.temperature).toBe(0.2);
		});

		test('has non-empty description', () => {
			expect(typeof agent.description).toBe('string');
			expect(agent.description?.length).toBeGreaterThan(0);
		});

		test('has non-empty prompt', () => {
			expect(typeof agent.config.prompt).toBe('string');
			expect(agent.config.prompt?.length).toBeGreaterThan(0);
		});

		test('is read-only with tools restrictions', () => {
			expect(agent.config.tools).toBeDefined();
			expect(agent.config.tools?.write).toBe(false);
			expect(agent.config.tools?.edit).toBe(false);
			expect(agent.config.tools?.patch).toBe(false);
		});

		test('handles custom prompt correctly', () => {
			const customPrompt = 'custom prompt';
			const agentWithCustom = createSMEAgent(testModel, customPrompt);
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
		});

		test('handles append prompt correctly', () => {
			const appendPrompt = 'additional prompt';
			const agentWithAppend = createSMEAgent(testModel, undefined, appendPrompt);
			expect(agentWithAppend.config.prompt).toEndWith(appendPrompt);
		});

		test('custom prompt takes precedence over append prompt', () => {
			const custom = 'custom';
			const append = 'append';
			const agentWithBoth = createSMEAgent(testModel, custom, append);
			expect(agentWithBoth.config.prompt).toBe(custom);
		});
	});

	describe('createReviewerAgent', () => {
		const agent = createReviewerAgent(testModel);

		test('returns correct agent definition structure', () => {
			expect(agent).toHaveProperty('name', 'reviewer');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
		});

		test('has correct model', () => {
			expect(agent.config.model).toBe(testModel);
		});

		test('has correct temperature', () => {
			expect(agent.config.temperature).toBe(0.1);
		});

		test('has non-empty description', () => {
			expect(typeof agent.description).toBe('string');
			expect(agent.description?.length).toBeGreaterThan(0);
		});

		test('has non-empty prompt', () => {
			expect(typeof agent.config.prompt).toBe('string');
			expect(agent.config.prompt?.length).toBeGreaterThan(0);
		});

		test('is read-only with tools restrictions', () => {
			expect(agent.config.tools).toBeDefined();
			expect(agent.config.tools?.write).toBe(false);
			expect(agent.config.tools?.edit).toBe(false);
			expect(agent.config.tools?.patch).toBe(false);
		});

		test('handles custom prompt correctly', () => {
			const customPrompt = 'custom prompt';
			const agentWithCustom = createReviewerAgent(testModel, customPrompt);
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
		});

		test('handles append prompt correctly', () => {
			const appendPrompt = 'additional prompt';
			const agentWithAppend = createReviewerAgent(testModel, undefined, appendPrompt);
			expect(agentWithAppend.config.prompt).toEndWith(appendPrompt);
		});

		test('custom prompt takes precedence over append prompt', () => {
			const custom = 'custom';
			const append = 'append';
			const agentWithBoth = createReviewerAgent(testModel, custom, append);
			expect(agentWithBoth.config.prompt).toBe(custom);
		});
	});

	describe('createCriticAgent', () => {
		const agent = createCriticAgent(testModel);

		test('returns correct agent definition structure', () => {
			expect(agent).toHaveProperty('name', 'critic');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
		});

		test('has correct model', () => {
			expect(agent.config.model).toBe(testModel);
		});

		test('has correct temperature', () => {
			expect(agent.config.temperature).toBe(0.1);
		});

		test('has non-empty description', () => {
			expect(typeof agent.description).toBe('string');
			expect(agent.description?.length).toBeGreaterThan(0);
		});

		test('has non-empty prompt', () => {
			expect(typeof agent.config.prompt).toBe('string');
			expect(agent.config.prompt?.length).toBeGreaterThan(0);
		});

		test('is read-only with tools restrictions', () => {
			expect(agent.config.tools).toBeDefined();
			expect(agent.config.tools?.write).toBe(false);
			expect(agent.config.tools?.edit).toBe(false);
			expect(agent.config.tools?.patch).toBe(false);
		});

		test('handles custom prompt correctly', () => {
			const customPrompt = 'custom prompt';
			const agentWithCustom = createCriticAgent(testModel, customPrompt);
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
		});

		test('handles append prompt correctly', () => {
			const appendPrompt = 'additional prompt';
			const agentWithAppend = createCriticAgent(testModel, undefined, appendPrompt);
			expect(agentWithAppend.config.prompt).toEndWith(appendPrompt);
		});

		test('custom prompt takes precedence over append prompt', () => {
			const custom = 'custom';
			const append = 'append';
			const agentWithBoth = createCriticAgent(testModel, custom, append);
			expect(agentWithBoth.config.prompt).toBe(custom);
		});
	});

	describe('createTestEngineerAgent', () => {
		const agent = createTestEngineerAgent(testModel);

		test('returns correct agent definition structure', () => {
			expect(agent).toHaveProperty('name', 'test_engineer');
			expect(agent).toHaveProperty('description');
			expect(agent).toHaveProperty('config');
		});

		test('has correct model', () => {
			expect(agent.config.model).toBe(testModel);
		});

		test('has correct temperature', () => {
			expect(agent.config.temperature).toBe(0.2);
		});

		test('has non-empty description', () => {
			expect(typeof agent.description).toBe('string');
			expect(agent.description?.length).toBeGreaterThan(0);
		});

		test('has non-empty prompt', () => {
			expect(typeof agent.config.prompt).toBe('string');
			expect(agent.config.prompt?.length).toBeGreaterThan(0);
		});

		test('has no tool restrictions', () => {
			expect(agent.config.tools).toBeUndefined();
		});

		test('handles custom prompt correctly', () => {
			const customPrompt = 'custom prompt';
			const agentWithCustom = createTestEngineerAgent(testModel, customPrompt);
			expect(agentWithCustom.config.prompt).toBe(customPrompt);
		});

		test('handles append prompt correctly', () => {
			const appendPrompt = 'additional prompt';
			const agentWithAppend = createTestEngineerAgent(testModel, undefined, appendPrompt);
			expect(agentWithAppend.config.prompt).toEndWith(appendPrompt);
		});

		test('custom prompt takes precedence over append prompt', () => {
			const custom = 'custom';
			const append = 'append';
			const agentWithBoth = createTestEngineerAgent(testModel, custom, append);
			expect(agentWithBoth.config.prompt).toBe(custom);
		});
	});
});