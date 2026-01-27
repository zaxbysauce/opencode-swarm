import type { SMEDomainConfig } from './base';

export const azureSMEConfig: SMEDomainConfig = {
	domain: 'azure',
	description: 'Microsoft Azure cloud services',
	guidance: `For Azure tasks, provide:
- Az PowerShell module cmdlets (Az.Accounts, Az.Compute, etc.)
- Azure CLI (az) command syntax
- ARM template structure and syntax
- Bicep syntax and patterns
- Entra ID (formerly Azure AD) configuration
- RBAC role assignments and custom roles
- Resource naming conventions and constraints
- Service principal and managed identity configuration
- Azure resource provider namespaces
- Common Azure resource types and properties
- Subscription and resource group scoping
- Azure networking (VNet, NSG, Load Balancer)
- Storage account types and access tiers
- Azure Key Vault integration patterns
- Cost management considerations
- Azure Government differences if applicable`,
};
