import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { handleRetrieveCommand } from '../../../src/commands/retrieve';
import { storeSummary } from '../../../src/summaries/manager';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('handleRetrieveCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `retrieve-test-${Date.now()}`);
    mkdirSync(join(tempDir, '.swarm'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('no arguments returns help/usage text', async () => {
    const result = await handleRetrieveCommand(tempDir, []);

    expect(result).toContain('## Swarm Retrieve');
    expect(result).toContain('/swarm retrieve <id>');
    expect(result).toContain('Example: `/swarm retrieve S1`');
  });

  it('valid ID with stored summary returns full original output', async () => {
    // First, store a summary using storeSummary
    await storeSummary(
      tempDir,
      'S1',
      'the full original output content here',
      'summary text',
      10485760,
    );

    // Then retrieve it
    const result = await handleRetrieveCommand(tempDir, ['S1']);

    expect(result).toBe('the full original output content here');
  });

  it('valid ID but file not found returns not-found message', async () => {
    const result = await handleRetrieveCommand(tempDir, ['S99']);

    expect(result).toContain('## Summary Not Found');
    expect(result).toContain('S99');
  });

  it('invalid/malformed ID returns error message', async () => {
    const result = await handleRetrieveCommand(tempDir, ['../evil']);

    expect(result).toContain('## Retrieve Failed');
  });
});
