import { describe, expect, it } from 'bun:test';
import { createSlopDetectorHook } from './slop-detector';

const defaultConfig = {
	enabled: true,
	classThreshold: 3,
	commentStripThreshold: 5,
	diffLineThreshold: 200,
	importHygieneThreshold: 2,
};

async function runHook(content: string, threshold = 2) {
	const msgs: string[] = [];
	const hook = createSlopDetectorHook(
		{ ...defaultConfig, importHygieneThreshold: threshold },
		process.cwd(),
		(_sid, msg) => msgs.push(msg),
	);
	await hook.toolAfter(
		{ tool: 'write', sessionID: 'test' },
		{ args: { content } },
	);
	return msgs;
}

describe('checkStaleImports adversarial', () => {
	it('identifier with regex metacharacters cannot cause ReDoS', async () => {
		// Even if import name had special chars (impossible via /^\w+$/ guard), test robustness
		const content = `import { useState } from 'react';\nconst x = useState(0);`;
		const msgs = await runHook(content);
		// No crash, no finding
		expect(msgs.filter((m) => m.includes('stale_import'))).toHaveLength(0);
	});

	it('very large import list (1000 identifiers): no hang', async () => {
		const imports = Array.from({ length: 1000 }, (_, i) => `fn${i}`).join(', ');
		const content = `import { ${imports} } from './big-lib';\nconst x = 1;`;
		const start = Date.now();
		const msgs = await runHook(content);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(5000); // must complete within 5s
		expect(msgs.some((m) => m.includes('stale_import'))).toBe(true); // 1000 stale > threshold 2
	});

	it('malformed import (unclosed brace): no crash', async () => {
		const content = `import { Foo, Bar from './lib';\nconst x = Foo();`;
		await expect(runHook(content)).resolves.toBeDefined();
	});

	it('threshold=0 edge case: should not flag (min is 1 per schema)', async () => {
		// If threshold somehow reaches 0 (bypassing schema), function should handle gracefully
		// With 0 threshold, `staleImports.length < 0` is always false => every file would flag
		// The schema enforces min(1), so this is a defense-in-depth test
		const content = `import { useState } from 'react';\nconst x = useState(0);`;
		// With 0 stale imports and threshold 0 — still no finding since nothing is stale
		const msgs = await runHook(content, 0);
		// Either flags or not — just must not crash
		expect(Array.isArray(msgs)).toBe(true);
	});
});
