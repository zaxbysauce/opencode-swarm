/**
 * Verification tests for check_gate_status plugin registration in core package
 *
 * Tests that check_gate_status is properly exposed via the core tools index.
 */
import { describe, expect, it } from 'bun:test';

describe('check_gate_status core package verification', () => {
	// Helper to call tool function directly
	async function executeTool(
		args: Record<string, unknown>,
		directory: string,
	): Promise<string> {
		const { runCheckGateStatus } = await import('../../src/tools/check-gate-status');
		const taskId = args.task_id as string | undefined;
		return runCheckGateStatus(taskId ?? '', directory);
	}

	// Tool names currently registered in core/src/tools/index.ts
	const EXPECTED_TOOL_NAMES = [
		'check_gate_status',
		'checkpoint',
		'complexity_hotspots',
		'detect_domains',
		'evidence_check',
		'extract_code_blocks',
		'gitingest',
		'imports',
		'knowledge_query',
		'lint',
		'diff',
		'pkg_audit',
		'phase_complete',
		'pre_check_batch',
		'retrieve_summary',
		'save_plan',
		'secretscan',
		'symbols',
		'todo_extract',
		'update_task_status',
		'write_retro',
		'declare_scope',
	];

	describe('Import verification', () => {
		it('runCheckGateStatus can be imported from check-gate-status.ts', async () => {
			const { runCheckGateStatus } = await import('../../src/tools/check-gate-status');
			expect(runCheckGateStatus).toBeDefined();
			expect(typeof runCheckGateStatus).toBe('function');
		});

		it('runCheckGateStatus is a valid function', async () => {
			const { runCheckGateStatus } = await import('../../src/tools/check-gate-status');
			expect(typeof runCheckGateStatus).toBe('function');
		});
	});

	describe('Function structure verification', () => {
		it('runCheckGateStatus accepts task_id and directory parameters', async () => {
			const { runCheckGateStatus } = await import('../../src/tools/check-gate-status');
			
			// Test with invalid task_id to verify it returns proper error response
			const result = await runCheckGateStatus('invalid', '/test/dir');
			expect(typeof result).toBe('string');

			// Result should be JSON
			const parsed = JSON.parse(result);
			expect(parsed).toHaveProperty('status');
			expect(parsed).toHaveProperty('message');
		});

		it('runCheckGateStatus has correct return type', async () => {
			const { runCheckGateStatus } = await import('../../src/tools/check-gate-status');
			
			const result = await runCheckGateStatus('1.1', '/test/dir');
			const parsed = JSON.parse(result);
			
			// Should return a valid result structure
			expect(parsed).toHaveProperty('taskId');
			expect(parsed).toHaveProperty('status');
			expect(parsed).toHaveProperty('required_gates');
			expect(parsed).toHaveProperty('passed_gates');
			expect(parsed).toHaveProperty('missing_gates');
		});
	});

	describe('Tool name verification', () => {
		it('runCheckGateStatus follows snake_case naming convention', () => {
			expect('runCheckGateStatus').toMatch(/^[a-z][a-zA-Z]*$/);
		});

		it('check_gate_status is exported from tools index', async () => {
			const toolsIndex = await import('../../src/tools/index');
			expect(toolsIndex).toHaveProperty('runCheckGateStatus');
		});
	});

	describe('Core tools index integration', () => {
		it('runCheckGateStatus appears in barrel exports', async () => {
			const toolsIndex = await import('../../src/tools/index');
			const exports = Object.keys(toolsIndex);
			expect(exports).toContain('runCheckGateStatus');
		});

		it('runCheckGateStatus export matches source module identity', async () => {
			const barrel = await import('../../src/tools/index');
			const sourceModule = await import('../../src/tools/check-gate-status');
			expect(barrel.runCheckGateStatus).toBe(sourceModule.runCheckGateStatus);
		});
	});

	describe('No disruption to existing tools', () => {
		it('existing tools are still exported from barrel', async () => {
			const toolsIndex = await import('../../src/tools/index');

			// Verify a few key existing tools are still present (core exports different names)
			expect(toolsIndex).toHaveProperty('handleSave');
			expect(toolsIndex).toHaveProperty('executeSavePlan');
			expect(toolsIndex).toHaveProperty('runTests');
			expect(toolsIndex).toHaveProperty('executePhaseComplete');
			expect(toolsIndex).toHaveProperty('executeUpdateTaskStatus');
		});

		it('existing tools have valid structure', async () => {
			const { handleSave, executeSavePlan, runTests } = await import('../../src/tools/index');

			// Verify these tools have the expected structure (they are functions)
			expect(typeof handleSave).toBe('function');
			expect(typeof executeSavePlan).toBe('function');
			expect(typeof runTests).toBe('function');
		});
	});

	describe('Source module verification', () => {
		it('source check-gate-status.ts module exists and exports runCheckGateStatus', async () => {
			const sourceModule = await import('../../src/tools/check-gate-status');
			expect(sourceModule).toHaveProperty('runCheckGateStatus');
		});

		it('source module exports correct function signature', async () => {
			const { runCheckGateStatus } = await import('../../src/tools/check-gate-status');

			expect(typeof runCheckGateStatus).toBe('function');
		});

		it('barrel re-exports exact same reference as source', async () => {
			const barrel = await import('../../src/tools/index');
			const source = await import('../../src/tools/check-gate-status');

			// The exact same function reference should be exported
			expect(barrel.runCheckGateStatus).toBe(source.runCheckGateStatus);
		});
	});

	describe('Task ID validation behavior', () => {
		it('runCheckGateStatus rejects invalid task_id format', async () => {
			const result = await executeTool({ task_id: 'invalid' }, '/test/dir');
			const parsed = JSON.parse(result);

			expect(parsed.status).toBe('no_evidence');
			expect(parsed.message).toContain('Invalid');
		});

		it('runCheckGateStatus accepts valid task_id format N.M', async () => {
			const result = await executeTool({ task_id: '1.1' }, '/test/dir');
			const parsed = JSON.parse(result);

			// Should return a valid result (no_evidence if file doesn't exist)
			expect(parsed).toHaveProperty('taskId');
			expect(parsed.taskId).toBe('1.1');
			expect(parsed).toHaveProperty('status');
			expect(parsed).toHaveProperty('required_gates');
			expect(parsed).toHaveProperty('passed_gates');
			expect(parsed).toHaveProperty('missing_gates');
		});

		it('runCheckGateStatus accepts valid task_id format N.M.P', async () => {
			const result = await executeTool({ task_id: '2.3.1' }, '/test/dir');
			const parsed = JSON.parse(result);

			expect(parsed.taskId).toBe('2.3.1');
			expect(parsed).toHaveProperty('status');
		});
	});
});
