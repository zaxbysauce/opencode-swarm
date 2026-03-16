export interface ConsumerFile {
    file: string;
    line: number;
    imports: string;
    importType: 'default' | 'named' | 'namespace' | 'require' | 'sideeffect';
    raw: string;
}
export interface ImportsResult {
    target: string;
    symbol?: string;
    consumers: ConsumerFile[];
    count: number;
    message?: string;
}
export interface ImportsErrorResult {
    error: string;
    target: string;
    symbol?: string;
    consumers: [];
    count: 0;
}
/**
 * Main imports tool implementation
 */
export declare function runImports(args: {
    file: string;
    symbol?: string;
}, directory: string): Promise<string>;
