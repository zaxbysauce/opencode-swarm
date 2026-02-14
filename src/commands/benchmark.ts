import { listEvidenceTaskIds, loadEvidence } from '../evidence/manager';
import { swarmState } from '../state';

const CI = {
	review_pass_rate: 70,
	test_pass_rate: 80,
	max_agent_error_rate: 20,
	max_hard_limit_hits: 1,
};

export async function handleBenchmarkCommand(
	directory: string,
	args: string[],
): Promise<string> {
	let cumulative = args.includes('--cumulative');
	if (args.includes('--ci-gate')) cumulative = true;
	const mode: 'in-memory' | 'cumulative' = cumulative
		? 'cumulative'
		: 'in-memory';

	// Agent health
	const agentMap = new Map<
		string,
		{ toolCalls: number; hardLimits: number; warnings: number }
	>();
	for (const [, s] of swarmState.agentSessions) {
		const e = agentMap.get(s.agentName) || {
			toolCalls: 0,
			hardLimits: 0,
			warnings: 0,
		};
		e.toolCalls += s.toolCallCount;
		if (s.hardLimitHit) e.hardLimits++;
		if (s.warningIssued) e.warnings++;
		agentMap.set(s.agentName, e);
	}
	const agentHealth = Array.from(agentMap.entries()).map(([a, v]) => ({
		agent: a,
		...v,
	}));

	// Tool perf
	const toolPerf: Array<{
		tool: string;
		calls: number;
		successRate: number;
		avg: number;
	}> = [];
	for (const [, a] of swarmState.toolAggregates) {
		const successRate = a.count ? (a.successCount / a.count) * 100 : 0;
		toolPerf.push({
			tool: a.tool,
			calls: a.count,
			successRate: Math.round(successRate * 10) / 10,
			avg: a.count ? Math.round(a.totalDuration / a.count) : 0,
		});
	}
	toolPerf.sort((a, b) => b.calls - a.calls);

	// Delegations
	let delegationCount = 0;
	for (const c of swarmState.delegationChains.values())
		delegationCount += c.length;

	// Cumulative
	let quality:
		| {
				reviewPassRate: number | null;
				testPassRate: number | null;
				totalReviews: number;
				testsPassed: number;
				testsFailed: number;
				additions: number;
				deletions: number;
		  }
		| undefined;
	if (cumulative) {
		let reviewPasses = 0,
			reviewFails = 0,
			testPasses = 0,
			testFails = 0,
			additions = 0,
			deletions = 0;
		for (const tid of await listEvidenceTaskIds(directory)) {
			const b = await loadEvidence(directory, tid);
			if (!b) continue;
			for (const e of b.entries) {
				if (e.type === 'review') {
					if (e.verdict === 'approved') reviewPasses++;
					else if (e.verdict === 'rejected') reviewFails++;
				} else if (e.type === 'test') {
					testPasses += e.tests_passed;
					testFails += e.tests_failed;
				} else if (e.type === 'diff') {
					additions += e.additions;
					deletions += e.deletions;
				}
			}
		}
		const totalReviews = reviewPasses + reviewFails,
			totalTests = testPasses + testFails;
		quality = {
			reviewPassRate: totalReviews
				? Math.round((reviewPasses / totalReviews) * 1000) / 10
				: null,
			testPassRate: totalTests
				? Math.round((testPasses / totalTests) * 1000) / 10
				: null,
			totalReviews,
			testsPassed: testPasses,
			testsFailed: testFails,
			additions,
			deletions,
		};
	}

	// CI gate
	let ciGate:
		| {
				passed: boolean;
				checks: {
					name: string;
					value: number;
					threshold: number;
					operator: string;
					passed: boolean;
				}[];
		  }
		| undefined;
	if (args.includes('--ci-gate')) {
		let totalCalls = 0,
			totalFailures = 0;
		for (const [, a] of swarmState.toolAggregates) {
			totalCalls += a.count;
			totalFailures += a.failureCount;
		}
		const agentErrorRate = totalCalls ? (totalFailures / totalCalls) * 100 : 0;
		let maxHardLimits = 0;
		for (const v of agentMap.values())
			if (v.hardLimits > maxHardLimits) maxHardLimits = v.hardLimits;
		const checks = [
			{
				name: 'Review pass rate',
				value: quality?.reviewPassRate ?? 0,
				threshold: CI.review_pass_rate,
				operator: '>=',
				passed: (quality?.reviewPassRate ?? 0) >= CI.review_pass_rate,
			},
			{
				name: 'Test pass rate',
				value: quality?.testPassRate ?? 0,
				threshold: CI.test_pass_rate,
				operator: '>=',
				passed: (quality?.testPassRate ?? 0) >= CI.test_pass_rate,
			},
			{
				name: 'Agent error rate',
				value: Math.round(agentErrorRate * 10) / 10,
				threshold: CI.max_agent_error_rate,
				operator: '<=',
				passed: agentErrorRate <= CI.max_agent_error_rate,
			},
			{
				name: 'Hard limit hits',
				value: maxHardLimits,
				threshold: CI.max_hard_limit_hits,
				operator: '<=',
				passed: maxHardLimits <= CI.max_hard_limit_hits,
			},
		];
		ciGate = { passed: checks.every((c) => c.passed), checks: checks };
	}

	// Output
	const lines: string[] = [
		`## Swarm Benchmark (mode: ${mode})`,
		'',
		'### Agent Health',
	];
	if (!agentHealth.length) lines.push('No agent sessions recorded');
	else
		for (const { agent, toolCalls, hardLimits, warnings } of agentHealth) {
			const parts = [`${toolCalls} tool calls`];
			if (warnings > 0)
				parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
			parts.push(
				hardLimits
					? `${hardLimits} hard limit hit${hardLimits > 1 ? 's' : ''}`
					: '0 hard limits',
			);
			lines.push(
				`- ${hardLimits ? '⚠️' : '✅'} **${agent}**: ${parts.join(', ')}`,
			);
		}
	lines.push('', '### Tool Performance');
	if (!toolPerf.length) lines.push('No tool data recorded');
	else {
		lines.push(
			'| Tool | Calls | Success Rate | Avg Duration |',
			'|------|-------|-------------|-------------|',
		);
		for (const { tool, calls, successRate, avg } of toolPerf)
			lines.push(`| ${tool} | ${calls} | ${successRate}% | ${avg}ms |`);
	}
	lines.push(
		'',
		'### Delegations',
		delegationCount
			? `Total: ${delegationCount} delegations`
			: 'No delegations recorded',
		'',
	);

	if (quality) {
		lines.push('### Quality Signals');
		if (!quality.totalReviews && !quality.testsPassed && !quality.additions)
			lines.push('No evidence data found');
		else {
			if (quality.reviewPassRate !== null)
				lines.push(
					`- Review pass rate: ${quality.reviewPassRate}% (${quality.totalReviews}) ${quality.reviewPassRate >= 70 ? '✅' : '❌'}`,
				);
			else lines.push('- Review pass rate: N/A (no reviews)');
			if (quality.testPassRate !== null)
				lines.push(
					`- Test pass rate: ${quality.testPassRate}% (${quality.testsPassed}/${quality.testsPassed + quality.testsFailed}) ${quality.testPassRate >= 80 ? '✅' : '❌'}`,
				);
			else lines.push('- Test pass rate: N/A (no tests)');
			lines.push(
				`- Code churn: +${quality.additions} / -${quality.deletions} lines`,
			);
		}
		lines.push('');
	}

	if (ciGate) {
		lines.push('### CI Gate', ciGate.passed ? '✅ PASSED' : '❌ FAILED');
		for (const c of ciGate.checks)
			lines.push(
				`- ${c.name}: ${c.value}% ${c.operator} ${c.threshold}% ${c.passed ? '✅' : '❌'}`,
			);
		lines.push('');
	}

	const json: Record<string, unknown> = {
		mode,
		timestamp: new Date().toISOString(),
		agent_health: agentHealth.map((a) => ({
			agent: a.agent,
			tool_calls: a.toolCalls,
			hard_limit_hits: a.hardLimits,
			warnings: a.warnings,
		})),
		tool_performance: toolPerf.map((t) => ({
			tool: t.tool,
			calls: t.calls,
			success_rate: t.successRate,
			avg_duration_ms: t.avg,
		})),
		delegations: delegationCount,
	};
	if (quality)
		json.quality = {
			review_pass_rate: quality.reviewPassRate,
			test_pass_rate: quality.testPassRate,
			total_reviews: quality.totalReviews,
			total_tests_passed: quality.testsPassed,
			total_tests_failed: quality.testsFailed,
			additions: quality.additions,
			deletions: quality.deletions,
		};
	if (ciGate)
		json.ci_gate = {
			passed: ciGate.passed,
			checks: ciGate.checks.map((c) => ({
				name: c.name,
				value: c.value,
				threshold: c.threshold,
				operator: c.operator as '>=' | '<=',
				passed: c.passed,
			})),
		};
	lines.push(
		'[BENCHMARK_JSON]',
		JSON.stringify(json, null, 2),
		'[/BENCHMARK_JSON]',
	);
	return lines.join('\n');
}
