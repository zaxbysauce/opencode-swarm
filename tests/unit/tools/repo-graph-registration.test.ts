import {
	AGENT_TOOL_MAP,
	TOOL_DESCRIPTIONS,
} from '../../../src/config/constants';
import {
	buildWorkspaceGraph,
	type GraphEdge,
	type GraphNode,
	loadGraph,
	loadOrCreateGraph,
	type RepoGraph,
	resolveModuleSpecifier,
	saveGraph,
} from '../../../src/tools/index';
import { TOOL_NAME_SET, TOOL_NAMES } from '../../../src/tools/tool-names';

describe('repo_graph tool registration', () => {
	describe('barrel exports from src/tools/index', () => {
		test('buildWorkspaceGraph is defined', () => {
			expect(typeof buildWorkspaceGraph).toBe('function');
		});

		test('resolveModuleSpecifier is defined', () => {
			expect(typeof resolveModuleSpecifier).toBe('function');
		});

		test('loadGraph is defined', () => {
			expect(typeof loadGraph).toBe('function');
		});

		test('saveGraph is defined', () => {
			expect(typeof saveGraph).toBe('function');
		});

		test('loadOrCreateGraph is defined', () => {
			expect(typeof loadOrCreateGraph).toBe('function');
		});

		test('RepoGraph type is exported', () => {
			// Type-only export - verify it can be used as a type annotation
			const _graph: RepoGraph | undefined = undefined;
			expect(true).toBe(true);
		});

		test('GraphNode type is exported', () => {
			const _node: GraphNode | undefined = undefined;
			expect(true).toBe(true);
		});

		test('GraphEdge type is exported', () => {
			const _edge: GraphEdge | undefined = undefined;
			expect(true).toBe(true);
		});
	});
});
