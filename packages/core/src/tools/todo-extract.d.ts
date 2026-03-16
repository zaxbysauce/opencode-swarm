export interface TodoEntry {
    file: string;
    line: number;
    tag: string;
    text: string;
    priority: 'high' | 'medium' | 'low';
}
export interface TodoExtractResult {
    total: number;
    byPriority: {
        high: number;
        medium: number;
        low: number;
    };
    entries: TodoEntry[];
}
export interface TodoExtractError {
    error: string;
    total: 0;
    byPriority: {
        high: 0;
        medium: 0;
        low: 0;
    };
    entries: [];
}
export declare function containsPathTraversal(str: string): boolean;
export declare function containsControlChars(str: string): boolean;
export declare function validateTagsInput(tags: string): string | null;
export declare function validatePathsInput(paths: string, cwd: string): {
    error: string | null;
    resolvedPath: string | null;
};
export declare function isSupportedExtension(filePath: string): boolean;
export declare function findSourceFiles(dir: string, files?: string[]): string[];
export declare function parseTodoComments(content: string, filePath: string, tagsSet: Set<string>): TodoEntry[];
export interface TodoExtractArgs {
    paths?: string;
    tags?: string;
}
export declare function executeTodoExtract(args: TodoExtractArgs, cwd: string): Promise<string>;
