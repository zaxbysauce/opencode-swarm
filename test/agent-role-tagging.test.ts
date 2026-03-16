import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'bun:test';

// Test: Verify stale ROLE-RELEVANCE TAGGING blocks are absent from agent files
describe('ROLE-RELEVANCE TAGGING removal', () => {
  const agentFiles = {
    'architect.ts': join(__dirname, '../packages/opencode/src/agents/architect.ts'),
    'designer.ts': join(__dirname, '../packages/core/src/agents/designer.ts'),
    'docs.ts': join(__dirname, '../packages/core/src/agents/docs.ts'),
    'test-engineer.ts': join(__dirname, '../packages/core/src/agents/test-engineer.ts'),
    'explorer.ts': join(__dirname, '../packages/core/src/agents/explorer.ts'),
    'sme.ts': join(__dirname, '../packages/core/src/agents/sme.ts'),
    'reviewer.ts': join(__dirname, '../packages/core/src/agents/reviewer.ts'),
    'critic.ts': join(__dirname, '../packages/core/src/agents/critic.ts'),
    'coder.ts': join(__dirname, '../packages/core/src/agents/coder.ts'),
  };

  Object.entries(agentFiles).forEach(([agentFile, agentPath]) => {
    it(`should not have ROLE-RELEVANCE TAGGING block in ${agentFile}`, () => {
      const content = readFileSync(agentPath, 'utf-8');
      expect(content).not.toContain('ROLE-RELEVANCE TAGGING');
    });

    it(`should not have stale tag examples in ${agentFile}`, () => {
      const content = readFileSync(agentPath, 'utf-8');
      const examples = content.match(/\[FOR:.*?\].*?"/g);
      expect(examples).toBeNull();
    });

    it(`should not have v6.19/v6.20 role-filtering note in ${agentFile}`, () => {
      const content = readFileSync(agentPath, 'utf-8');
      expect(content).not.toContain('v6.20 will use for context filtering');
      expect(content).not.toContain('informational in v6.19');
    });

    it(`should not have stale role-target prefixes in ${agentFile}`, () => {
      const content = readFileSync(agentPath, 'utf-8');
      expect(content).not.toContain('[FOR: reviewer, test_engineer]');
      expect(content).not.toContain('[FOR: architect]');
      expect(content).not.toContain('[FOR: ALL]');
    });

    it(`should not have the standard tagging example strings in ${agentFile}`, () => {
      const content = readFileSync(agentPath, 'utf-8');

      expect(content).not.toContain('Added validation — needs safety check');
      expect(content).not.toContain('Research: Tree-sitter supports TypeScript AST');
      expect(content).not.toContain('Breaking change: StateManager renamed');
    });
  });

  it('should have exactly 9 agent files checked', () => {
    expect(Object.keys(agentFiles)).toHaveLength(9);
  });
});
