export type ReviewDepth = 'single' | 'double';

export interface ReviewRouting {
	reviewerCount: number;
	testEngineerCount: number;
	depth: ReviewDepth;
	reason: string;
}

export interface ComplexityMetrics {
	fileCount: number;
	functionCount: number;
	astChangeCount: number;
	maxFileComplexity: number;
}

/**
 * Check if a directory path is safe (no path traversal, no absolute paths to sensitive locations)
 */
function isSafeDirectory(directory: string): boolean {
	// Reject if it contains path traversal
	if (directory.includes('..')) return false;
	// Reject absolute paths to sensitive locations
	if (/^(\/etc|\/root|\/proc|\/sys|C:\\Windows|C:\\Users)/i.test(directory)) return false;
	// Reject null bytes
	if (directory.includes('\0')) return false;
	return true;
}

/**
 * Compute complexity metrics for a set of files
 */
export async function computeComplexity(
	directory: string,
	changedFiles: string[],
): Promise<ComplexityMetrics> {
	// Reject unsafe directory paths
	if (!isSafeDirectory(directory)) {
		return { fileCount: 0, functionCount: 0, astChangeCount: 0, maxFileComplexity: 0 };
	}

	let functionCount = 0;
	let astChangeCount = 0;
	let maxFileComplexity = 0;

	for (const file of changedFiles) {
		// Skip non-source files
		if (!/\.(ts|js|tsx|jsx|py|go|rs)$/.test(file)) {
			continue;
		}

		// Skip files with names that are too long (OS limit ~255 chars for filename)
		const fileName = file.split(/[/\\]/).pop() || '';
		if (fileName.length > 255) {
			continue;
		}

		try {
			// Get file content
			const fs = await import('node:fs');
			const path = await import('node:path');
			const filePath = path.join(directory, file);

			if (!fs.existsSync(filePath)) {
				continue;
			}

			const content = fs.readFileSync(filePath, 'utf-8');

			// Count functions (simple heuristic)
			const functionMatches = content.match(/\b(function|def|func|fn)\s+\w+/g);
			const fileFunctionCount = functionMatches?.length || 0;
			functionCount += fileFunctionCount;

			// Estimate AST changes (lines changed approximation)
			const lines = content.split('\n').length;
			const estimatedChanges = Math.min(lines / 10, 50); // Cap at 50
			astChangeCount += estimatedChanges;

			// File complexity score
			const fileComplexity = fileFunctionCount + lines / 100;
			maxFileComplexity = Math.max(maxFileComplexity, fileComplexity);
		} catch {
			// Skip files that can't be analyzed
		}
	}

	return {
		fileCount: changedFiles.length,
		functionCount,
		astChangeCount: Math.round(astChangeCount),
		maxFileComplexity: Math.round(maxFileComplexity * 10) / 10,
	};
}

/**
 * Determine review routing based on complexity
 */
export function routeReview(metrics: ComplexityMetrics): ReviewRouting {
	// High complexity triggers double review
	const isHighComplexity =
		metrics.fileCount >= 5 ||
		metrics.functionCount >= 10 ||
		metrics.astChangeCount >= 30 ||
		metrics.maxFileComplexity >= 15;

	if (isHighComplexity) {
		return {
			reviewerCount: 2,
			testEngineerCount: 2,
			depth: 'double',
			reason: `High complexity: ${metrics.fileCount} files, ${metrics.functionCount} functions, complexity score ${metrics.maxFileComplexity}`,
		};
	}

	// Standard review
	return {
		reviewerCount: 1,
		testEngineerCount: 1,
		depth: 'single',
		reason: `Standard complexity: ${metrics.fileCount} files, ${metrics.functionCount} functions`,
	};
}

/**
 * Route review with full analysis
 */
export async function routeReviewForChanges(
	directory: string,
	changedFiles: string[],
): Promise<ReviewRouting> {
	const metrics = await computeComplexity(directory, changedFiles);
	return routeReview(metrics);
}

/**
 * Check if review should be parallelized
 */
export function shouldParallelizeReview(routing: ReviewRouting): boolean {
	return routing.depth === 'double';
}
