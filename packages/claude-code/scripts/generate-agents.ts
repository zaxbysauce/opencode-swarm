#!/usr/bin/env bun
/**
 * Generate Claude Code agent definition files from core agent definitions.
 * Run: bun run packages/claude-code/scripts/generate-agents.ts
 *
 * This script reads the core AgentDefinition objects and generates
 * packages/claude-code/agents/*.md files with correct YAML frontmatter.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	model: string;
	color: string;
	prompt: string;
}

const AGENTS_DIR = path.join(import.meta.dir, '..', 'agents');

// Agent configurations derived from core definitions
const AGENT_CONFIGS: AgentConfig[] = [
	{
		name: 'swarm-architect',
		description:
			'Orchestrates the swarm — plans tasks, delegates to specialists, runs QA gates.',
		tools: [
			'Read',
			'Glob',
			'Grep',
			'Bash',
			'Task',
			'mcp__opencode-swarm__save_plan',
			'mcp__opencode-swarm__update_task_status',
		],
		model: 'claude-sonnet-4-6',
		color: '#FF6B6B',
		prompt:
			'See packages/claude-code/agents/swarm-architect.md for full prompt.',
	},
	{
		name: 'swarm-coder',
		description:
			'Implements code changes — reads files, writes code, follows specifications exactly.',
		tools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Bash'],
		model: 'claude-sonnet-4-6',
		color: '#4ECDC4',
		prompt: 'See packages/claude-code/agents/swarm-coder.md for full prompt.',
	},
	{
		name: 'swarm-reviewer',
		description:
			'Reviews code for correctness, security, and quality. Returns APPROVED or REJECTED.',
		tools: ['Read', 'Glob', 'Grep'],
		model: 'claude-sonnet-4-6',
		color: '#45B7D1',
		prompt:
			'See packages/claude-code/agents/swarm-reviewer.md for full prompt.',
	},
	{
		name: 'swarm-test-engineer',
		description: 'Generates and runs tests. Returns PASS or FAIL with details.',
		tools: ['Read', 'Write', 'Glob', 'Grep', 'Bash'],
		model: 'claude-sonnet-4-6',
		color: '#96CEB4',
		prompt:
			'See packages/claude-code/agents/swarm-test-engineer.md for full prompt.',
	},
	{
		name: 'swarm-critic',
		description:
			'Reviews implementation plans for completeness, feasibility, and scope.',
		tools: ['Read', 'Glob', 'Grep'],
		model: 'claude-sonnet-4-6',
		color: '#FFEAA7',
		prompt: 'See packages/claude-code/agents/swarm-critic.md for full prompt.',
	},
	{
		name: 'swarm-explorer',
		description:
			'Analyzes codebases — maps structure, identifies patterns, finds relevant files.',
		tools: ['Read', 'Glob', 'Grep', 'Bash'],
		model: 'claude-sonnet-4-6',
		color: '#DDA0DD',
		prompt:
			'See packages/claude-code/agents/swarm-explorer.md for full prompt.',
	},
	{
		name: 'swarm-sme',
		description: 'Provides domain expertise on any technical topic.',
		tools: ['Read', 'Glob', 'Grep'],
		model: 'claude-sonnet-4-6',
		color: '#98D8C8',
		prompt: 'See packages/claude-code/agents/swarm-sme.md for full prompt.',
	},
	{
		name: 'swarm-docs',
		description: 'Updates documentation — README, API docs, changelogs.',
		tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
		model: 'claude-sonnet-4-6',
		color: '#F7DC6F',
		prompt: 'See packages/claude-code/agents/swarm-docs.md for full prompt.',
	},
	{
		name: 'swarm-designer',
		description: 'Creates UI/UX scaffolds for new components and pages.',
		tools: ['Read', 'Write', 'Glob', 'Grep'],
		model: 'claude-sonnet-4-6',
		color: '#BB8FCE',
		prompt:
			'See packages/claude-code/agents/swarm-designer.md for full prompt.',
	},
];

function generateFrontmatter(agent: AgentConfig): string {
	const toolsList = agent.tools.map((t) => `  - ${t}`).join('\n');
	return `---
name: ${agent.name}
description: ${agent.description}
tools:
${toolsList}
model: ${agent.model}
color: "${agent.color}"
---`;
}

// Ensure agents directory exists
mkdirSync(AGENTS_DIR, { recursive: true });

// Generate each agent file
for (const agent of AGENT_CONFIGS) {
	const frontmatter = generateFrontmatter(agent);
	const content = `${frontmatter}\n\n${agent.prompt}\n`;
	const filePath = path.join(AGENTS_DIR, `${agent.name}.md`);
	writeFileSync(filePath, content, 'utf-8');
	console.log(`Generated: ${agent.name}.md`);
}

console.log(`\nGenerated ${AGENT_CONFIGS.length} agent files in ${AGENTS_DIR}`);
