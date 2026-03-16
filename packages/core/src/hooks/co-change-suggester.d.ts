/**
 * Co-Change Suggester Hook
 *
 * Analyzes file modifications and suggests co-change partners based on
 * historical co-change data from .swarm/co-change.json. This hook fires
 * after file-write tools complete and logs suggestions when co-change
 * partners are detected.
 */
/**
 * Represents a single co-change entry from the JSON file
 */
export interface CoChangeJsonEntry {
    /** First file in the co-change pair */
    fileA: string;
    /** Second file in the co-change pair */
    fileB: string;
    /** Number of times these files were changed together */
    coChangeCount: number;
    /** Normalized Pointwise Mutual Information score (0-1) */
    npmi: number;
}
/**
 * Root structure of the co-change JSON file
 */
export interface CoChangeJson {
    /** File format version */
    version: string;
    /** ISO timestamp when the file was generated */
    generated: string;
    /** Array of co-change entries */
    entries: CoChangeJsonEntry[];
}
/**
 * Reads and parses the .swarm/co-change.json file
 * @param directory - The project directory containing .swarm folder
 * @returns Parsed CoChangeJson or null if not found/invalid
 */
export declare function readCoChangeJson(directory: string): Promise<CoChangeJson | null>;
/**
 * Finds co-change partners for a given file
 * @param entries - Array of co-change entries to search
 * @param filePath - The file path to find partners for
 * @returns Array of entries where the file appears as fileA or fileB
 */
export declare function getCoChangePartnersForFile(entries: CoChangeJsonEntry[], filePath: string): CoChangeJsonEntry[];
/**
 * Creates the co-change suggester hook
 * @param directory - The project directory containing .swarm folder
 * @returns A hook function that analyzes file writes for co-change suggestions
 */
export declare function createCoChangeSuggesterHook(directory: string): (input: unknown, output: unknown) => Promise<void>;
