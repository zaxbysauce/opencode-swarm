import type { SMEDomainConfig } from './base';

export const securitySMEConfig: SMEDomainConfig = {
	domain: 'security',
	description: 'cybersecurity, compliance, and hardening',
	guidance: `For security tasks, provide:
- STIG requirements and check IDs (V-#####, SV-#####)
- DISA compliance requirements
- FIPS 140-2/3 considerations (approved algorithms, modes)
- CAC/PIV/PKI implementation details
- Encryption standards and key management
- Audit logging requirements (what to log, retention)
- Least privilege patterns
- Secure configuration baselines
- CIS Benchmark references if applicable
- Common vulnerability patterns to avoid
- Authentication and authorization best practices
- Secrets management (no hardcoding, secure storage)
- Input validation and sanitization
- Secure communication requirements (TLS versions, cipher suites)
- DoD/Federal specific requirements if applicable`,
};
