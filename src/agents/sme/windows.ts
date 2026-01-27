import type { SMEDomainConfig } from './base';

export const windowsSMEConfig: SMEDomainConfig = {
	domain: 'windows',
	description: 'Windows operating system internals and administration',
	guidance: `For Windows tasks, provide:
- Registry paths and correct hive locations (HKLM, HKCU, HKU)
- WMI/CIM class names and properties (Win32_*, CIM_*)
- Service names (exact), dependencies, and startup types
- File system locations (System32, SysWOW64, ProgramData, AppData)
- Permission requirements (admin, SYSTEM, TrustedInstaller)
- COM objects and interfaces when relevant
- Event log sources, channels, and event IDs
- Scheduled task configuration (triggers, actions, principals)
- Windows API calls if needed (P/Invoke signatures)
- UAC considerations and elevation requirements
- 32-bit vs 64-bit considerations (WoW64 redirection)`,
};
