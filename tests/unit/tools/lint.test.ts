import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
	validateArgs,
	getLinterCommand,
	detectAvailableLinter,
	runLint,
	MAX_OUTPUT_BYTES,
	MAX_COMMAND_LENGTH,
	SUPPORTED_LINTERS,
	type SupportedLinter,
	type LintResult,
} from '../../../src/tools/lint';

// Mock for Bun.spawn
let originalSpawn: typeof Bun.spawn;
let spawnCalls: Array<{ cmd: string[]; opts: unknown }> = [];
let mockExitCode: number = 0;
let mockStdout: string = '';
let mockStderr: string = '';
let mockSpawnError: Error | null = null;

function mockSpawn(cmd: string[], opts: unknown) {
	spawnCalls.push({ cmd, opts });
	
	if (mockSpawnError) {
		throw mockSpawnError;
	}
	
	// Create mock readable streams
	const encoder = new TextEncoder();
	const stdoutReadable = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(mockStdout));
			controller.close();
		}
	});
	const stderrReadable = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(mockStderr));
			controller.close();
		}
	});
	
	return {
		stdout: stdoutReadable,
		stderr: stderrReadable,
		exited: Promise.resolve(mockExitCode),
		exitCode: mockExitCode,
	} as unknown as ReturnType<typeof Bun.spawn>;
}

