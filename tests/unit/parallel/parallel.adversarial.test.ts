/**
 * Security Tests: Parallel Module - Test Suite Wrapper
 *
 * This file imports all parallel adversarial test modules.
 * Individual test files can be run separately to avoid session instability.
 *
 * Run individual modules:
 *   bun test tests/unit/parallel/meta-indexer.adversarial.test.ts
 *   bun test tests/unit/parallel/review-router.adversarial.test.ts
 *   bun test tests/unit/parallel/dependency-graph.adversarial.test.ts
 *   bun test tests/unit/parallel/file-locks.adversarial.test.ts
 */

import { describe, expect, it } from 'bun:test';

// Import test modules to register them with the test runner
import './meta-indexer.adversarial.test.js';
import './review-router.adversarial.test.js';
import './dependency-graph.adversarial.test.js';
import './file-locks.adversarial.test.js';

describe('Parallel Security Tests', () => {
	it('should have loaded all adversarial test modules', () => {
		// Placeholder - actual tests are in imported modules
		expect(true).toBe(true);
	});
});
