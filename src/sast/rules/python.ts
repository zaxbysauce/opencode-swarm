/**
 * Python SAST Rules
 * Detects common security vulnerabilities in Python code
 */

import type { SastRule } from './index';

/**
 * Python security rules
 */
export const pythonRules: SastRule[] = [
	{
		id: 'sast/py-pickle',
		name: 'Unsafe pickle deserialization',
		severity: 'high',
		languages: ['python'],
		description:
			'pickle.loads() called on potentially untrusted data - can lead to arbitrary code execution',
		remediation:
			'Use a safer serialization format like JSON, or validate the data source before deserializing with pickle.',
		pattern: /pickle\.loads?\s*\(/,
	},
	{
		id: 'sast/py-shell-injection',
		name: 'Shell injection via subprocess',
		severity: 'critical',
		languages: ['python'],
		description: 'subprocess with shell=True allows shell injection',
		remediation:
			'Use subprocess.run() with shell=False and pass arguments as a list. Avoid shell=True.',
		pattern: /shell\s*=\s*True/,
	},
	{
		id: 'sast/py-yaml-unsafe',
		name: 'Unsafe YAML loading',
		severity: 'high',
		languages: ['python'],
		description: 'yaml.load() without SafeLoader can execute arbitrary code',
		remediation:
			'Use yaml.safe_load() instead of yaml.load() for untrusted input.',
		pattern: /yaml\.load\s*\(/,
		validate: (_match, context) => {
			const content = context.content;
			if (content.includes('SafeLoader') || content.includes('safe_load')) {
				return false;
			}
			return true;
		},
	},
	{
		id: 'sast/py-eval',
		name: 'Dangerous eval() usage',
		severity: 'high',
		languages: ['python'],
		description: 'eval() allows arbitrary code execution',
		remediation:
			'Avoid eval(). Use ast.literal_eval() for safe literal evaluation or a proper parser.',
		pattern: /\beval\s*\(/,
	},
	{
		id: 'sast/py-exec',
		name: 'Dangerous exec() usage',
		severity: 'high',
		languages: ['python'],
		description: 'exec() allows arbitrary code execution',
		remediation:
			'Avoid exec(). Use a safer alternative for dynamic code execution.',
		pattern: /\bexec\s*\(/,
	},
	{
		id: 'sast/py-os-system',
		name: 'os.system() shell injection',
		severity: 'critical',
		languages: ['python'],
		description:
			'os.system() passes command to shell - vulnerable to injection',
		remediation:
			'Use subprocess module with shell=False instead of os.system().',
		pattern: /os\.system\s*\(/,
	},
	{
		id: 'sast/py-assert',
		name: 'Debug assert statements left in code',
		severity: 'low',
		languages: ['python'],
		description:
			'assert statements can be disabled with -O flag, potentially hiding security checks',
		remediation:
			'Move security-related assertions to proper validation functions that cannot be disabled.',
		pattern: /^\s*assert\s+/m,
	},
	{
		id: 'sast/py-sql-injection',
		name: 'Potential SQL injection',
		severity: 'critical',
		languages: ['python'],
		description: 'String concatenation in SQL query can lead to SQL injection',
		remediation:
			'Use parameterized queries or an ORM. Never concatenate user input into SQL strings.',
		pattern: /execute\s*\(\s*f["']/,
	},
	{
		id: 'sast/py-hardcoded-secret',
		name: 'Hardcoded secret detected',
		severity: 'critical',
		languages: ['python'],
		description: 'Potential hardcoded API key, password, or token detected',
		remediation:
			'Move secrets to environment variables or a secure secrets manager.',
		pattern:
			/(?:api_key|password|secret|token|auth)[_-]?\w*\s*=\s*['"][a-zA-Z0-9_-]{20,}['"]/i,
	},
	{
		id: 'sast/py-marshal',
		name: 'Unsafe marshal deserialization',
		severity: 'high',
		languages: ['python'],
		description: 'marshal.loads() can execute arbitrary code',
		remediation:
			'Use JSON or other safe serialization formats instead of marshal.',
		pattern: /marshal\.loads?\s*\(/,
	},
];
