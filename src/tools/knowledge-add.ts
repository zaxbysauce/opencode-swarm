import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadPluginConfigWithMeta } from '../config';
import {
	appendKnowledge,
	enforceKnowledgeCap,
	findNearDuplicate,
	readKnowledge,
	resolveSwarmKnowledgePath,
} from '../hooks/knowledge-store.js';
import type {
	KnowledgeCategory,
	SwarmKnowledgeEntry,
} from '../hooks/knowledge-types.js';
import { validateLesson } from '../hooks/knowledge-validator.js';
import { loadPlan } from '../plan/manager.js';
import { warn } from '../utils';
import { createSwarmTool } from './create-tool.js';

const VALID_CATEGORIES: KnowledgeCategory[] = [
	'process',
	'architecture',
	'tooling',
	'security',
	'testing',
	'debugging',
	'performance',
	'integration',
	'todo',
	'other',
];

export const knowledge_add: ReturnType<typeof createSwarmTool> =
	createSwarmTool({
		description:
			'Store a new lesson in the knowledge base for future reference. The lesson will be available for retrieval via knowledge_recall.',
		args: {
			lesson: z
				.string()
				.min(15)
				.max(280)
				.describe('The lesson to store (15-280 characters)'),
			category: z
				.enum(VALID_CATEGORIES)
				.describe('Knowledge category for the lesson'),
			tags: z
				.array(z.string())
				.optional()
				.describe('Optional tags for better searchability'),
			scope: z
				.string()
				.optional()
				.describe('Scope of the lesson (global or stack:<name>)'),
		},
		execute: async (args: unknown, directory: string): Promise<string> => {
			// Safe args extraction
			let lessonInput: unknown;
			let categoryInput: unknown;
			let tagsInput: unknown;
			let scopeInput: unknown;

			try {
				if (args && typeof args === 'object') {
					const obj = args as Record<string, unknown>;
					lessonInput = obj.lesson;
					categoryInput = obj.category;
					tagsInput = obj.tags;
					scopeInput = obj.scope;
				}
			} catch {
				// Malicious getter threw
			}

			// Validate lesson
			if (typeof lessonInput !== 'string') {
				return JSON.stringify({
					success: false,
					error: 'lesson must be a string',
				});
			}
			const lesson = lessonInput as string;
			if (lesson.length < 15 || lesson.length > 280) {
				return JSON.stringify({
					success: false,
					error: 'lesson must be between 15 and 280 characters',
				});
			}

			// Validate category
			if (typeof categoryInput !== 'string') {
				return JSON.stringify({
					success: false,
					error: 'category must be a string',
				});
			}
			const category = categoryInput as KnowledgeCategory;
			if (!VALID_CATEGORIES.includes(category)) {
				return JSON.stringify({
					success: false,
					error: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
				});
			}

			// Parse tags (optional, default to empty array)
			let tags: string[] = [];
			if (tagsInput !== undefined) {
				if (Array.isArray(tagsInput)) {
					tags = tagsInput
						.filter((t): t is string => typeof t === 'string')
						.slice(0, 20); // cap at 20 tags
				}
			}

			// Parse scope (optional, default to 'global')
			const scope =
				typeof scopeInput === 'string' && scopeInput.length > 0
					? scopeInput
					: 'global';

			// Derive project_name from plan title
			let project_name = '';
			try {
				const plan = await loadPlan(directory);
				project_name = plan?.title ?? '';
			} catch {
				// plan load failure must not prevent knowledge storage
			}

			// Construct the entry
			const entry: SwarmKnowledgeEntry = {
				id: randomUUID(),
				tier: 'swarm',
				lesson,
				category,
				tags,
				scope,
				confidence: 0.5,
				status: 'candidate',
				confirmed_by: [],
				project_name,
				retrieval_outcomes: {
					applied_count: 0,
					succeeded_after_count: 0,
					failed_after_count: 0,
				},
				schema_version: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				auto_generated: false,
				hive_eligible: false,
			};

			// Load config for validation and dedup threshold
			let dedupThreshold = 0.6; // default
			try {
				const { config } = loadPluginConfigWithMeta(directory);
				dedupThreshold = config.knowledge?.dedup_threshold ?? 0.6;

				// Validate lesson if validation_enabled is set in config
				if (config.knowledge?.validation_enabled !== false) {
					const validation = validateLesson(lesson, [], {
						category,
						scope,
						confidence: 0.5,
					});
					if (!validation.valid) {
						return JSON.stringify({
							success: false,
							error: `Validation failed: ${validation.reason}`,
						});
					}
				}
			} catch {
				// Config load failure should not block knowledge storage
			}

			// Near-duplicate detection using configured threshold
			try {
				const existingEntries = await readKnowledge<SwarmKnowledgeEntry>(
					resolveSwarmKnowledgePath(directory),
				);
				const duplicate = findNearDuplicate(lesson, existingEntries, dedupThreshold);
				if (duplicate) {
					return JSON.stringify({
						success: false,
						id: duplicate.id,
						message: 'near-duplicate of existing entry',
					});
				}
			} catch (err) {
				// Read failure should not block knowledge storage, but log a warning
				// so silent dedup bypass doesn't accumulate near-duplicates unnoticed.
				warn(
					'knowledge_add: dedup check failed — skipping near-duplicate detection',
					err,
				);
			}

			// Append to knowledge store
			try {
				const { config } = loadPluginConfigWithMeta(directory);
				await appendKnowledge(resolveSwarmKnowledgePath(directory), entry);
				// Enforce knowledge cap after append using configured max_entries
				const maxEntries = config.knowledge?.swarm_max_entries ?? 100;
				await enforceKnowledgeCap(resolveSwarmKnowledgePath(directory), maxEntries);
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Unknown error';
				return JSON.stringify({
					success: false,
					error: message,
				});
			}

			return JSON.stringify({
				success: true,
				id: entry.id,
				category,
			});
		},
	});
