import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'bun:test';

// Test: Verify ROLE-RELEVANCE TAGGING blocks in all agent files
describe('ROLE-RELEVANCE TAGGING Block Verification', () => {
  const agentFiles = [
    'architect.ts',
    'designer.ts',
    'docs.ts',
    'test-engineer.ts',
    'explorer.ts',
    'sme.ts',
    'reviewer.ts',
    'critic.ts',
    'coder.ts',
  ];

  const agentsPath = join(__dirname, '../src/agents');

  agentFiles.forEach((agentFile) => {
    it(`should have ROLE-RELEVANCE TAGGING block in ${agentFile}`, () => {
      const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
      expect(content).toContain('ROLE-RELEVANCE TAGGING');
    });

    it(`should have exactly 3 examples in ${agentFile}`, () => {
      const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
      const examples = content.match(/\[FOR:.*?\].*?"/g);
      expect(examples).toBeDefined();
      expect(examples?.length).toBe(3);
    });

    it(`should have v6.19/v6.20 note in ${agentFile}`, () => {
      const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
      expect(content).toContain('v6.19');
      expect(content).toContain('v6.20');
      expect(content).toContain('informational');
      expect(content).toContain('context filtering');
    });

    it(`should have token budget ≤80 for each example in ${agentFile}`, () => {
      const content = readFileSync(join(agentsPath, agentFile), 'utf-8');
      const examples = content.match(/\[FOR:.*?\].*?"/g);

      expect(examples).toBeDefined();
      examples?.forEach((example) => {
        // Rough token estimation (4 chars per token average)
        const tokenEstimate = Math.ceil(example.length / 4);
        expect(tokenEstimate).toBeLessThanOrEqual(80);
      });
    });

    it(`should have the three standard examples in ${agentFile}`, () => {
      const content = readFileSync(join(agentsPath, agentFile), 'utf-8');

      expect(content).toContain('[FOR: reviewer, test_engineer]');
      expect(content).toContain('[FOR: architect]');
      expect(content).toContain('[FOR: ALL]');
      expect(content).toContain('Added validation — needs safety check');
      expect(content).toContain('Research: Tree-sitter supports TypeScript AST');
      expect(content).toContain('Breaking change: StateManager renamed');
    });
  });

  it('should have exactly 9 agent files checked', () => {
    expect(agentFiles.length).toBe(9);
  });
});
