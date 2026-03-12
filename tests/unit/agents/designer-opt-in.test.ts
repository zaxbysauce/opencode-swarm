/**
 * Tests for v6.1 designer and docs agent opt-in behavior in createAgents()
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { createAgents } from '../../../src/agents/index';
import type { PluginConfig } from '../../../src/config';
import { resetSwarmState } from '../../../src/state';

describe('v6.1 Designer Opt-In Behavior', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	test('When no config → designer NOT in agents list', () => {
		const agents = createAgents();
		const names = agents.map((a) => a.name);
		expect(names).not.toContain('designer');
	});

	test('When ui_review.enabled=false → designer NOT in agents list', () => {
		const config: PluginConfig = {
			ui_review: {
				enabled: false,
			},
		} as PluginConfig;

		const agents = createAgents(config);
		const names = agents.map((a) => a.name);
		expect(names).not.toContain('designer');
	});

	test('When ui_review.enabled=true → designer IS in agents list', () => {
		const config: PluginConfig = {
			ui_review: {
				enabled: true,
			},
		} as PluginConfig;

		const agents = createAgents(config);
		const names = agents.map((a) => a.name);
		expect(names).toContain('designer');
	});

	test('When ui_review.enabled=true → docs IS also in agents list (enabled by default)', () => {
		const config: PluginConfig = {
			ui_review: {
				enabled: true,
			},
		} as PluginConfig;

		const agents = createAgents(config);
		const names = agents.map((a) => a.name);
		expect(names).toContain('docs');
	});

	test('docs IS in agents list when no config (default enabled)', () => {
		const agents = createAgents();
		const names = agents.map((a) => a.name);
		expect(names).toContain('docs');
	});

	test('docs NOT in agents list when explicitly disabled via agents.docs.disabled', () => {
		const config: PluginConfig = {
			agents: {
				docs: {
					disabled: true,
				},
			},
		} as PluginConfig;

		const agents = createAgents(config);
		const names = agents.map((a) => a.name);
		expect(names).not.toContain('docs');
	});

	test('designer NOT in agents list even when ui_review.enabled=true if explicitly disabled', () => {
		const config: PluginConfig = {
			ui_review: {
				enabled: true,
			},
			agents: {
				designer: {
					disabled: true,
				},
			},
		} as PluginConfig;

		const agents = createAgents(config);
		const names = agents.map((a) => a.name);
		expect(names).not.toContain('designer');
	});

	test('standard agents are always present when not disabled', () => {
		const agents = createAgents();
		const names = agents.map((a) => a.name);

		// Core agents that should always be present
		expect(names).toContain('architect');
		expect(names).toContain('explorer');
		expect(names).toContain('coder');
		expect(names).toContain('reviewer');
		expect(names).toContain('critic');
		expect(names).toContain('test_engineer');
		expect(names).toContain('sme');
	});
});
