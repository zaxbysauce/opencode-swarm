export const MAX_MERGE_DEPTH = 10;

/**
 * Deep merge two objects, with override values taking precedence.
 * Internal implementation with depth tracking to prevent infinite recursion.
 */
function deepMergeInternal<T extends Record<string, unknown>>(
	base: T,
	override: T,
	depth: number,
): T {
	if (depth >= MAX_MERGE_DEPTH) {
		throw new Error(`deepMerge exceeded maximum depth of ${MAX_MERGE_DEPTH}`);
	}

	const result = { ...base } as T;
	for (const key of Object.keys(override) as (keyof T)[]) {
		const baseVal = base[key];
		const overrideVal = override[key];

		if (
			typeof baseVal === 'object' &&
			baseVal !== null &&
			typeof overrideVal === 'object' &&
			overrideVal !== null &&
			!Array.isArray(baseVal) &&
			!Array.isArray(overrideVal)
		) {
			result[key] = deepMergeInternal(
				baseVal as Record<string, unknown>,
				overrideVal as Record<string, unknown>,
				depth + 1,
			) as T[keyof T];
		} else {
			result[key] = overrideVal;
		}
	}
	return result;
}

/**
 * Deep merge two objects, with override values taking precedence.
 */
export function deepMerge<T extends Record<string, unknown>>(
	base?: T,
	override?: T,
): T | undefined {
	if (!base) return override;
	if (!override) return base;

	return deepMergeInternal(base, override, 0);
}
