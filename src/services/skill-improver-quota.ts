/**
 * Skill-improver daily-quota tracker.
 *
 * State file: .swarm/skill-improver-quota.json
 * Counts every LLM-credentialed call by the skill_improver agent.
 * The window is configurable: 'utc' (default) resets at 00:00 UTC; 'local'
 * resets at the host's local midnight.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import lockfile from 'proper-lockfile';

export type QuotaWindow = 'utc' | 'local';

export interface QuotaState {
	/** YYYY-MM-DD in the chosen window */
	date: string;
	calls_used: number;
	max_calls: number;
	last_run_at?: string;
	window: QuotaWindow;
}

export function resolveQuotaPath(directory: string): string {
	return path.join(directory, '.swarm', 'skill-improver-quota.json');
}

export function todayKey(window: QuotaWindow, now: Date = new Date()): string {
	if (window === 'utc') {
		return now.toISOString().slice(0, 10);
	}
	const yr = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${yr}-${m}-${d}`;
}

async function readState(filePath: string): Promise<QuotaState | null> {
	if (!existsSync(filePath)) return null;
	try {
		const raw = await readFile(filePath, 'utf-8');
		const parsed = JSON.parse(raw) as Partial<QuotaState>;
		if (
			typeof parsed.date !== 'string' ||
			typeof parsed.calls_used !== 'number' ||
			typeof parsed.max_calls !== 'number' ||
			(parsed.window !== 'utc' && parsed.window !== 'local')
		) {
			return null;
		}
		return parsed as QuotaState;
	} catch {
		return null;
	}
}

async function writeState(filePath: string, state: QuotaState): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	const tmp = `${filePath}.tmp-${process.pid}`;
	await writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
	await rename(tmp, filePath);
}

export interface QuotaCheckOptions {
	maxCalls: number;
	window: QuotaWindow;
	now?: Date;
}

export interface QuotaCheckResult {
	allowed: boolean;
	state: QuotaState;
	reason?: string;
}

/** Read the quota state, rolling over the day if needed. Does not increment. */
export async function getQuotaState(
	directory: string,
	opts: QuotaCheckOptions,
): Promise<QuotaState> {
	const filePath = resolveQuotaPath(directory);
	const today = todayKey(opts.window, opts.now);
	const existing = await readState(filePath);
	if (!existing || existing.date !== today || existing.window !== opts.window) {
		const fresh: QuotaState = {
			date: today,
			calls_used: 0,
			max_calls: opts.maxCalls,
			window: opts.window,
		};
		// Persist on rollover so subsequent reads are stable.
		await writeState(filePath, fresh);
		return fresh;
	}
	// Caller's max may have increased / decreased; surface the live limit.
	return { ...existing, max_calls: opts.maxCalls };
}

/**
 * Atomically reserve `nCalls` quota slots, holding a directory-level lockfile
 * for the read-modify-write so parallel skill_improve invocations cannot
 * lost-update each other. Returns { allowed: false } and leaves state
 * unchanged if the reservation would exceed max_calls.
 */
export async function reserveQuota(
	directory: string,
	opts: QuotaCheckOptions & { nCalls: number },
): Promise<QuotaCheckResult> {
	const filePath = resolveQuotaPath(directory);
	await mkdir(path.dirname(filePath), { recursive: true });
	let release: (() => Promise<void>) | null = null;
	try {
		release = await lockfile.lock(path.dirname(filePath), {
			retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
			stale: 5000,
		});
		const state = await getQuotaState(directory, opts);
		if (state.calls_used + opts.nCalls > opts.maxCalls) {
			return {
				allowed: false,
				state,
				reason: `daily quota exhausted: used=${state.calls_used} requested=${opts.nCalls} max=${opts.maxCalls}`,
			};
		}
		const next: QuotaState = {
			...state,
			calls_used: state.calls_used + opts.nCalls,
			max_calls: opts.maxCalls,
			last_run_at: (opts.now ?? new Date()).toISOString(),
		};
		await writeState(filePath, next);
		return { allowed: true, state: next };
	} finally {
		if (release) {
			try {
				await release();
			} catch {
				/* lock release failures are non-blocking */
			}
		}
	}
}

/**
 * Release `nCalls` previously-reserved quota slots. Floors at zero. Used by
 * the skill_improver service when an LLM call fails BEFORE any network I/O
 * (e.g. delegate construction error, no client wired). Once network I/O has
 * begun, the slot stays consumed — see runSkillImprover for the policy.
 */
export async function releaseQuota(
	directory: string,
	opts: QuotaCheckOptions & { nCalls: number },
): Promise<QuotaState> {
	const filePath = resolveQuotaPath(directory);
	await mkdir(path.dirname(filePath), { recursive: true });
	let release: (() => Promise<void>) | null = null;
	try {
		release = await lockfile.lock(path.dirname(filePath), {
			retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
			stale: 5000,
		});
		const state = await getQuotaState(directory, opts);
		const next: QuotaState = {
			...state,
			calls_used: Math.max(0, state.calls_used - opts.nCalls),
			max_calls: opts.maxCalls,
		};
		await writeState(filePath, next);
		return next;
	} finally {
		if (release) {
			try {
				await release();
			} catch {
				/* non-blocking */
			}
		}
	}
}

export const _internals = {
	resolveQuotaPath,
	todayKey,
	getQuotaState,
	reserveQuota,
	releaseQuota,
};
