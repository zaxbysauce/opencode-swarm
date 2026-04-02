import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRetroInjection } from '../../../src/hooks/system-enhancer';

describe('System Enhancer - User Directives Injection (10 Tests)', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'swarm-user-dir-test-'));
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {}
	});

	async function createRetroBundle(
		phase: number,
		verdict: 'pass' | 'fail' = 'pass',
		userDirectives?: Array<{
			directive: string;
			category: 'tooling' | 'code_style' | 'architecture' | 'process' | 'other';
			scope: 'session' | 'project' | 'global';
		}>,
	): Promise<void> {
		const retroDir = join(tempDir, '.swarm', 'evidence', `retro-${phase}`);
		await mkdir(retroDir, { recursive: true });

		const timestamp = new Date().toISOString();
		const bundle = {
			schema_version: '1.0.0',
			task_id: `retro-${phase}`,
			entries: [
				{
					type: 'retrospective',
					task_id: `retro-${phase}`,
					timestamp,
					agent: 'architect',
					verdict,
					summary: `Phase ${phase} completed successfully`,
					metadata: {},
					phase_number: phase,
					total_tool_calls: 100,
					coder_revisions: 2,
					reviewer_rejections: 1,
					test_failures: 0,
					security_findings: 0,
					integration_issues: 0,
					task_count: 5,
					task_complexity: 'moderate',
					top_rejection_reasons: ['Config schema approach not aligned'],
					lessons_learned: [
						'Tree-sitter integration requires WASM grammar files',
					],
					user_directives: userDirectives ?? [],
				},
			],
			created_at: timestamp,
			updated_at: timestamp,
		};
		await writeFile(join(retroDir, 'evidence.json'), JSON.stringify(bundle));
	}

	// ========== VERIFICATION TESTS ==========

	it('1. Returns "## User Directives" block when Tier 1 retro has project-scope directives', async () => {
		await createRetroBundle(1, 'pass', [
			{
				directive: 'Use TypeScript strict mode',
				category: 'code_style',
				scope: 'project',
			},
		]);

		const result = await buildRetroInjection(tempDir, 2);

		expect(result).not.toBeNull();
		expect(result).toContain('## User Directives (from Phase 1)');
		expect(result).toContain('- [code_style] Use TypeScript strict mode');
	});

	it('2. Returns "## User Directives" block when Tier 1 retro has global-scope directives', async () => {
		await createRetroBundle(1, 'pass', [
			{
				directive: 'Always run security review before deployment',
				category: 'process',
				scope: 'global',
			},
		]);

		const result = await buildRetroInjection(tempDir, 2);

		expect(result).not.toBeNull();
		expect(result).toContain('## User Directives (from Phase 1)');
		expect(result).toContain(
			'- [process] Always run security review before deployment',
		);
	});

	it('3. Does NOT include "## User Directives" when all directives are session-scope', async () => {
		await createRetroBundle(1, 'pass', [
			{
				directive: 'Use verbose logging for this session',
				category: 'tooling',
				scope: 'session',
			},
		]);

		const result = await buildRetroInjection(tempDir, 2);

		expect(result).not.toBeNull();
		expect(result).toContain('## Previous Phase Retrospective (Phase 1)');
		expect(result).not.toContain('## User Directives');
	});

	it('4. Does NOT include "## User Directives" when user_directives is absent (backward compat)', async () => {
		// Create retro without user_directives field
		const retroDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
		await mkdir(retroDir, { recursive: true });

		const timestamp = new Date().toISOString();
		const bundle = {
			schema_version: '1.0.0',
			task_id: 'retro-1',
			entries: [
				{
					type: 'retrospective',
					task_id: 'retro-1',
					timestamp,
					agent: 'architect',
					verdict: 'pass',
					summary: 'Phase 1 completed successfully',
					metadata: {},
					phase_number: 1,
					total_tool_calls: 100,
					coder_revisions: 2,
					reviewer_rejections: 1,
					test_failures: 0,
					security_findings: 0,
					integration_issues: 0,
					task_count: 5,
					task_complexity: 'moderate',
					top_rejection_reasons: ['Config schema approach not aligned'],
					lessons_learned: [
						'Tree-sitter integration requires WASM grammar files',
					],
					// NOTE: user_directives field is omitted
				},
			],
			created_at: timestamp,
			updated_at: timestamp,
		};
		await writeFile(join(retroDir, 'evidence.json'), JSON.stringify(bundle));

		const result = await buildRetroInjection(tempDir, 2);

		expect(result).not.toBeNull();
		expect(result).toContain('## Previous Phase Retrospective (Phase 1)');
		expect(result).not.toContain('## User Directives');
	});

	it('5. Caps output at 5 directives when more than 5 non-session directives exist', async () => {
		const manyDirectives = Array.from({ length: 10 }, (_, i) => ({
			directive: `Directive ${i + 1}`,
			category: 'other' as const,
			scope: 'project' as const,
		}));

		await createRetroBundle(1, 'pass', manyDirectives);

		const result = await buildRetroInjection(tempDir, 2);

		expect(result).not.toBeNull();
		expect(result).toContain('## User Directives (from Phase 1)');

		// Count how many directive lines are present
		const directiveLines = result?.match(/- \[other\] Directive \d+/g);
		expect(directiveLines).toBeDefined();
		expect(directiveLines!.length).toBe(5);

		// Verify it only contains directives 1-5, not 6-10
		expect(result).toContain('Directive 1');
		expect(result).toContain('Directive 5');
		expect(result).not.toContain('Directive 6');
		expect(result).not.toContain('Directive 10');
	});

	it('6. Tier 2 includes "User directives carried forward:" when non-session directives exist in historical retros', async () => {
		// Phase 1 should get Tier 2 historical injection
		await createRetroBundle(3, 'pass', [
			{
				directive: 'Use ES modules',
				category: 'code_style',
				scope: 'project',
			},
		]);
		await createRetroBundle(4, 'pass', [
			{
				directive: 'Write unit tests',
				category: 'process',
				scope: 'global',
			},
		]);

		const result = await buildRetroInjection(tempDir, 1);

		expect(result).not.toBeNull();
		expect(result).toContain(
			'## Historical Lessons (from recent prior projects)',
		);
		expect(result).toContain('User directives carried forward:');
		expect(result).toContain('- [code_style] Use ES modules');
		expect(result).toContain('- [process] Write unit tests');
	});

	// ========== ADVERSARIAL TESTS ==========

	it('7. user_directives: null — should not throw, returns null (schema validation rejects malformed bundles)', async () => {
		const retroDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
		await mkdir(retroDir, { recursive: true });

		const timestamp = new Date().toISOString();
		const bundle = {
			schema_version: '1.0.0',
			task_id: 'retro-1',
			entries: [
				{
					type: 'retrospective',
					task_id: 'retro-1',
					timestamp,
					agent: 'architect',
					verdict: 'pass',
					summary: 'Phase 1 completed successfully',
					metadata: {},
					phase_number: 1,
					total_tool_calls: 100,
					coder_revisions: 2,
					reviewer_rejections: 1,
					test_failures: 0,
					security_findings: 0,
					integration_issues: 0,
					task_count: 5,
					task_complexity: 'moderate',
					top_rejection_reasons: ['Config schema approach not aligned'],
					lessons_learned: [
						'Tree-sitter integration requires WASM grammar files',
					],
					user_directives: null, // Explicitly null - violates schema
				},
			],
			created_at: timestamp,
			updated_at: timestamp,
		};
		await writeFile(join(retroDir, 'evidence.json'), JSON.stringify(bundle));

		// Should not throw, even though schema validation fails
		const result = await buildRetroInjection(tempDir, 2);

		// Returns null because schema validation rejects the malformed bundle (defensive behavior)
		expect(result).toBeNull();
	});

	it('8. Empty string directive — should not crash, returns null (schema validation rejects empty strings)', async () => {
		const retroDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
		await mkdir(retroDir, { recursive: true });

		const timestamp = new Date().toISOString();
		const bundle = {
			schema_version: '1.0.0',
			task_id: 'retro-1',
			entries: [
				{
					type: 'retrospective',
					task_id: 'retro-1',
					timestamp,
					agent: 'architect',
					verdict: 'pass',
					summary: 'Phase 1 completed successfully',
					metadata: {},
					phase_number: 1,
					total_tool_calls: 100,
					coder_revisions: 2,
					reviewer_rejections: 1,
					test_failures: 0,
					security_findings: 0,
					integration_issues: 0,
					task_count: 5,
					task_complexity: 'moderate',
					top_rejection_reasons: ['Config schema approach not aligned'],
					lessons_learned: [
						'Tree-sitter integration requires WASM grammar files',
					],
					user_directives: [
						{
							directive: '', // Empty string - violates schema min(1)
							category: 'other',
							scope: 'project',
						},
					],
				},
			],
			created_at: timestamp,
			updated_at: timestamp,
		};
		await writeFile(join(retroDir, 'evidence.json'), JSON.stringify(bundle));

		// Should not throw, even though schema validation fails
		const result = await buildRetroInjection(tempDir, 2);

		// Returns null because schema validation rejects the malformed bundle (defensive behavior)
		expect(result).toBeNull();
	});

	it('9. Malformed user_directives array (missing scope field) — should not crash, returns null (schema validation rejects invalid enum value)', async () => {
		const retroDir = join(tempDir, '.swarm', 'evidence', 'retro-1');
		await mkdir(retroDir, { recursive: true });

		const timestamp = new Date().toISOString();
		const bundle = {
			schema_version: '1.0.0',
			task_id: 'retro-1',
			entries: [
				{
					type: 'retrospective',
					task_id: 'retro-1',
					timestamp,
					agent: 'architect',
					verdict: 'pass',
					summary: 'Phase 1 completed successfully',
					metadata: {},
					phase_number: 1,
					total_tool_calls: 100,
					coder_revisions: 2,
					reviewer_rejections: 1,
					test_failures: 0,
					security_findings: 0,
					integration_issues: 0,
					task_count: 5,
					task_complexity: 'moderate',
					top_rejection_reasons: ['Config schema approach not aligned'],
					lessons_learned: [
						'Tree-sitter integration requires WASM grammar files',
					],
					user_directives: [
						{
							directive: 'Use TypeScript',
							category: 'code_style',
							// Missing 'scope' field - violates schema
						} as any,
					],
				},
			],
			created_at: timestamp,
			updated_at: timestamp,
		};
		await writeFile(join(retroDir, 'evidence.json'), JSON.stringify(bundle));

		// Should not throw even with malformed data
		const result = await buildRetroInjection(tempDir, 2);

		// Returns null because schema validation rejects the malformed bundle (defensive behavior)
		expect(result).toBeNull();
	});

	it('10. Very large user_directives array (50 entries, all project scope) — should only show first 5', async () => {
		const manyDirectives = Array.from({ length: 50 }, (_, i) => ({
			directive: `Large directive ${i + 1}`,
			category: 'other' as const,
			scope: 'project' as const,
		}));

		await createRetroBundle(1, 'pass', manyDirectives);

		const result = await buildRetroInjection(tempDir, 2);

		expect(result).not.toBeNull();
		expect(result).toContain('## User Directives (from Phase 1)');

		// Count directive lines
		const directiveLines = result?.match(/- \[other\] Large directive \d+/g);
		expect(directiveLines).toBeDefined();
		expect(directiveLines!.length).toBe(5);

		// Verify first 5 are present
		expect(result).toContain('Large directive 1');
		expect(result).toContain('Large directive 2');
		expect(result).toContain('Large directive 3');
		expect(result).toContain('Large directive 4');
		expect(result).toContain('Large directive 5');

		// Verify later ones are NOT present
		expect(result).not.toContain('Large directive 6');
		expect(result).not.toContain('Large directive 10');
		expect(result).not.toContain('Large directive 50');
	});
});
