import type { SMEDomainConfig } from './base';

export const activeDirectorySMEConfig: SMEDomainConfig = {
	domain: 'active_directory',
	description: 'Active Directory and identity management',
	guidance: `For Active Directory tasks, provide:
- AD PowerShell module cmdlets (Get-ADUser, Set-ADUser, etc.)
- LDAP filter syntax and examples
- Distinguished name (DN) formats
- Group Policy structure and processing order
- Kerberos authentication flow considerations
- SPN (Service Principal Name) configuration
- AD schema and common attributes
- Replication and site topology concepts
- Organizational Unit (OU) design patterns
- Security group types (Domain Local, Global, Universal)
- Delegation of control patterns
- Fine-grained password policies
- AD object GUIDs and SIDs
- Trust relationships
- ADSI/DirectoryServices .NET classes
- Common AD error codes and resolutions
- Group Policy preferences vs policies`,
};
