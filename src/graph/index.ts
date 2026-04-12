/**
 * Repo graph: structural codebase awareness for swarm agents.
 *
 * Public surface:
 *   - Types (RepoGraph, FileNode, ImportEdge, ExportedSymbol, ...)
 *   - Builders (buildRepoGraph, processFile, findSourceFiles)
 *   - Store (loadGraph, saveGraph, buildAndSaveGraph, updateGraphIncremental, isGraphFresh, getGraphPath)
 *   - Query (getImporters, getDependencies, getSymbolConsumers, getBlastRadius,
 *            getKeyFiles, getLocalizationContext, normalizeGraphPath, resetQueryCache)
 */

export * from './types';
export {
	SOURCE_EXTENSIONS,
	extractImports,
	getLanguageFromExtension,
} from './import-extractor';
export { extractExportedSymbols } from './symbol-extractor';
export {
	type BuildOptions,
	buildRepoGraph,
	findSourceFiles,
	processFile,
} from './graph-builder';
export {
	buildAndSaveGraph,
	getGraphPath,
	isGraphFresh,
	loadGraph,
	saveGraph,
	updateGraphIncremental,
} from './graph-store';
export {
	getBlastRadius,
	getDependencies,
	getImporters,
	getKeyFiles,
	getLocalizationContext,
	getSymbolConsumers,
	normalizeGraphPath,
	resetQueryCache,
} from './graph-query';
