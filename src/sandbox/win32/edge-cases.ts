/**
 * Edge case handling utilities for Windows sandbox.
 *
 * This module provides functions to detect and prevent:
 * - Path traversal attacks
 * - Registry escape attempts
 * - PowerShell command bypass
 * - WMI command execution bypass
 * - Windows service escalation
 * - DLL search order hijacking
 * - Token manipulation attacks
 */

/**
 * Detects Windows path traversal patterns that could escape sandbox containment.
 *
 * Attack: Attackers use `..`, absolute paths, or extended-length paths
 * to access files outside the intended sandbox scope.
 *
 * @param command - The command string to analyze
 * @returns true if path traversal patterns are detected
 */
export function detectPathTraversal(command: string): boolean {
	if (process.platform !== 'win32') return false;

	// Check for backslash path traversal
	if (/\.\.[\\/]/.test(command)) {
		return true;
	}

	// Check for forward slash traversal (less common on Windows but possible)
	if (/\.\.\//.test(command)) {
		return true;
	}

	// Check for extended-length path prefix (\\\\?\\)
	// This prefix disables path normalization and can bypass security checks
	if (/\\\\[?]\\[\\]/.test(command)) {
		return true;
	}

	// Check for drive letter escapes with traversal
	// e.g., C:\..\..\Windows\win.ini
	if (/[A-Z]:[\\/]?\.\./i.test(command)) {
		return true;
	}

	// Check for root drive access with traversal
	// e.g., \\..\..\ or C:\..\..\
	if (/[\\/]{2,3}\.\./.test(command)) {
		return true;
	}

	// Check for UNC path traversal
	if (/\\\\[^\\]+[\\/]\.\./i.test(command)) {
		return true;
	}

	return false;
}

/**
 * Detects registry manipulation attempts to bypass sandbox restrictions.
 *
 * Attack: Modifying the registry can disable security policies,
 * create startup entries, or alter system behavior.
 *
 * @param command - The command string to analyze
 * @returns true if registry manipulation is detected
 */
export function detectRegistryEscape(command: string): boolean {
	if (process.platform !== 'win32') return false;

	// Check for registry query with sensitive keys (reconnaissance)
	if (/reg\s+query/i.test(command)) {
		// Sensitive registry paths for query detection
		const sensitiveQueryKeys = [
			/HKCU[\\]?Software[\\]?(?:Policies|Classes)[\\]?/i,
			/HKEY_CURRENT_USER[\\]?Software[\\]?(?:Policies|Classes)[\\]?/i,
			/HKLM[\\]?Security[\\]?SAM/i,
			/HKEY_LOCAL_MACHINE[\\]?Security[\\]?SAM/i,
			/HKLM[\\]?System[\\]?CurrentControlSet/i,
			/HKEY_LOCAL_MACHINE[\\]?System[\\]?CurrentControlSet/i,
		];
		for (const pattern of sensitiveQueryKeys) {
			if (pattern.test(command)) {
				return true;
			}
		}
		// Check for path traversal
		if (/\.\.[\\/]/.test(command)) {
			return true;
		}
	}

	// Check for registry add/modify operations
	const regAddPattern = /reg\s+add/i;
	if (regAddPattern.test(command)) {
		// Sensitive registry paths that could weaken security
		const sensitiveKeys = [
			/HKLM[\\]?Software[\\]?(Policies[\\]?)?Microsoft/i,
			/HKCU[\\]?Software[\\]?Policies[\\]?/i,
			/HKLM[\\]?System[\\]?CurrentControlSet[\\]?Services/i,
			/HKLM[\\]?Software[\\]?Microsoft[\\]?Windows[\\]?CurrentVersion[\\]?Run/i,
			/HKLM[\\]?Software[\\]?Microsoft[\\]?Windows[\\]?CurrentVersion[\\]?RunOnce/i,
			/HKCU[\\]?Software[\\]?Microsoft[\\]?Windows[\\]?CurrentVersion[\\]?Run/i,
			/HKLM[\\]?Software[\\]?Classes[\\]?/i,
		];

		for (const pattern of sensitiveKeys) {
			if (pattern.test(command)) {
				return true;
			}
		}
	}

	// Check for registry delete operations (could remove security entries)
	const regDeletePattern = /reg\s+delete/i;
	if (regDeletePattern.test(command)) {
		return true;
	}

	// Check for registry import (can bulk-apply registry changes)
	const regImportPattern = /reg\s+import/i;
	if (regImportPattern.test(command)) {
		return true;
	}

	// Check for regedit silent import
	const regEditPattern = /regedit\.exe?\s+[/-]s/i;
	if (regEditPattern.test(command)) {
		return true;
	}

	// Check for registry path traversal with ..
	if (/\.\.[\\/]/.test(command) && /reg\s+/i.test(command)) {
		return true;
	}

	return false;
}