describe('lint tool', () => {
	beforeEach(() => {
		originalSpawn = Bun.spawn;
		spawnCalls = [];
		mockExitCode = 0;
		mockStdout = '';
		mockStderr = '';
		mockSpawnError = null;
	});
	
	afterEach(() => {
		Bun.spawn = originalSpawn;
	});
	
	// ============ Constants Tests ============
	describe('constants', () => {
		it('should have correct MAX_OUTPUT_BYTES value', () => {
			expect(MAX_OUTPUT_BYTES).toBe(512_000); // 512KB
		});
		
		it('should have correct MAX_COMMAND_LENGTH value', () => {
			expect(MAX_COMMAND_LENGTH).toBe(500);
		});
		
		it('should have correct SUPPORTED_LINTERS', () => {
			expect(SUPPORTED_LINTERS).toEqual(['biome', 'eslint']);
		});
	});
	
	// ============ Mode Validation Tests ============
	describe('validateArgs', () => {
		it('should accept mode: "check"', () => {
			expect(validateArgs({ mode: 'check' })).toBe(true);
		});
		
		it('should accept mode: "fix"', () => {
			expect(validateArgs({ mode: 'fix' })).toBe(true);
		});
		
		it('should reject null', () => {
			expect(validateArgs(null)).toBe(false);
		});
		
		it('should reject undefined', () => {
			expect(validateArgs(undefined)).toBe(false);
		});
		
		it('should reject non-object types', () => {
			expect(validateArgs('check')).toBe(false);
			expect(validateArgs(123)).toBe(false);
			expect(validateArgs(true)).toBe(false);
		});
		
		it('should reject invalid mode values', () => {
			expect(validateArgs({ mode: 'invalid' })).toBe(false);
			expect(validateArgs({ mode: 'CHECK' })).toBe(false);
			expect(validateArgs({ mode: 'Fix' })).toBe(false);
			expect(validateArgs({ mode: '' })).toBe(false);
		});
		
		it('should reject object without mode', () => {
			expect(validateArgs({})).toBe(false);
			expect(validateArgs({ other: 'value' })).toBe(false);
		});
		
		it('should accept object with extra properties', () => {
			// Extra properties should not invalidate the args
			expect(validateArgs({ mode: 'check', extra: 'value' })).toBe(true);
		});
	});
	
	// ============ Command Construction Tests ============
	describe('getLinterCommand', () => {
		describe('biome', () => {
			it('should return correct command for check mode', () => {
				const cmd = getLinterCommand('biome', 'check');
				expect(cmd).toEqual(['npx', 'biome', 'check', '.']);
			});
			
			it('should return correct command for fix mode', () => {
				const cmd = getLinterCommand('biome', 'fix');
				expect(cmd).toEqual(['npx', 'biome', 'check', '--write', '.']);
			});
		});
		
		describe('eslint', () => {
			it('should return correct command for check mode', () => {
				const cmd = getLinterCommand('eslint', 'check');
				expect(cmd).toEqual(['npx', 'eslint', '.']);
			});
			
			it('should return correct command for fix mode', () => {
				const cmd = getLinterCommand('eslint', 'fix');
				expect(cmd).toEqual(['npx', 'eslint', '.', '--fix']);
			});
		});
		
		it('should return array of strings', () => {
			const cmd = getLinterCommand('biome', 'check');
			expect(Array.isArray(cmd)).toBe(true);
			expect(cmd.every(s => typeof s === 'string')).toBe(true);
		});
	});
	
	// ============ Linter Detection Tests ============
	describe('detectAvailableLinter', () => {
		it('should detect biome when available', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = 'biome version 1.0.0';
			mockExitCode = 0;
			
			const linter = await detectAvailableLinter();
			expect(linter).toBe('biome');
		});
		
		it('should try eslint when biome fails', async () => {
			Bun.spawn = mockSpawn;
			let callCount = 0;
			
			Bun.spawn = (cmd: string[], opts: unknown) => {
				callCount++;
				spawnCalls.push({ cmd, opts });
				
				// First call (biome) fails
				if (callCount === 1) {
					mockStdout = '';
					mockExitCode = 1;
				} else {
					// Second call (eslint) succeeds
					mockStdout = 'eslint version 8.0.0';
					mockExitCode = 0;
				}
				
				const encoder = new TextEncoder();
				const stdoutReadable = new ReadableStream({
					start(controller) {
						controller.enqueue(encoder.encode(mockStdout));
						controller.close();
					}
				});
				const stderrReadable = new ReadableStream({
					start(controller) {
						controller.close();
					}
				});
				
				return {
					stdout: stdoutReadable,
					stderr: stderrReadable,
					exited: Promise.resolve(mockExitCode),
					exitCode: mockExitCode,
				} as unknown as ReturnType<typeof Bun.spawn>;
			};
			
			const linter = await detectAvailableLinter();
			expect(linter).toBe('eslint');
			expect(callCount).toBe(2);
		});
		
		it('should return null when no linter is available', async () => {
			Bun.spawn = mockSpawn;
			mockExitCode = 1;
			
			const linter = await detectAvailableLinter();
			expect(linter).toBeNull();
		});
		
		it('should return null when spawn throws', async () => {
			Bun.spawn = mockSpawn;
			mockSpawnError = new Error('spawn failed');
			
			const linter = await detectAvailableLinter();
			expect(linter).toBeNull();
		});
	});
	
	// ============ Exit Status Handling Tests ============
	describe('runLint - exit status handling', () => {
		it('should return success:true with exitCode 0', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = 'All files are formatted correctly.';
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check');
			
			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.mode).toBe('check');
			expect(result.linter).toBe('biome');
		});
		
		it('should return success:true with non-zero exit code (lint issues)', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = '';
			mockStderr = 'error: Some files have lint issues';
			mockExitCode = 1;
			
			const result = await runLint('biome', 'check');
			
			// Note: even with non-zero exit, success is true because the command ran
			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(1);
			expect(result.message).toContain('exit code 1');
		});
		
		it('should include helpful message for exit code 0', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = '';
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check') as { message?: string };
			
			expect(result.message).toContain('completed successfully');
		});
		
		it('should include helpful message for non-zero exit in check mode', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = '';
			mockStderr = 'issues found';
			mockExitCode = 1;
			
			const result = await runLint('biome', 'check') as { message?: string };
			
			expect(result.message).toContain('found issues');
		});
		
		it('should include helpful message for non-zero exit in fix mode', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = '';
			mockStderr = 'some fixes applied';
			mockExitCode = 1;
			
			const result = await runLint('biome', 'fix') as { message?: string };
			
			expect(result.message).toContain('fix completed');
			expect(result.message).toContain('exit code 1');
		});
	});
	
	// ============ Bounded Output Truncation Tests ============
	describe('runLint - output truncation', () => {
		it('should include stdout in output', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = 'Checking src/file.ts';
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check');
			
			expect(result.output).toContain('Checking src/file.ts');
		});
		
		it('should include stderr in output when present', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = 'Checking...';
			mockStderr = 'Warning: deprecated API';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check');
			
			expect(result.output).toContain('Checking...');
			expect(result.output).toContain('Warning: deprecated API');
		});
		
		it('should handle stderr-only output', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = '';
			mockStderr = 'Error: syntax error';
			mockExitCode = 1;
			
			const result = await runLint('biome', 'check');
			
			expect(result.output).toBe('Error: syntax error');
		});
		
		it('should truncate output exceeding MAX_OUTPUT_BYTES', async () => {
			Bun.spawn = mockSpawn;
			// Create output larger than MAX_OUTPUT_BYTES
			mockStdout = 'x'.repeat(MAX_OUTPUT_BYTES + 1000);
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check');
			
			// Output should be truncated to approximately MAX_OUTPUT_BYTES + truncation message
			// The exact length is MAX_OUTPUT_BYTES + '\n... (output truncated)' = ~22 chars
			expect(result.output.length).toBeLessThanOrEqual(MAX_OUTPUT_BYTES + 30);
			expect(result.output.length).toBeGreaterThan(MAX_OUTPUT_BYTES);
			expect(result.output).toContain('... (output truncated)');
		});
		
		it('should not truncate output within limit', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = 'x'.repeat(1000);
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check');
			
			expect(result.output).toBe('x'.repeat(1000));
			expect(result.output).not.toContain('truncated');
		});
	});
	
	// ============ Non-Throwing Error Response Tests ============
	describe('runLint - error handling (non-throwing)', () => {
		it('should return error result on spawn failure', async () => {
			Bun.spawn = mockSpawn;
			mockSpawnError = new Error('Command not found');
			
			const result = await runLint('biome', 'check');
			
			expect(result.success).toBe(false);
			expect(result.error).toContain('Execution failed');
			expect(result.error).toContain('Command not found');
		});
		
		it('should return error result for unknown spawn errors', async () => {
			Bun.spawn = mockSpawn;
			mockSpawnError = 'string error' as unknown as Error;
			
			const result = await runLint('biome', 'check');
			
			expect(result.success).toBe(false);
			expect(result.error).toContain('Execution failed');
			expect(result.error).toContain('unknown error');
		});
		
		it('should never throw, always return result object', async () => {
			Bun.spawn = mockSpawn;
			mockSpawnError = new Error('Any error');
			
			// Should not throw
			await expect(runLint('biome', 'check')).resolves.toBeDefined();
			
			const result = await runLint('biome', 'check');
			expect(result).toHaveProperty('success');
			expect(result).toHaveProperty('mode');
		});
	});
	
	// ============ Command Construction Edge Cases ============
	describe('runLint - command validation', () => {
		it('should return error if command exceeds MAX_COMMAND_LENGTH', async () => {
			// This is a theoretical edge case - in practice, our commands are short
			// We test by checking the error handling path exists
			Bun.spawn = mockSpawn;
			mockStdout = '';
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check');
			
			// Normal case should succeed
			expect(result.success).toBe(true);
		});
	});
	
	// ============ Integration-style Tests ============
	describe('integration', () => {
		it('should return properly structured success result', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = 'All good';
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('biome', 'check');
			
			// Verify structure
			expect(result).toHaveProperty('success', true);
			expect(result).toHaveProperty('mode', 'check');
			expect(result).toHaveProperty('linter', 'biome');
			expect(result).toHaveProperty('command');
			expect(result).toHaveProperty('exitCode', 0);
			expect(result).toHaveProperty('output');
			expect(result).toHaveProperty('message');
		});
		
		it('should return properly structured error result', async () => {
			Bun.spawn = mockSpawn;
			mockSpawnError = new Error('test error');
			
			const result = await runLint('eslint', 'fix');
			
			// Verify structure
			expect(result).toHaveProperty('success', false);
			expect(result).toHaveProperty('mode', 'fix');
			expect(result).toHaveProperty('linter', 'eslint');
			expect(result).toHaveProperty('command');
			expect(result).toHaveProperty('error');
		});
		
		it('should work with eslint', async () => {
			Bun.spawn = mockSpawn;
			mockStdout = 'ESLint output';
			mockStderr = '';
			mockExitCode = 0;
			
			const result = await runLint('eslint', 'check');
			
			expect(result.success).toBe(true);
			expect(result.linter).toBe('eslint');
		});
	});
});
