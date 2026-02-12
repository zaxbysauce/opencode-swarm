import { describe, expect, it } from 'bun:test';
import {
  rankCandidates,
  type ContextCandidate,
  type ScoringConfig,
} from '../../../src/hooks/context-scoring';

/**
 * Helper to create a minimal scoring config for tests
 */
function createTestConfig(overrides: Partial<ScoringConfig> = {}): ScoringConfig {
  return {
    enabled: true,
    max_candidates: 10,
    weights: {
      phase: 5,
      current_task: 10,
      blocked_task: 8,
      recent_failure: 7,
      recent_success: 6,
      evidence_presence: 4,
      decision_recency: 3,
      dependency_proximity: 2,
    },
    decision_decay: {
      mode: 'exponential',
      half_life_hours: 24,
    },
    token_ratios: {
      prose: 0.25,
      code: 0.25,
      markdown: 0.25,
      json: 0.25,
    },
    ...overrides,
  };
}

/**
 * Helper to create a base candidate
 */
function createCandidate(
  id: string,
  kind: ContextCandidate['kind'],
  overrides: Partial<ContextCandidate> = {}
): ContextCandidate {
  return {
    id,
    kind,
    text: `Content for ${id}`,
    tokens: 100,
    priority: 1,
    metadata: {
      contentType: 'prose',
      ...overrides.metadata,
    },
    ...overrides,
  };
}

