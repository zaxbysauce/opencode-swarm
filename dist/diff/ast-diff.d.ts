export interface ASTChange {
    type: 'added' | 'modified' | 'removed';
    category: 'function' | 'class' | 'type' | 'export' | 'import' | 'variable' | 'other';
    name: string;
    lineStart: number;
    lineEnd: number;
    signature?: string;
}
export interface ASTDiffResult {
    filePath: string;
    language: string | null;
    changes: ASTChange[];
    durationMs: number;
    usedAST: boolean;
    error?: string;
}
/**
 * Compute AST-level diff between old and new file content
 */
export declare function computeASTDiff(filePath: string, oldContent: string, newContent: string): Promise<ASTDiffResult>;
