import type { SMEDomainConfig } from './base';

export const powershellSMEConfig: SMEDomainConfig = {
	domain: 'powershell',
	description: 'PowerShell scripting and automation',
	guidance: `For PowerShell tasks, provide:
- Correct cmdlet names, parameters, and syntax
- Required modules and how to import them (Import-Module, #Requires)
- Pipeline patterns and object handling
- Error handling with try/catch and $ErrorActionPreference
- Output formatting and object types ([PSCustomObject], etc.)
- Remote execution (PSSession, Invoke-Command, -ComputerName)
- Module compatibility (Windows PowerShell 5.1 vs PowerShell 7+)
- Common parameter patterns (-Verbose, -WhatIf, -Confirm, -ErrorAction)
- Splatting for complex parameter sets
- Advanced function patterns ([CmdletBinding()], param blocks)
- Pester testing patterns for the code
- Credential handling (Get-Credential, [PSCredential])
- Output streams (Write-Output, Write-Verbose, Write-Error)`,
};
