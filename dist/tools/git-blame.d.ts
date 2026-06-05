import type { tool } from '@opencode-ai/plugin';
export interface BlameLine {
    line: number;
    sha: string;
    author: string;
    date: string;
    summary: string;
    content: string;
}
export interface GitBlameResult {
    file: string;
    lineCount: number;
    lines: BlameLine[];
}
export interface GitBlameError {
    error: string;
    file: string;
    lineCount: 0;
    lines: [];
}
export declare const git_blame: ReturnType<typeof tool>;
