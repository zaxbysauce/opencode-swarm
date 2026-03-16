/**
 * Extract filename from code content or context
 */
export declare function extractFilename(code: string, language: string, index: number): string;
/**
 * Extract code blocks from content and save to files
 */
export interface ExtractCodeBlocksResult {
    savedFiles: string[];
    errors: string[];
}
export declare function extractCodeBlocks(content: string, outputDir: string, prefix?: string): ExtractCodeBlocksResult;
