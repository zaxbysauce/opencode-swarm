export declare const MAX_MERGE_DEPTH = 10;
/**
 * Deep merge two objects, with override values taking precedence.
 */
export declare function deepMerge<T extends Record<string, unknown>>(base?: T, override?: T): T | undefined;
