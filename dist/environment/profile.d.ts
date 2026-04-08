/**
 * Session-level execution environment profiling for opencode-swarm.
 * Computed once per session; never re-detected within a session.
 */
export type HostOS = 'windows' | 'linux' | 'macos' | 'unknown';
export type ShellFamily = 'powershell' | 'cmd' | 'bash' | 'zsh' | 'sh' | 'unknown';
export type ExecutionMode = 'native' | 'docker' | 'wsl' | 'unknown';
export type OperatingMode = 'linux' | 'macos-native' | 'windows-native' | 'unknown';
export interface EnvironmentProfile {
    hostOS: HostOS;
    shellFamily: ShellFamily;
    executionMode: ExecutionMode;
    operatingMode: OperatingMode;
    isWindowsNative: boolean;
    isWindowsDocker: boolean;
    isWSL: boolean;
    pathStyle: 'windows' | 'posix';
    shellCommandPreference: 'powershell-native' | 'posix-native';
    evidence: {
        processPlatform: string;
        comspec?: string;
        psModulePath?: string;
        termProgram?: string;
        shell?: string;
        wslDistroName?: string;
        containerMarkers: string[];
    };
}
export interface CommandPolicy {
    preferredShell: ShellFamily;
    avoidPosixExamples: boolean;
    preferNodeApis: boolean;
    preferToolingOverShell: boolean;
    pathExampleStyle: 'windows' | 'posix';
    examples: {
        listDir: string;
        removeFile: string;
        setEnv: string;
        printEnv: string;
        searchText: string;
    };
}
/**
 * Detect the current execution environment. Call once per session.
 */
export declare function detectEnvironmentProfile(): EnvironmentProfile;
/**
 * Derive a CommandPolicy from a detected EnvironmentProfile.
 */
export declare function deriveCommandPolicy(profile: EnvironmentProfile): CommandPolicy;
