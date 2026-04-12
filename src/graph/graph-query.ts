import type {
	BlastRadiusResult,
	FileNode,
	FileReference,
	LocalizationBlock,
	RepoGraph,
	SymbolReference,
} from './types';

/**
 * Query API for the repo graph.
 *
 * All functions accept normalized RELATIVE forward-slash paths and return the
 * same. Callers responsible for normalizing input paths (helper provided).
 */

export function normalizeGraphPath(p: string): string {
	return p.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

/** Build an in-memory reverse index: target → list of importing edges. */
function buildReverseIndex(graph: RepoGraph): Map<string, FileReference[]> {
	const reverse = new Map<string, FileReference[]>();
	for (const node of Object.values(graph.files)) {
		for (const edge of node.imports) {
			if (!edge.target) continue;
			const list = reverse.get(edge.target);
			const ref: FileReference = {
				file: edge.source,
				line: edge.line,
				importType: edge.importType,
			};
			if (list) list.push(ref);
			else reverse.set(edge.target, [ref]);
		}
	}
	return reverse;
}

let cachedReverseIndex: {
	graph: RepoGraph;
	index: Map<string, FileReference[]>;
} | null = null;

function getReverseIndex(graph: RepoGraph): Map<string, FileReference[]> {
	if (cachedReverseIndex && cachedReverseIndex.graph === graph) {
		return cachedReverseIndex.index;
	}
	const index = buildReverseIndex(graph);
	cachedReverseIndex = { graph, index };
	return index;
}

/**
 * Files that import the given file (direct dependents).
 */
export function getImporters(
	graph: RepoGraph,
	filePath: string,
): FileReference[] {
	const target = normalizeGraphPath(filePath);
	return getReverseIndex(graph).get(target) ?? [];
}

/**
 * Files this file imports (direct dependencies, resolved targets only).
 */
export function getDependencies(
	graph: RepoGraph,
	filePath: string,
): FileReference[] {
	const target = normalizeGraphPath(filePath);
	const node = graph.files[target];
	if (!node) return [];
	const out: FileReference[] = [];
	for (const edge of node.imports) {
		if (!edge.target) continue;
		out.push({
			file: edge.target,
			line: edge.line,
			importType: edge.importType,
		});
	}
	return out;
}

/**
 * Find all importers of a specific exported symbol from a file.
 */
export function getSymbolConsumers(
	graph: RepoGraph,
	filePath: string,
	symbolName: string,
): SymbolReference[] {
	const target = normalizeGraphPath(filePath);
	const out: SymbolReference[] = [];
	for (const node of Object.values(graph.files)) {
		for (const edge of node.imports) {
			if (edge.target !== target) continue;
			if (edge.importType === 'namespace' || edge.importType === 'sideeffect') {
				// We can't tell from the import alone which named symbols are used.
				// Record a single namespace-style reference so the caller still sees the file.
				if (edge.importType === 'namespace') {
					out.push({
						file: edge.source,
						line: edge.line,
						importedAs: '*',
					});
				}
				continue;
			}
			if (edge.importedSymbols.includes(symbolName)) {
				out.push({
					file: edge.source,
					line: edge.line,
					importedAs: symbolName,
				});
			}
		}
	}
	return out;
}

/**
 * Compute the transitive blast radius of changing one or more files.
 *
 * Performs a BFS over the reverse-edge index up to `maxDepth` levels.
 */
export function getBlastRadius(
	graph: RepoGraph,
	filePaths: string[],
	maxDepth = 3,
): BlastRadiusResult {
	const reverse = getReverseIndex(graph);
	const targets = filePaths.map(normalizeGraphPath);
	const visited = new Set<string>(targets);
	const direct = new Set<string>();
	const transitive = new Set<string>();
	// `maxDepth <= 0` means "do not explore" — return an empty radius so we
	// don't visit direct importers AND falsely report depthReached=1.
	if (maxDepth <= 0) {
		return {
			target: targets,
			directDependents: [],
			transitiveDependents: [],
			depthReached: 0,
			totalDependents: 0,
			riskLevel: classifyRisk(0),
		};
	}
	let queue: Array<{ file: string; depth: number }> = targets.map((file) => ({
		file,
		depth: 0,
	}));
	let depthReached = 0;
	while (queue.length > 0) {
		const next: typeof queue = [];
		for (const { file, depth } of queue) {
			const importers = reverse.get(file) ?? [];
			for (const ref of importers) {
				if (visited.has(ref.file)) continue;
				visited.add(ref.file);
				if (depth === 0) direct.add(ref.file);
				else transitive.add(ref.file);
				if (depth + 1 > depthReached) depthReached = depth + 1;
				if (depth + 1 >= maxDepth) continue;
				next.push({ file: ref.file, depth: depth + 1 });
			}
		}
		queue = next;
	}
	const total = direct.size + transitive.size;
	return {
		target: targets,
		directDependents: [...direct].sort(),
		transitiveDependents: [...transitive].sort(),
		depthReached,
		totalDependents: total,
		riskLevel: classifyRisk(total),
	};
}

function classifyRisk(count: number): BlastRadiusResult['riskLevel'] {
	if (count === 0) return 'low';
	if (count <= 3) return 'low';
	if (count <= 10) return 'medium';
	if (count <= 25) return 'high';
	return 'critical';
}

/**
 * Top-N most-imported files (by in-degree) — useful for surfacing
 * architectural pillars.
 */
export function getKeyFiles(graph: RepoGraph, topN = 10): FileNode[] {
	const reverse = getReverseIndex(graph);
	const scored = Object.values(graph.files).map((node) => ({
		node,
		inDegree: reverse.get(node.path)?.length ?? 0,
	}));
	scored.sort((a, b) => {
		if (b.inDegree !== a.inDegree) return b.inDegree - a.inDegree;
		return a.node.path.localeCompare(b.node.path);
	});
	return scored.slice(0, topN).map((s) => s.node);
}

/**
 * Build a compact localization block for a single file. This is the primary
 * payload injected into the coder agent's pre-edit context.
 */
export function getLocalizationContext(
	graph: RepoGraph,
	filePath: string,
	options: { maxImporters?: number; maxDeps?: number; maxDepth?: number } = {},
): LocalizationBlock {
	const target = normalizeGraphPath(filePath);
	const importers = getImporters(graph, target);
	const dependencies = getDependencies(graph, target);
	const blast = getBlastRadius(graph, [target], options.maxDepth ?? 2);

	const node = graph.files[target];
	const externalSymbols = collectExternallyUsedSymbols(graph, target, node);

	const summary = formatSummary({
		target,
		importers,
		dependencies,
		blast,
		externalSymbols,
		maxImporters: options.maxImporters ?? 5,
		maxDeps: options.maxDeps ?? 5,
	});

	return {
		target,
		importerCount: importers.length,
		importers: importers.slice(0, options.maxImporters ?? 5),
		dependencyCount: dependencies.length,
		dependencies: dependencies.slice(0, options.maxDeps ?? 5),
		exportedSymbolsUsedExternally: externalSymbols,
		blastRadius: blast,
		summary,
	};
}

function collectExternallyUsedSymbols(
	graph: RepoGraph,
	target: string,
	node: FileNode | undefined,
): string[] {
	const exportedNames = new Set((node?.exports ?? []).map((s) => s.name));
	const used = new Set<string>();
	for (const otherNode of Object.values(graph.files)) {
		for (const edge of otherNode.imports) {
			if (edge.target !== target) continue;
			for (const sym of edge.importedSymbols) {
				if (exportedNames.has(sym)) used.add(sym);
			}
		}
	}
	return [...used].sort();
}

function formatSummary(opts: {
	target: string;
	importers: FileReference[];
	dependencies: FileReference[];
	blast: BlastRadiusResult;
	externalSymbols: string[];
	maxImporters: number;
	maxDeps: number;
}): string {
	const {
		target,
		importers,
		dependencies,
		blast,
		externalSymbols,
		maxImporters,
		maxDeps,
	} = opts;

	const importerList =
		importers.length === 0
			? '(none)'
			: importers
					.slice(0, maxImporters)
					.map((r) => r.file)
					.join(', ') +
				(importers.length > maxImporters
					? `, +${importers.length - maxImporters} more`
					: '');
	const depList =
		dependencies.length === 0
			? '(none)'
			: dependencies
					.slice(0, maxDeps)
					.map((r) => r.file)
					.join(', ') +
				(dependencies.length > maxDeps
					? `, +${dependencies.length - maxDeps} more`
					: '');
	const symbolList =
		externalSymbols.length === 0
			? '(none used externally)'
			: externalSymbols.slice(0, 8).join(', ') +
				(externalSymbols.length > 8
					? `, +${externalSymbols.length - 8} more`
					: '');

	const lines = [
		`LOCALIZATION CONTEXT`,
		`  Target: ${target}`,
		`  Imported by (${importers.length}): ${importerList}`,
		`  Imports (${dependencies.length}): ${depList}`,
		`  Exports used externally: ${symbolList}`,
		`  Blast radius: ${blast.totalDependents} files (${blast.riskLevel} risk)`,
	];
	return lines.join('\n');
}

/** Reset the cached reverse index. Call this when a graph is mutated in place. */
export function resetQueryCache(): void {
	cachedReverseIndex = null;
}
