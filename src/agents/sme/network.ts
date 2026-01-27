import type { SMEDomainConfig } from './base';

export const networkSMEConfig: SMEDomainConfig = {
	domain: 'network',
	description: 'network architecture, protocols, and security',
	guidance: `For network tasks, provide:
- Protocol specifications and standard port numbers
- Firewall rule syntax (Windows Firewall, iptables, firewalld)
- DNS record types and configuration (A, AAAA, CNAME, MX, TXT, SRV)
- Certificate requirements and chain validation
- TLS/SSL configuration best practices (cipher suites, protocols)
- Load balancer and proxy considerations
- Network troubleshooting commands (ping, tracert, nslookup, netstat)
- Security group and ACL patterns
- IP addressing and subnetting
- VLAN configuration concepts
- NAT and port forwarding
- HTTP/HTTPS specifics (headers, status codes, methods)
- Socket programming considerations
- Common network errors and their causes`,
};
