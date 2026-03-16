// Note: import from summaries/manager is removed as it may depend on SDK
// Will be handled in opencode package wrapper

const RETRIEVE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ============ Validation Functions ============

/**
 * Validate summary ID format
 */
export function sanitizeSummaryId(id: string): string {
	// Must match pattern S followed by digits
	const pattern = /^S\d+$/;
	if (!pattern.test(id)) {
		throw new Error('Invalid summary ID format');
	}
	return id;
}

// ============ Main Implementation ============

/**
 * Retrieve summary - retrieves paginated content from stored summaries
 */
export async function retrieveSummary(
	args: { id: string; offset?: number; limit?: number },
	directory: string,
): Promise<string> {
	const offset = args.offset ?? 0;
	const limit = Math.min(args.limit ?? 100, 500);

	// Validate ID format and security constraints
	let sanitizedId: string;
	try {
		sanitizedId = sanitizeSummaryId(args.id);
	} catch {
		return 'Error: invalid summary ID format. Expected format: S followed by digits (e.g. S1, S2, S99).';
	}

	// Note: The actual loadFullOutput function will be imported in the opencode package
	// This is a placeholder that indicates where the logic would go
	// In the core package, we return an error indicating this needs SDK integration

	// For now, return a placeholder - actual implementation requires summaries/manager
	return `Error: Summary retrieval requires SDK integration. Summary ID: ${sanitizedId}`;
}
