import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	createSlopDetectorHook,
	type SlopDetectorConfig,
} from './slop-detector';

function generateLines(count: number): string {
	return Array.from({ length: count }, (_, i) => `+line ${i + 1}\n`).join('');
}

describe('slop-detector', () => {
	let projectDir: string;
	let injectSystemMessageCalls: Array<[string, string]>;
	let injectSystemMessage: (sessionId: string, message: string) => void;
	let config: SlopDetectorConfig;

	const defaultConfig: SlopDetectorConfig = {
		enabled: true,
		classThreshold: 3,
		commentStripThreshold: 5,
		diffLineThreshold: 200,
	};

	beforeEach(() => {
		projectDir = join(tmpdir(), 'slop-detector-test-' + Date.now());
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(join(projectDir, 'src'), { recursive: true });
		Bun.write(join(projectDir, 'src/dummy.ts'), 'export const x = 1;\n');

		injectSystemMessageCalls = [];
		injectSystemMessage = (sessionId: string, message: string) => {
			injectSystemMessageCalls.push([sessionId, message]);
		};
		config = { ...defaultConfig };
	});

	afterEach(() => {
		rmSync(projectDir, { recursive: true, force: true });
	});

	// Required test 1: Abstraction bloat — 3+ class declarations
	it('detects 3+ class declarations in content (abstraction_bloat)', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const content = `+class Foo {}\n+class Bar {}\n+class Baz {}\n`;

		await hook.toolAfter(
			{ tool: 'write', sessionID: 's1' },
			{ args: { content } },
		);

		expect(injectSystemMessageCalls.length).toBe(1);
		expect(injectSystemMessageCalls[0][1]).toContain('abstraction_bloat');
	});

	// Required test 2: Comment stripping
	it('detects comment stripping — 8 removed comments, no additions', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		// Simulate a diff where 8 comment lines were removed (leading -) and 0 added (no leading +)
		const newString = `-// comment\n-// comment\n-// comment\n-// comment\n-// comment\n-// comment\n-// comment\n-// comment\n`;

		await hook.toolAfter(
			{ tool: 'edit', sessionID: 's2' },
			{ args: { newString } },
		);

		expect(injectSystemMessageCalls.length).toBe(1);
		expect(injectSystemMessageCalls[0][1]).toContain('comment_strip');
	});

	// Required test 3: Boilerplate explosion for fix task
	it('detects boilerplate explosion — 250+ lines for "fix validation" task', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const content = generateLines(250);

		await hook.toolAfter(
			{ tool: 'write', sessionID: 's3' },
			{ args: { content, description: 'fix validation' } },
		);

		expect(injectSystemMessageCalls.length).toBe(1);
		expect(injectSystemMessageCalls[0][1]).toContain('boilerplate_explosion');
	});

	// Required test 4: No false positive — large diff for build task
	it('no false positive — 250+ lines for "build the payment module" task', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const content = generateLines(250);

		await hook.toolAfter(
			{ tool: 'write', sessionID: 's4' },
			{ args: { content, description: 'build the payment module' } },
		);

		expect(injectSystemMessageCalls.length).toBe(0);
	});

	// Required test 5: Respects enabled: false
	it('no injection when enabled=false regardless of content', async () => {
		config.enabled = false;
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const content = `+class Foo {}\n+class Bar {}\n+class Baz {}\n`;

		await hook.toolAfter(
			{ tool: 'write', sessionID: 's5' },
			{ args: { content } },
		);

		expect(injectSystemMessageCalls.length).toBe(0);
	});

	// Required test 6: Respects custom thresholds
	it('does not trigger with classThreshold: 10 and only 3 classes', async () => {
		config.classThreshold = 10;
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const content = `+class Foo {}\n+class Bar {}\n+class Baz {}\n`;

		await hook.toolAfter(
			{ tool: 'write', sessionID: 's6' },
			{ args: { content } },
		);

		expect(injectSystemMessageCalls.length).toBe(0);
	});

	// Additional test 7: Non-write tool (bash) — no injection
	it('no injection for bash tool even with triggering content', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const content = `+class Foo {}\n+class Bar {}\n+class Baz {}\n`;

		await hook.toolAfter(
			{ tool: 'bash', sessionID: 's7' },
			{ args: { content } },
		);

		expect(injectSystemMessageCalls.length).toBe(0);
	});

	// Additional test 8: Empty content — no injection, no error
	it('empty content — no injection, no error', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		await hook.toolAfter(
			{ tool: 'write', sessionID: 's8' },
			{ args: { content: '' } },
		);

		expect(injectSystemMessageCalls.length).toBe(0);
	});

	// Additional test 9: apply_patch tool uses args.patch field
	it('apply_patch tool uses args.patch for content', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const content = `+class Foo {}\n+class Bar {}\n+class Baz {}\n`;

		await hook.toolAfter(
			{ tool: 'apply_patch', sessionID: 's9' },
			{ args: { patch: content } },
		);

		expect(injectSystemMessageCalls.length).toBe(1);
		expect(injectSystemMessageCalls[0][1]).toContain('abstraction_bloat');
	});

	// Additional test 10: edit tool uses args.newString field
	it('edit tool uses args.newString for content', async () => {
		const hook = createSlopDetectorHook(
			config,
			projectDir,
			injectSystemMessage,
		);

		const newString = `+class Foo {}\n+class Bar {}\n+class Baz {}\n`;

		await hook.toolAfter(
			{ tool: 'edit', sessionID: 's10' },
			{ args: { newString } },
		);

		expect(injectSystemMessageCalls.length).toBe(1);
		expect(injectSystemMessageCalls[0][1]).toContain('abstraction_bloat');
	});
});
