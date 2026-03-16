interface UndocumentedRoute {
    path: string;
    method: string;
    file: string;
    line: number;
}
interface PhantomRoute {
    path: string;
    methods: string[];
}
export interface SchemaDriftResult {
    specFile: string;
    specPathCount: number;
    codeRouteCount: number;
    undocumented: UndocumentedRoute[];
    phantom: PhantomRoute[];
    undocumentedCount: number;
    phantomCount: number;
    consistent: boolean;
}
/**
 * Run schema drift detection
 */
export declare function runSchemaDrift(cwd: string, specFileArg?: string): Promise<SchemaDriftResult>;
export {};
