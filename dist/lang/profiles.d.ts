/**
 * Language Profile Registry - Pure Data Types
 *
 * This file defines the LanguageProfile interface and LanguageRegistry class.
 * No tool logic, no subprocess calls - pure data definitions only.
 */
export interface BuildCommand {
    name: string;
    cmd: string;
    detectFile?: string;
    priority: number;
}
export interface TestFramework {
    name: string;
    detect: string;
    cmd: string;
    priority: number;
}
export interface LintTool {
    name: string;
    detect: string;
    cmd: string;
    priority: number;
}
export interface LanguageProfile {
    id: string;
    displayName: string;
    tier: 1 | 2 | 3;
    extensions: string[];
    treeSitter: {
        grammarId: string;
        wasmFile: string;
    };
    build: {
        detectFiles: string[];
        commands: BuildCommand[];
    };
    test: {
        detectFiles: string[];
        frameworks: TestFramework[];
    };
    lint: {
        detectFiles: string[];
        linters: LintTool[];
    };
    audit: {
        detectFiles: string[];
        command: string | null;
        outputFormat: 'json' | 'text';
    };
    sast: {
        nativeRuleSet: string | null;
        semgrepSupport: 'ga' | 'beta' | 'experimental' | 'none';
    };
    prompts: {
        coderConstraints: string[];
        reviewerChecklist: string[];
    };
}
export declare class LanguageRegistry {
    private profiles;
    private extensionIndex;
    constructor();
    register(profile: LanguageProfile): void;
    get(id: string): LanguageProfile | undefined;
    getById(id: string): LanguageProfile | undefined;
    getByExtension(ext: string): LanguageProfile | undefined;
    getAll(): LanguageProfile[];
    getTier(tier: 1 | 2 | 3): LanguageProfile[];
}
export declare const LANGUAGE_REGISTRY: LanguageRegistry;
