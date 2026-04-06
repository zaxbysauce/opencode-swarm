/**
 * Dark Matter Detector Hook
 *
 * This hook reads `.swarm/dark-matter.md` — a markdown file that lists
 * unresolved coupling gaps. When unconsumed items exist in this file,
 * the hook logs a reminder hint to the user.
 */
/**
 * Parses dark matter gaps from markdown content
 *
 * @param content - The markdown content to parse
 * @returns Object containing arrays of unresolved and resolved gap descriptions
 */
export declare function parseDarkMatterGaps(content: string): {
    unresolved: string[];
    resolved: string[];
};
/**
 * Reads and parses the dark matter gaps file
 *
 * @param directory - The project directory containing .swarm folder
 * @returns Object with unresolved and resolved gaps, or null if file not found/empty
 */
export declare function readDarkMatterMd(directory: string): Promise<{
    unresolved: string[];
    resolved: string[];
} | null>;
/**
 * Creates the dark matter detector hook
 *
 * This hook fires on `toolAfter` and checks for unresolved coupling gaps
 * in `.swarm/dark-matter.md`. It logs a reminder hint when gaps exist,
 * with rate-limiting to avoid excessive file I/O.
 *
 * @param directory - The project directory containing .swarm folder
 * @returns Hook function that checks for unresolved dark matter gaps
 */
export declare function createDarkMatterDetectorHook(directory: string): (input: unknown, output: unknown) => Promise<void>;
