import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolContext, tool } from '@opencode-ai/plugin';
import { type ASTDiffResult, computeASTDiff } from '../diff/ast-diff.js';
import {
	type ChangeCategory,
	classifyChanges,
	type RiskLevel,
} from '../diff/semantic-classifier.js';
import { generateSummary } from '../diff/summary-generator.js';
import { createSwarmTool } from './create-tool';

const MAX_BUFFER_BYTES = 5 * 1024 * 1024;

export interface DiffSummaryArgs {
	files: string[];
	classification?: ChangeCategory;
	riskLevel?: RiskLevel;
}

interface DiffSummaryError {
	error: string;
	success: false;
}

/**
 * Standalone tool that wraps the semantic classifier + summary generator
 * to produce a filtered SemanticDiffSummary.
 */
export const diff_summary: ReturnType<typeof createSwarmTool> = createSwarmTool(
	{
		description:
			'Generate a filtered semantic diff summary from AST analysis. Returns SemanticDiffSummary with optional filtering by classification or riskLevel.',
		args: {
			files: tool.schema
				.array(tool.schema.string())
				.describe('Array of file paths to analyze'),
			classification: tool.schema
				.string()
				.optional()
				.describe('Filter results to only this ChangeCategory'),
			riskLevel: tool.schema
				.string()
				.optional()
				.describe('Filter results to only this RiskLevel'),
		},
		async execute(
			args: unknown,
			directory: string,
			_ctx?: ToolContext,
		): Promise<string> {
			const typedArgs = args as DiffSummaryArgs;

			try {
				// Validate files array
				if (
					!typedArgs.files ||
					!Array.isArray(typedArgs.files) ||
					typedArgs.files.length === 0
				) {
					const errorResult: DiffSummaryError = {
						error: 'files must be a non-empty array of file paths',
						success: false,
					};
					return JSON.stringify(errorResult, null, 2);
				}

				const workingDir = directory || process.cwd();

				// Get old content from HEAD and new content from working tree for each file
				const astDiffs: ASTDiffResult[] = [];

				for (const filePath of typedArgs.files) {
					try {
						// Get old content from HEAD
						const oldContent = child_process.execFileSync(
							'git',
							['show', `HEAD:${filePath}`],
							{
								encoding: 'utf-8',
								timeout: 5000,
								cwd: workingDir,
							},
						);

						// Get new content from working tree (read directly from disk)
						const newContent = fs.readFileSync(
							path.join(workingDir, filePath),
							'utf-8',
						);

						const astResult = await computeASTDiff(
							filePath,
							oldContent,
							newContent,
						);

						if (astResult && astResult.changes.length > 0) {
							astDiffs.push(astResult);
						}
					} catch {
						// File not in git or AST diff failed — skip this file
					}
				}

				// Classify all changes
				const allClassifiedChanges = classifyChanges(astDiffs);

				// Apply filters if provided
				let filteredChanges = allClassifiedChanges;

				if (typedArgs.classification) {
					filteredChanges = filteredChanges.filter(
						(change) => change.category === typedArgs.classification,
					);
				}

				if (typedArgs.riskLevel) {
					filteredChanges = filteredChanges.filter(
						(change) => change.riskLevel === typedArgs.riskLevel,
					);
				}

				// Generate summary from filtered changes
				const summary = generateSummary(filteredChanges);

				return JSON.stringify(summary, null, 2);
			} catch (e) {
				const errorResult: DiffSummaryError = {
					error:
						e instanceof Error
							? `diff_summary failed: ${e.message}`
							: 'diff_summary failed: unknown error',
					success: false,
				};
				return JSON.stringify(errorResult, null, 2);
			}
		},
	},
);
