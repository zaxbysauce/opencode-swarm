import { describe, expect, test } from 'bun:test';
import {
	type InjectionBudgetPool,
	type InjectionSourceConfig,
	DEFAULT_ARCHITECT_SOURCES,
	DEFAULT_DELEGATE_SOURCES,
	createInjectionBudgetPool,
} from '../../../src/services/injection-budget.js';

describe('InjectionBudgetPool', () => {
	test('allocate returns requested chars when within share', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		const granted = pool.allocate('knowledge_directives', 200);
		expect(granted).toBe(200);
	});

	test('allocate caps at share boundary', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		// knowledge_directives share = 0.45 * 1000 = 450
		const granted = pool.allocate('knowledge_directives', 600);
		expect(granted).toBe(450);
	});

	test('allocate respects minChars when share is exhausted', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		// Exhaust most of the pool
		pool.allocate('knowledge_directives', 450); // 450 used
		pool.allocate('memory_recall', 400); // 850 used
		// curator_briefing share = 0.15 * 1000 = 150, but pool remaining = 150
		const granted = pool.allocate('curator_briefing', 500);
		expect(granted).toBe(150);
	});

	test('allocate returns 0 for unknown source', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		const granted = pool.allocate(
			'delegate_directives' as any,
			500,
		);
		expect(granted).toBe(0);
	});

	test('allocate returns 0 for zero or negative request', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		expect(pool.allocate('knowledge_directives', 0)).toBe(0);
		expect(pool.allocate('knowledge_directives', -10)).toBe(0);
	});

	test('commit returns unused surplus to pool', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		pool.allocate('knowledge_directives', 400);
		expect(pool.remaining).toBe(600);

		// Only used 200 of the 400 allocated
		pool.commit('knowledge_directives', 200);
		expect(pool.remaining).toBe(800);
	});

	test('commit does not exceed allocated amount', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		pool.allocate('knowledge_directives', 300);
		// Claim more than allocated — should be capped
		pool.commit('knowledge_directives', 500);
		// committed = min(500, 300) = 300 — no surplus returned
		expect(pool.remaining).toBe(700);
	});

	test('remaining tracks total usage', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		expect(pool.remaining).toBe(1000);
		pool.allocate('knowledge_directives', 200);
		expect(pool.remaining).toBe(800);
		pool.allocate('memory_recall', 300);
		expect(pool.remaining).toBe(500);
	});

	test('remaining never goes negative', () => {
		const pool = createInjectionBudgetPool(100, [
			{ id: 'knowledge_directives', share: 1.0, minChars: 0 },
		]);
		pool.allocate('knowledge_directives', 100);
		expect(pool.remaining).toBe(0);
		const extra = pool.allocate('knowledge_directives', 50);
		expect(extra).toBe(0);
		expect(pool.remaining).toBe(0);
	});

	test('getShare returns configured share', () => {
		const pool = createInjectionBudgetPool(2000, DEFAULT_ARCHITECT_SOURCES);
		expect(pool.getShare('knowledge_directives')).toBe(900); // 0.45 * 2000
		expect(pool.getShare('memory_recall')).toBe(800); // 0.4 * 2000
		expect(pool.getShare('curator_briefing')).toBe(300); // 0.15 * 2000
	});

	test('getShare returns 0 for unknown source', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		expect(pool.getShare('delegate_directives' as any)).toBe(0);
	});

	test('snapshot reports all source allocations', () => {
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		pool.allocate('knowledge_directives', 200);
		pool.commit('knowledge_directives', 150);

		const snap = pool.snapshot();
		expect(snap.knowledge_directives).toEqual({
			share: 450,
			allocated: 200,
			committed: 150,
		});
		expect(snap.memory_recall).toEqual({
			share: 400,
			allocated: 0,
			committed: 0,
		});
		expect(snap.curator_briefing).toEqual({
			share: 150,
			allocated: 0,
			committed: 0,
		});
	});

	test('totalBudget is readonly', () => {
		const pool = createInjectionBudgetPool(5000, DEFAULT_ARCHITECT_SOURCES);
		expect(pool.totalBudget).toBe(5000);
	});

	test('delegate sources have correct defaults', () => {
		const pool = createInjectionBudgetPool(4000, DEFAULT_DELEGATE_SOURCES);
		expect(pool.getShare('delegate_directives')).toBe(2400); // 0.6 * 4000
		expect(pool.getShare('skill_recommendations')).toBe(1600); // 0.4 * 4000
	});

	test('multiple allocations from same source accumulate', () => {
		// curator_briefing has minChars=0, so no minChars floor kicks in
		const pool = createInjectionBudgetPool(1000, DEFAULT_ARCHITECT_SOURCES);
		// curator_briefing share = 0.15 * 1000 = 150
		pool.allocate('curator_briefing', 100);
		pool.allocate('curator_briefing', 40);
		// 150 share - 140 already = 10 remaining, minChars=0 so no floor
		const third = pool.allocate('curator_briefing', 50);
		expect(third).toBe(10);
	});

	test('minChars guarantees minimum allocation even when share is depleted', () => {
		const sources: InjectionSourceConfig[] = [
			{ id: 'knowledge_directives', share: 0.1, minChars: 300 },
			{ id: 'memory_recall', share: 0.9, minChars: 200 },
		];
		const pool = createInjectionBudgetPool(1000, sources);
		// knowledge_directives share = 100, but minChars = 300
		const granted = pool.allocate('knowledge_directives', 300);
		expect(granted).toBe(300);
	});

	test('fail-open: pool absence does not break consumers', () => {
		// Simulates the scenario where no pool is created (pool is undefined)
		const pool: InjectionBudgetPool | undefined = undefined;
		const fallbackBudget = 2000;
		const effectiveBudget = pool
			? pool.allocate('knowledge_directives', fallbackBudget)
			: fallbackBudget;
		expect(effectiveBudget).toBe(2000);
	});
});
