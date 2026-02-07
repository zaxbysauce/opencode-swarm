import { describe, it, expect } from 'bun:test';
import {
    QA_AGENTS,
    PIPELINE_AGENTS,
    ORCHESTRATOR_NAME,
    ALL_SUBAGENT_NAMES,
    ALL_AGENT_NAMES,
    DEFAULT_MODELS,
    isQAAgent,
    isSubagent,
} from '../../../src/config/constants';

describe('constants.ts', () => {
    describe('QA_AGENTS', () => {
        it('contains exactly reviewer and critic', () => {
            expect(QA_AGENTS).toEqual(['reviewer', 'critic']);
            expect(QA_AGENTS).toHaveLength(2);
        });
    });

    describe('PIPELINE_AGENTS', () => {
        it('contains exactly explorer, coder, and test_engineer', () => {
            expect(PIPELINE_AGENTS).toEqual(['explorer', 'coder', 'test_engineer']);
            expect(PIPELINE_AGENTS).toHaveLength(3);
        });
    });

    describe('ALL_SUBAGENT_NAMES', () => {
        it('contains all 6 subagents (sme + QA + pipeline)', () => {
            const expected = ['sme', 'reviewer', 'critic', 'explorer', 'coder', 'test_engineer'];
            expect(ALL_SUBAGENT_NAMES).toEqual(expected);
            expect(ALL_SUBAGENT_NAMES).toHaveLength(6);
        });
    });

    describe('ALL_AGENT_NAMES', () => {
        it('contains architect + all 6 subagents = 7 total', () => {
            const expected = ['architect', 'sme', 'reviewer', 'critic', 'explorer', 'coder', 'test_engineer'];
            expect(ALL_AGENT_NAMES).toEqual(expected);
            expect(ALL_AGENT_NAMES).toHaveLength(7);
        });
    });

    describe('ORCHESTRATOR_NAME', () => {
        it("is 'architect'", () => {
            expect(ORCHESTRATOR_NAME).toBe('architect');
        });
    });

    describe('isQAAgent()', () => {
        it('returns true for reviewer and critic', () => {
            expect(isQAAgent('reviewer')).toBe(true);
            expect(isQAAgent('critic')).toBe(true);
        });

        it('returns false for non-QA agents', () => {
            expect(isQAAgent('coder')).toBe(false);
            expect(isQAAgent('explorer')).toBe(false);
            expect(isQAAgent('architect')).toBe(false);
            expect(isQAAgent('sme')).toBe(false);
            expect(isQAAgent('test_engineer')).toBe(false);
        });
    });

    describe('isSubagent()', () => {
        it('returns true for all 6 subagent names', () => {
            expect(isSubagent('sme')).toBe(true);
            expect(isSubagent('reviewer')).toBe(true);
            expect(isSubagent('critic')).toBe(true);
            expect(isSubagent('explorer')).toBe(true);
            expect(isSubagent('coder')).toBe(true);
            expect(isSubagent('test_engineer')).toBe(true);
        });

        it('returns false for architect', () => {
            expect(isSubagent('architect')).toBe(false);
        });

        it('returns false for arbitrary strings', () => {
            expect(isSubagent('unknown')).toBe(false);
            expect(isSubagent('')).toBe(false);
            expect(isSubagent('fake_agent')).toBe(false);
        });
    });

    describe('DEFAULT_MODELS', () => {
        it('has entries for all agents in ALL_AGENT_NAMES', () => {
            for (const agent of ALL_AGENT_NAMES) {
                expect(DEFAULT_MODELS).toHaveProperty(agent);
                expect(typeof DEFAULT_MODELS[agent]).toBe('string');
            }
        });

        it('has a default fallback entry', () => {
            expect(DEFAULT_MODELS).toHaveProperty('default');
            expect(typeof DEFAULT_MODELS.default).toBe('string');
        });

        it('all values are non-empty strings', () => {
            for (const [agent, model] of Object.entries(DEFAULT_MODELS)) {
                expect(typeof model).toBe('string');
                expect(model.length).toBeGreaterThan(0);
            }
        });

        it('has exactly 8 entries (7 agents + default)', () => {
            expect(Object.keys(DEFAULT_MODELS)).toHaveLength(8);
        });
    });
});