describe('rankCandidates', () => {
  describe('disabled mode', () => {
    it('returns candidates unchanged when enabled=false', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('c', 'task', { priority: 1 }),
        createCandidate('a', 'phase', { priority: 3 }),
        createCandidate('b', 'decision', { priority: 2 }),
      ];

      const config = createTestConfig({ enabled: false });
      const result = rankCandidates(candidates, config);

      // Should maintain original order when disabled
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('c');
      expect(result[1].id).toBe('a');
      expect(result[2].id).toBe('b');
      // All scores should be 0 when disabled
      expect(result[0].score).toBe(0);
      expect(result[1].score).toBe(0);
      expect(result[2].score).toBe(0);
    });
  });

  describe('enabled mode', () => {
    it('computes scores correctly for different candidate types', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('phase1', 'phase'), // phase=5
        createCandidate('task1', 'task', {
          metadata: { contentType: 'prose', isCurrentTask: true },
        }), // current_task=10
      ];

      const config = createTestConfig();
      const result = rankCandidates(candidates, config);

      // task1 should score higher (10) than phase1 (5)
      expect(result[0].id).toBe('task1');
      expect(result[0].score).toBe(10 + 2); // current_task + dependency_proximity
      expect(result[1].id).toBe('phase1');
      expect(result[1].score).toBe(5 + 2); // phase + dependency_proximity
    });

    it('produces deterministic output for same input', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('a', 'task', { priority: 2 }),
        createCandidate('b', 'task', { priority: 1 }),
        createCandidate('c', 'task', { priority: 3 }),
      ];

      const config = createTestConfig();

      // Run multiple times
      const result1 = rankCandidates(candidates, config);
      const result2 = rankCandidates(candidates, config);
      const result3 = rankCandidates(candidates, config);

      // All results should be identical
      expect(result1.map(r => r.id)).toEqual(result2.map(r => r.id));
      expect(result2.map(r => r.id)).toEqual(result3.map(r => r.id));
    });
  });

  describe('max_candidates truncation', () => {
    it('truncates after ranking when max_candidates is less than total', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('a', 'phase'), // score ~7
        createCandidate('b', 'task'),  // score ~2
        createCandidate('c', 'decision'), // score ~2
        createCandidate('d', 'evidence'), // score ~2
        createCandidate('e', 'agent_context'), // score ~2
      ];

      const config = createTestConfig({ max_candidates: 3 });
      const result = rankCandidates(candidates, config);

      expect(result).toHaveLength(3);
      // Should keep top 3 (phase has highest weight, rest are equal)
      // Among equals, higher priority or alphabetical id breaks tie
      const ids = result.map(r => r.id);
      expect(ids).toContain('a'); // phase should be first
    });

    it('returns all candidates when max_candidates exceeds total', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('a', 'task'),
        createCandidate('b', 'task'),
      ];

      const config = createTestConfig({ max_candidates: 10 });
      const result = rankCandidates(candidates, config);

      expect(result).toHaveLength(2);
    });
  });

  describe('dependency depth decay', () => {
    it('applies correct dependency proximity formula', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('depth0', 'task', {
          metadata: { contentType: 'prose', dependencyDepth: 0 },
        }),
        createCandidate('depth1', 'task', {
          metadata: { contentType: 'prose', dependencyDepth: 1 },
        }),
        createCandidate('depth3', 'task', {
          metadata: { contentType: 'prose', dependencyDepth: 3 },
        }),
      ];

      const config = createTestConfig();
      const result = rankCandidates(candidates, config);

      // depth0: proximity = 1/(1+0) = 1.0, score = 0 + 2*1.0 = 2
      // depth1: proximity = 1/(1+1) = 0.5, score = 0 + 2*0.5 = 1
      // depth3: proximity = 1/(1+3) = 0.25, score = 0 + 2*0.25 = 0.5

      expect(result[0].id).toBe('depth0');
      expect(result[0].score).toBeCloseTo(2, 5);
      expect(result[1].id).toBe('depth1');
      expect(result[1].score).toBeCloseTo(1, 5);
      expect(result[2].id).toBe('depth3');
      expect(result[2].score).toBeCloseTo(0.5, 5);
    });
  });

  describe('decision decay formulas', () => {
    it('calculates exponential decay correctly', () => {
      const baseTime = Date.now();
      
      const candidates: ContextCandidate[] = [
        createCandidate('recent', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: 0 },
        }),
        createCandidate('day_old', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: 24 },
        }),
        createCandidate('two_days', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: 48 },
        }),
      ];

      const config = createTestConfig({
        decision_decay: { mode: 'exponential', half_life_hours: 24 },
        weights: { ...createTestConfig().weights, decision_recency: 10 },
      });

      const result = rankCandidates(candidates, config);

      // recent: 2^(0/24) = 1, score = 10 * 1 + 2 = 12 (decision_recency + dependency_proximity)
      expect(result.find(r => r.id === 'recent')!.score).toBeCloseTo(12, 5);

      // day_old: 2^(-24/24) = 0.5, score = 10 * 0.5 + 2 = 7
      expect(result.find(r => r.id === 'day_old')!.score).toBeCloseTo(7, 5);

      // two_days: 2^(-48/24) = 0.25, score = 10 * 0.25 + 2 = 4.5
      expect(result.find(r => r.id === 'two_days')!.score).toBeCloseTo(4.5, 5);

      // Verify ordering (highest score first)
      expect(result[0].id).toBe('recent');
      expect(result[1].id).toBe('day_old');
      expect(result[2].id).toBe('two_days');
    });

    it('calculates linear decay correctly', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('recent', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: 0 },
        }),
        createCandidate('day_old', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: 24 },
        }),
        createCandidate('two_days', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: 48 },
        }),
        createCandidate('three_days', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: 72 },
        }), // At 2x half-life, should be 0
      ];

      const config = createTestConfig({
        decision_decay: { mode: 'linear', half_life_hours: 24 },
        weights: { ...createTestConfig().weights, decision_recency: 10 },
      });

      const result = rankCandidates(candidates, config);

      // recent: 1 - (0 / 48) = 1, score = 10 * 1 + 2 = 12 (decision_recency + dependency_proximity)
      expect(result.find(r => r.id === 'recent')!.score).toBeCloseTo(12, 5);

      // day_old: 1 - (24 / 48) = 0.5, score = 10 * 0.5 + 2 = 7
      expect(result.find(r => r.id === 'day_old')!.score).toBeCloseTo(7, 5);

      // two_days: 1 - (48 / 48) = 0, score = 10 * 0 + 2 = 2
      expect(result.find(r => r.id === 'two_days')!.score).toBeCloseTo(2, 5);

      // three_days: max(0, 1 - (72 / 48)) = max(0, -0.5) = 0, score = 10 * 0 + 2 = 2
      expect(result.find(r => r.id === 'three_days')!.score).toBeCloseTo(2, 5);
    });
  });

  describe('mixed candidate types', () => {
    it('scores different kinds appropriately', () => {
      const candidates: ContextCandidate[] = [
        // Phase: phase=1, others=0
        createCandidate('phase1', 'phase'),

        // Current task: current_task=1, others=0
        createCandidate('current', 'task', {
          metadata: { contentType: 'prose', isCurrentTask: true },
        }),

        // Blocked task: blocked_task=1, others=0
        createCandidate('blocked', 'task', {
          metadata: { contentType: 'prose', isBlockedTask: true },
        }),

        // Failed task: recent_failure=1, others=0
        createCandidate('failed', 'task', {
          metadata: { contentType: 'prose', hasFailure: true },
        }),

        // Successful task: recent_success=1, others=0
        createCandidate('success', 'task', {
          metadata: { contentType: 'prose', hasSuccess: true },
        }),

        // Task with evidence: evidence_presence=1, others=0
        createCandidate('evidenced', 'task', {
          metadata: { contentType: 'prose', hasEvidence: true },
        }),
      ];

      const config = createTestConfig();
      const result = rankCandidates(candidates, config);

      // Scores (base + dependency_proximity):
      // current: 10 + 2 = 12
      // blocked: 8 + 2 = 10
      // failed: 7 + 2 = 9
      // success: 6 + 2 = 8
      // evidenced: 4 + 2 = 6
      // phase: 5 + 2 = 7

      const scores = new Map(result.map(r => [r.id, r.score]));

      expect(scores.get('current')).toBe(12);
      expect(scores.get('blocked')).toBe(10);
      expect(scores.get('failed')).toBe(9);
      expect(scores.get('success')).toBe(8);
      expect(scores.get('phase1')).toBe(7);
      expect(scores.get('evidenced')).toBe(6);

      // Verify ordering
      expect(result[0].id).toBe('current');
      expect(result[1].id).toBe('blocked');
      expect(result[2].id).toBe('failed');
    });

    it('handles combination of features', () => {
      const candidates: ContextCandidate[] = [
        // Current + blocked + failed + success + evidence
        createCandidate('super_task', 'task', {
          metadata: {
            contentType: 'prose',
            isCurrentTask: true,
            isBlockedTask: true,
            hasFailure: true,
            hasSuccess: true,
            hasEvidence: true,
          },
        }),
        // Just current task
        createCandidate('current_only', 'task', {
          metadata: { contentType: 'prose', isCurrentTask: true },
        }),
      ];

      const config = createTestConfig();
      const result = rankCandidates(candidates, config);

      // super_task: 10 + 8 + 7 + 6 + 4 + 2 = 37
      expect(result[0].id).toBe('super_task');
      expect(result[0].score).toBe(10 + 8 + 7 + 6 + 4 + 2);

      // current_only: 10 + 2 = 12
      expect(result[1].id).toBe('current_only');
      expect(result[1].score).toBe(12);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty candidates', () => {
      const config = createTestConfig();
      const result = rankCandidates([], config);

      expect(result).toEqual([]);
    });

    it('produces deterministic order by priority when all scores are zero', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('c', 'task', { priority: 1 }),
        createCandidate('a', 'task', { priority: 3 }),
        createCandidate('b', 'task', { priority: 2 }),
      ];

      // Zero out all weights to make all scores equal (just dependency_proximity)
      const config = createTestConfig({
        weights: {
          phase: 0,
          current_task: 0,
          blocked_task: 0,
          recent_failure: 0,
          recent_success: 0,
          evidence_presence: 0,
          decision_recency: 0,
          dependency_proximity: 0, // Even this is 0, so all scores are 0
        },
      });

      const result = rankCandidates(candidates, config);

      // When all scores are 0, tie-break by priority DESC, then id ASC
      // a: priority=3, id='a'
      // b: priority=2, id='b'
      // c: priority=1, id='c'
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
      expect(result[2].id).toBe('c');

      // All scores should be 0
      result.forEach(r => expect(r.score).toBe(0));
    });

    it('uses id as final tie-breaker when scores and priority are equal', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('z', 'task', { priority: 5 }),
        createCandidate('a', 'task', { priority: 5 }),
        createCandidate('m', 'task', { priority: 5 }),
      ];

      // Zero out all weights except dependency_proximity (same for all)
      const config = createTestConfig({
        weights: {
          phase: 0,
          current_task: 0,
          blocked_task: 0,
          recent_failure: 0,
          recent_success: 0,
          evidence_presence: 0,
          decision_recency: 0,
          dependency_proximity: 1, // Same for all (depth=0), so score=1 for all
        },
      });

      const result = rankCandidates(candidates, config);

      // Same score (1), same priority (5), so sort by id ASC
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('m');
      expect(result[2].id).toBe('z');
    });

    it('handles candidates with undefined optional metadata', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('minimal', 'task', {
          metadata: { contentType: 'prose' }, // No optional fields
        }),
        createCandidate('full', 'task', {
          metadata: {
            contentType: 'prose',
            isCurrentTask: true,
            isBlockedTask: true,
            hasFailure: true,
            hasSuccess: true,
            hasEvidence: true,
            dependencyDepth: 0,
            decisionAgeHours: 12,
          },
        }),
      ];

      const config = createTestConfig();
      const result = rankCandidates(candidates, config);

      // Both should have valid scores
      expect(result).toHaveLength(2);
      expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it('handles negative age hours (treats as 0)', () => {
      const candidates: ContextCandidate[] = [
        createCandidate('negative_age', 'decision', {
          metadata: { contentType: 'prose', decisionAgeHours: -5 },
        }),
      ];

      const config = createTestConfig({
        weights: { ...createTestConfig().weights, decision_recency: 10 },
      });

      const result = rankCandidates(candidates, config);

      // Negative age should be treated as 0, so age_factor = 1
      expect(result[0].score).toBeCloseTo(10 + 2, 5); // decision_recency + dependency_proximity
    });
  });
});
