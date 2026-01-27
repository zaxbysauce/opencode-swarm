import type { SMEDomainConfig } from './base';

export const vmwareSMEConfig: SMEDomainConfig = {
	domain: 'vmware',
	description: 'VMware vSphere and virtualization',
	guidance: `For VMware tasks, provide:
- PowerCLI cmdlet names and syntax (Get-VM, Set-VM, etc.)
- vSphere API objects and methods
- ESXi shell commands (esxcli, vim-cmd)
- Datastore path formats ([datastore1] path/to/file.vmdk)
- VM hardware version compatibility
- vMotion and DRS requirements and constraints
- Storage policy configuration (SPBM)
- Network adapter types and configurations (vmxnet3, e1000e)
- Snapshot management considerations
- Template and clone operations
- Resource pool and cluster concepts
- vCenter Server connection handling
- Certificate and authentication requirements
- Common vSphere error codes and solutions
- Performance metrics and monitoring (Get-Stat)`,
};
