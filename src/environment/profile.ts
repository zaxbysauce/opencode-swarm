/**
 * Session-level execution environment profiling for opencode-swarm.
 * Computed once per session; never re-detected within a session.
 */

export type HostOS = 'windows' | 'linux' | 'macos' | 'unknown';
export type ShellFamily =
	| 'powershell'
	| 'cmd'
	| 'bash'
	| 'zsh'
	| 'sh'
	| 'unknown';
export type ExecutionMode = 'native' | 'docker' | 'wsl' | 'unknown';
export type OperatingMode =
	| 'linux'
	| 'macos-native'
	| 'windows-native'
	| 'unknown';

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

function detectHostOS(): HostOS {
	switch (process.platform) {
		case 'win32':
			return 'windows';
		case 'darwin':
			return 'macos';
		case 'linux':
			return 'linux';
		default:
			return 'unknown';
	}
}

function detectShellFamily(): ShellFamily {
	const psModulePath = process.env.PSModulePath;
	if (psModulePath) return 'powershell';
	const comspec = process.env.ComSpec ?? '';
	if (comspec.toLowerCase().includes('cmd.exe')) return 'cmd';
	const shell = process.env.SHELL ?? '';
	if (shell.includes('bash')) return 'bash';
	if (shell.includes('zsh')) return 'zsh';
	if (shell.includes('/sh')) return 'sh';
	return 'unknown';
}

function detectExecutionMode(hostOS: HostOS): ExecutionMode {
	const wslDistro = process.env.WSL_DISTRO_NAME;
	if (wslDistro) return 'wsl';
	if (hostOS === 'linux') {
		// Check for container markers
		const containerEnvs = [
			'DOCKER_CONTAINER',
			'KUBERNETES_SERVICE_HOST',
			'CONTAINER',
		];
		if (containerEnvs.some((k) => process.env[k])) return 'docker';
	}
	return 'native';
}

function deriveOperatingMode(
	hostOS: HostOS,
	_executionMode: ExecutionMode,
): OperatingMode {
	if (hostOS === 'linux') return 'linux';
	if (hostOS === 'macos') return 'macos-native';
	if (hostOS === 'windows') return 'windows-native';
	return 'unknown';
}

function buildCommandPolicy(profile: EnvironmentProfile): CommandPolicy {
	if (profile.isWindowsNative) {
		return {
			preferredShell: 'powershell',
			avoidPosixExamples: true,
			preferNodeApis: true,
			preferToolingOverShell: true,
			pathExampleStyle: 'windows',
			examples: {
				listDir: 'Get-ChildItem -Force',
				removeFile: 'Remove-Item file.tmp',
				setEnv: '$env:DEBUG = "1"',
				printEnv: '$env:PATH',
				searchText: 'Get-ChildItem -Recurse src | Select-String "foo"',
			},
		};
	}
	// Linux, macOS, Docker, WSL — POSIX defaults
	return {
		preferredShell:
			profile.shellFamily === 'unknown' ? 'bash' : profile.shellFamily,
		avoidPosixExamples: false,
		preferNodeApis: true,
		preferToolingOverShell: true,
		pathExampleStyle: 'posix',
		examples: {
			listDir: 'ls -la',
			removeFile: 'rm file.tmp',
			setEnv: 'export DEBUG=1',
			printEnv: 'echo $PATH',
			searchText: 'grep -R "foo" src/',
		},
	};
}

/**
 * Detect the current execution environment. Call once per session.
 */
export function detectEnvironmentProfile(): EnvironmentProfile {
	const hostOS = detectHostOS();
	const shellFamily = detectShellFamily();
	const executionMode = detectExecutionMode(hostOS);
	const operatingMode = deriveOperatingMode(hostOS, executionMode);

	const isWindowsNative = hostOS === 'windows' && executionMode === 'native';
	const isWindowsDocker = false; // Windows Docker detection is not yet supported
	const isWSL = executionMode === 'wsl';
	const pathStyle: 'windows' | 'posix' =
		hostOS === 'windows' && !isWindowsDocker ? 'windows' : 'posix';
	const shellCommandPreference: EnvironmentProfile['shellCommandPreference'] =
		isWindowsNative ? 'powershell-native' : 'posix-native';

	return {
		hostOS,
		shellFamily,
		executionMode,
		operatingMode,
		isWindowsNative,
		isWindowsDocker,
		isWSL,
		pathStyle,
		shellCommandPreference,
		evidence: {
			processPlatform: process.platform,
			comspec: process.env.ComSpec,
			psModulePath: process.env.PSModulePath,
			termProgram: process.env.TERM_PROGRAM,
			shell: process.env.SHELL,
			wslDistroName: process.env.WSL_DISTRO_NAME,
			containerMarkers: [
				'DOCKER_CONTAINER',
				'KUBERNETES_SERVICE_HOST',
				'CONTAINER',
			].filter((k) => !!process.env[k]),
		},
	};
}

/**
 * Derive a CommandPolicy from a detected EnvironmentProfile.
 */
export function deriveCommandPolicy(
	profile: EnvironmentProfile,
): CommandPolicy {
	return buildCommandPolicy(profile);
}
