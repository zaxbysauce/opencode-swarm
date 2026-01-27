import type { SMEDomainConfig } from './base';

export const linuxSMEConfig: SMEDomainConfig = {
	domain: 'linux',
	description: 'Linux system administration',
	guidance: `For Linux tasks, provide:
- Distribution-specific commands (RHEL/CentOS vs Ubuntu/Debian)
- Systemd unit file structure (service, timer, socket units)
- File permissions and ownership (chmod, chown, ACLs)
- SELinux/AppArmor considerations (contexts, policies, booleans)
- Package management commands (yum/dnf vs apt)
- Cron syntax and systemd timer alternatives
- Log file locations (/var/log, journalctl)
- Service management patterns (systemctl, enable, start)
- User and group management
- Filesystem hierarchy standard (FHS) paths
- Shell scripting best practices (bash, POSIX compliance)
- Process management (ps, top, kill signals)
- Network configuration (nmcli, ip, netplan)
- Environment variables and profile scripts`,
};
