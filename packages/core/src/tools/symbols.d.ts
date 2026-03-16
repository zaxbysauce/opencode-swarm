interface SymbolInfo {
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'variable' | 'method' | 'property';
    exported: boolean;
    signature: string;
    line: number;
    jsdoc?: string;
}
/**
 * Run symbols extraction
 */
export declare function runSymbols(file: string, cwd: string, exportedOnly?: boolean): Promise<{
    file: string;
    symbols: SymbolInfo[];
}>;
export {};
