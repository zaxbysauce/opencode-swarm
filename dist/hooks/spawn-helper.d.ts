export declare function spawnAsync(command: string[], cwd: string, timeoutMs: number): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
} | null>;