/**
 * Detects PowerShell command execution patterns that could bypass sandbox restrictions.
 *
 * Attack: PowerShell's flexibility allows executing encoded commands, remote scripts,
 * and leveraging various execution policy bypasses.
 *
 * @param command - The command string to analyze
 * @returns true if PowerShell escape patterns are detected
 */
export function detectPowerShellEscape(command: string): boolean {
	if (process.platform !== 'win32') return false;

	// Check for encoded command execution
	const encodedCommandPattern = /-EncodedCommand/i;
	if (encodedCommandPattern.test(command)) {
		return true;
	}

	// Check for EncodedCommand with base64
	const encodedBase64Pattern = /-Enc(odedCommand)?\s+[A-Za-z0-9+/=]+/i;
	if (encodedBase64Pattern.test(command)) {
		return true;
	}

	// Check for PowerShell executable with suspicious flags
	const psExePattern =
		/powershell\.exe?\s+.*-(?:e(?:n(?:c(?:odedCommand)?)?)?|wmi|remote)/i;
	if (psExePattern.test(command)) {
		return true;
	}

	// Check for iex (Invoke-Expression) alias usage
	const iexPattern = /\biex\b/i;
	if (iexPattern.test(command)) {
		return true;
	}

	// Check for Invoke-Expression cmdlet
	const invokeExpressionPattern = /Invoke-Expression/i;
	if (invokeExpressionPattern.test(command)) {
		return true;
	}

	// Check for Invoke-Command with remote execution
	const invokeCommandRemotePattern = /Invoke-Command\s+.*-ComputerName/i;
	if (invokeCommandRemotePattern.test(command)) {
		return true;
	}

	// Check for -Command with suspicious content
	const psCommandPattern = /powershell.*-Command\s+["'].*\$/i;
	if (psCommandPattern.test(command)) {
		return true;
	}

	// Check for Bypass/RemoteSigned/Unrestricted execution policy flags
	const execPolicyPattern =
		/-ExecutionPolicy\s+(?:Bypass|RemoteSigned|Unrestricted)/i;
	if (execPolicyPattern.test(command)) {
		return true;
	}

	// Check for -NoProfile flag (often used in attack scripts)
	const noProfilePattern = /-NoProfile\s+-/i;
	if (noProfilePattern.test(command)) {
		return true;
	}

	// Check for New-Object with System.Management.Automation
	const automationPattern = /New-Object\s+.*Management\.Automation/i;
	if (automationPattern.test(command)) {
		return true;
	}

	// Check for DownloadString/DownloadFile methods
	const downloadPattern =
		/\[System\.Net\.(?:WebClient|Http).*\]\.(?:DownloadString|DownloadFile)/i;
	if (downloadPattern.test(command)) {
		return true;
	}

	// Check for -WindowStyle Hidden (used to hide PowerShell window)
	const hiddenWindowPattern = /-WindowStyle\s+Hidden/i;
	if (hiddenWindowPattern.test(command)) {
		return true;
	}

	// Check for mhfm script injection patterns
	const scriptInjectionPattern = /\$(?:env|input|host)\b.*\|/i;
	if (scriptInjectionPattern.test(command)) {
		return true;
	}

	// Check for IEX (sometimes obfuscated)
	const obfuscatedIexPattern = /IEX|i:eX/i;
	if (obfuscatedIexPattern.test(command)) {
		return true;
	}

	return false;
}

/**
 * Detects WMI command execution that could bypass sandbox restrictions.
 *
 * Attack: WMI can be used for remote execution, process creation,
 * and querying system information.
 *
 * @param command - The command string to analyze
 * @returns true if WMI escape patterns are detected
 */
export function detectWMIEscape(command: string): boolean {
	if (process.platform !== 'win32') return false;

	// Check for wmic process call create (remote process creation)
	const wmicProcessCreatePattern = /wmic(?:\.exe)?\s+process\s+call\s+create/i;
	if (wmicProcessCreatePattern.test(command)) {
		return true;
	}

	// Check for wmic with os get (system info enumeration)
	// Use positive lookahead to match only when get is followed by a word character
	// (e.g., "wmic os get Name" should match as potentially suspicious,
	// but "wmic os get" alone would not)
	const wmicOsGetPattern = /wmic(?:\.exe)?\s+os\s+get(?=\w)/i;
	if (wmicOsGetPattern.test(command)) {
		return true;
	}

	// Check for wmic with /node: flag (remote operations)
	const wmicRemotePattern = /wmic(?:\.exe)?\s+.*\/node:/i;
	if (wmicRemotePattern.test(command)) {
		return true;
	}

	// Check for Invoke-WmiMethod
	const invokeWmiMethodPattern = /Invoke-WmiMethod/i;
	if (invokeWmiMethodPattern.test(command)) {
		return true;
	}

	// Check for Get-WmiObject with malicious intent
	const getWmiObjectPattern = /Get-WmiObject\s+.*(?:Win32_|root\\)/i;
	if (getWmiObjectPattern.test(command)) {
		return true;
	}

	// Check for Set-WmiInstance
	const setWmiInstancePattern = /Set-WmiInstance/i;
	if (setWmiInstancePattern.test(command)) {
		return true;
	}

	// Check for Register-WmiEvent
	const registerWmiEventPattern = /Register-WmiEvent/i;
	if (registerWmiEventPattern.test(command)) {
		return true;
	}

	return false;
}

/**
 * Alias for detectServiceManipulation for API compatibility.
 * @param command - The command string to analyze
 * @returns true if service manipulation is detected
 */
export function detectServiceEscalation(command: string): boolean {
	return detectServiceManipulation(command);
}

/**
 * Detects Windows service manipulation attempts.
 *
 * Attack: Creating or modifying Windows services can establish
 * persistent execution with elevated privileges.
 *
 * @param command - The command string to analyze
 * @returns true if service manipulation is detected
 */
export function detectServiceManipulation(command: string): boolean {
	if (process.platform !== 'win32') return false;

	// Check for sc.exe create (service creation)
	const scCreatePattern = /sc(?:\.exe)?\s+create/i;
	if (scCreatePattern.test(command)) {
		return true;
	}

	// Check for sc.exe config (modifying service config)
	const scConfigPattern = /sc(?:\.exe)?\s+config/i;
	if (scConfigPattern.test(command)) {
		return true;
	}

	// Check for sc.exe delete (service deletion)
	const scDeletePattern = /sc(?:\.exe)?\s+delete/i;
	if (scDeletePattern.test(command)) {
		return true;
	}

	// Check for sc.exe start/stop (service control)
	const scStartPattern = /sc(?:\.exe)?\s+(?:start|stop|pause|continue)/i;
	if (scStartPattern.test(command)) {
		return true;
	}

	// Check for sc.exe control (service control with arbitrary code)
	const scControlPattern = /sc(?:\.exe)?\s+control\b/i;
	if (scControlPattern.test(command)) {
		return true;
	}

	// Check for net start (service start)
	const netStartPattern = /^net\s+start\b/i;
	if (netStartPattern.test(command)) {
		return true;
	}

	// Check for New-Service PowerShell cmdlet
	const newServicePattern = /New-Service\b/i;
	if (newServicePattern.test(command)) {
		return true;
	}

	// Check for Set-Service PowerShell cmdlet
	const setServicePattern = /Set-Service\b/i;
	if (setServicePattern.test(command)) {
		return true;
	}

	// Check for Stop-Service and Remove-Service
	const stopRemoveServicePattern = /(?:Stop|Remove)-Service\b/i;
	if (stopRemoveServicePattern.test(command)) {
		return true;
	}

	// Check for sc.exe with binPath= to existing service
	const scBinPathPattern =
		/sc(?:\.exe)?\s+\w+\s+binPath=.*\\temp\\|sc(?:\.exe)?\s+\w+\s+binPath=.*\.exe.*"/i;
	if (scBinPathPattern.test(command)) {
		return true;
	}

	return false;
}

/**
 * Detects DLL search order hijacking via PATH manipulation.
 *
 * Attack: If the PATH contains ".", current directory, or writable
 * system paths, an attacker can place a malicious DLL that gets loaded
 * by a legitimate binary.
 *
 * @param command - The command string to analyze
 * @param env - The environment variables to check
 * @returns true if DLL hijacking via PATH manipulation is detected
 */
export function detectDLLHijacking(
	command: string,
	env: Record<string, string | undefined> = {},
): boolean {
	if (process.platform !== 'win32') return false;

	// Check for null byte injection in command (path truncation attack)
	if (command.includes('\0')) {
		return true;
	}

	// Check for UNC path in command (remote DLL loading)
	if (/\\\\[^\\]+[\\]/.test(command)) {
		return true;
	}

	// Check for relative path traversal with DLL-like extensions
	if (/\.\.[\\/]/.test(command) && /\.(dll|exe|bocfg|ocx)$/i.test(command)) {
		return true;
	}

	// Check for DLL in user temp directory
	if (
		/C:\\Users\\[^\\]+\\AppData\\Local\\Temp\\/i.test(command) &&
		/\.(dll|exe|bocfg|ocx)$/i.test(command)
	) {
		return true;
	}

	// Check if PATH contains "." (current directory)
	const pathValue = env.PATH ?? env.Path ?? '';
	if (/\bC:\.\b/i.test(pathValue) || /^\./.test(pathValue)) {
		return true;
	}

	// Check for "." in the command's PATH manipulation
	// e.g., set PATH=C:\.;...
	if (/set\s+PATH\s*=\s*C:\.\s*;/i.test(command)) {
		return true;
	}

	// Check for PATH with current directory marker at the beginning
	if (/PATH\s*=\s*\.\s*;/.test(command)) {
		return true;
	}

	// Check for explicitly adding current directory to PATH in command
	const addCurrentDirPattern = /set\s+PATH\s*=.*%([^%]+)%/i;
	if (addCurrentDirPattern.test(command)) {
		// Check if the referenced variable could expand to current dir
		const match = command.match(addCurrentDirPattern);
		if (match) {
			const varName = match[1];
			const varValue = env[varName] ?? env[varName.toLowerCase()] ?? '';
			if (varValue.includes('.')) {
				return true;
			}
		}
	}

	// Check for common writable system paths in PATH
	const writablePaths = [
		'C:\\Windows\\Temp',
		'C:\\Temp',
		'C:\\Users\\Public',
		'C:\\Documents and Settings',
	];

	for (const writablePath of writablePaths) {
		// Check if PATH starts with a writable path or contains it early
		const pathStartPattern = new RegExp(
			`${writablePath.replace(/\\/g, '\\\\')}[\\\\;]`,
			'i',
		);
		if (pathStartPattern.test(pathValue)) {
			return true;
		}
	}

	// Check for PATH that includes user temp directories
	if (/PATH.*%TEMP%/i.test(command) || /PATH.*%TMP%/i.test(command)) {
		return true;
	}

	return false;
}

/**
 * Detects attempts to manipulate process tokens or create processes with elevated privileges.
 *
 * Attack: Token manipulation allows a process to acquire elevated privileges
 * or the privileges of another user, enabling privilege escalation.
 *
 * @param command - The command string to analyze
 * @returns true if token manipulation is detected
 */
export function detectTokenManipulation(command: string): boolean {
	if (process.platform !== 'win32') return false;

	// Check for runas command
	const runasPattern = /\brunas\.exe?\b/i;
	if (runasPattern.test(command)) {
		return true;
	}

	// Check for CreateProcessAsUser API usage
	const createProcessAsUserPattern = /CreateProcessAsUser/i;
	if (createProcessAsUserPattern.test(command)) {
		return true;
	}

	// Check for CreateProcessWithLogonW API usage
	const createProcessWithLogonPattern = /CreateProcessWithLogonW/i;
	if (createProcessWithLogonPattern.test(command)) {
		return true;
	}

	// Check for DuplicateTokenEx API usage
	const duplicateTokenExPattern = /DuplicateTokenEx/i;
	if (duplicateTokenExPattern.test(command)) {
		return true;
	}

	// Check for SetThreadToken API usage
	const setThreadTokenPattern = /SetThreadToken/i;
	if (setThreadTokenPattern.test(command)) {
		return true;
	}

	// Check for LogonUserA with LOGON_TYPE_NEW_CREDENTIALS (credential dumping)
	const logonUserNewCredsPattern = /LogonUserA.*LOGON_TYPE_NEW_CREDENTIALS/i;
	if (logonUserNewCredsPattern.test(command)) {
		return true;
	}

	// Check for ImpersonateLoggedOnUser API usage
	const impersonatePattern = /ImpersonateLoggedOnUser/i;
	if (impersonatePattern.test(command)) {
		return true;
	}

	// Check for RevertToSelf API usage
	const revertToSelfPattern = /RevertToSelf/i;
	if (revertToSelfPattern.test(command)) {
		return true;
	}

	// Check for psexec (Sysinternals remote execution tool)
	const psexecPattern = /psexec(?:\.exe)?\s+/i;
	if (psexecPattern.test(command)) {
		return true;
	}

	// Check for wmic process call create (can spawn processes)
	const wmicProcessCreatePattern = /wmic\s+process\s+call\s+create/i;
	if (wmicProcessCreatePattern.test(command)) {
		return true;
	}

	// Check for schtasks with elevated triggers
	const schtasksPattern = /schtasks\.exe?\s+/i;
	if (schtasksPattern.test(command)) {
		// Check for elevated privilege triggers
		const elevatedTriggerPatterns = [
			/SCHEDULE\s+ONACTION/i,
			/TRIGGER\s+.*HIGHEST/i,
			/RU\s+.*SYSTEM/i,
		];
		for (const pattern of elevatedTriggerPatterns) {
			if (pattern.test(command)) {
				return true;
			}
		}
	}

	// Check for at.exe (deprecated but still present on some systems)
	const atPattern = /\bat\.exe?\s+/i;
	if (atPattern.test(command)) {
		return true;
	}

	// Check for winrm or winrs (remote execution)
	const winrmPattern = /winrm\.exe\s+|winrs\.exe\s+/i;
	if (winrmPattern.test(command)) {
		return true;
	}

	// Check for PowerShell remoting
	const psRemotingPattern = /Invoke-Command\s+.*-ComputerName/i;
	if (psRemotingPattern.test(command)) {
		return true;
	}

	// Check for Enter-PSSession
	const psSessionPattern = /Enter-PSSession/i;
	if (psSessionPattern.test(command)) {
		return true;
	}

	return false;
}
