/**
 * PHP SAST Rules
 * Detects common security vulnerabilities in PHP code
 */

import type { SastRule } from './index';

/**
 * PHP security rules
 */
export const phpRules: SastRule[] = [
	{
		id: 'sast/php-unserialize',
		name: 'Unsafe unserialize',
		severity: 'critical',
		languages: ['php'],
		description: 'unserialize() on untrusted data can lead to object injection',
		remediation:
			'Use json_decode() instead of unserialize(). If you must use unserialize, validate the input with allowed_classes.',
		pattern: /unserialize\s*\(\s*\$_/,
	},
	{
		id: 'sast/php-command-injection',
		name: 'Command injection',
		severity: 'critical',
		languages: ['php'],
		description:
			'exec(), system(), or shell_exec() with user input can lead to command injection',
		remediation:
			'Never pass user input to shell functions. Use escapeshellarg() or escapeshellcmd() for any shell commands.',
		pattern: /(?:exec|system|shell_exec|passthru)\s*\(\s*\$_/,
	},
	{
		id: 'sast/php-eval',
		name: 'Dangerous eval() usage',
		severity: 'critical',
		languages: ['php'],
		description: 'eval() allows arbitrary code execution',
		remediation:
			'Avoid eval(). Use a safer alternative for dynamic code execution.',
		pattern: /\beval\s*\(/,
	},
	{
		id: 'sast/php-include',
		name: 'Dynamic file inclusion',
		severity: 'high',
		languages: ['php'],
		description:
			'include/require with user input can lead to remote/local file inclusion',
		remediation:
			'Never include files based on user input. Use a whitelist of allowed files.',
		pattern: /(?:include|require|include_once|require_once)\s*\(\s*\$_/,
	},
	{
		id: 'sast/php-xss',
		name: 'Potential XSS vulnerability',
		severity: 'high',
		languages: ['php'],
		description: 'User input in HTML output without escaping',
		remediation:
			'Use htmlspecialchars() or a templating engine with auto-escaping.',
		pattern: /(?:echo|print)\s+\$_(?:GET|POST|REQUEST|COOKIE)/,
	},
	{
		id: 'sast/php-sqli',
		name: 'Potential SQL injection',
		severity: 'critical',
		languages: ['php'],
		description: 'String concatenation in SQL query can lead to SQL injection',
		remediation:
			'Use prepared statements (PDO prepare/execute or mysqli prepared statements). Never concatenate user input into SQL.',
		pattern: /mysql_query\s*\([^)]*\$_/i,
	},
	{
		id: 'sast/php-file-read',
		name: 'Arbitrary file read',
		severity: 'high',
		languages: ['php'],
		description:
			'file_get_contents or fopen with user input can read arbitrary files',
		remediation:
			'Validate and sanitize file paths. Use a whitelist of allowed directories.',
		pattern: /(?:file_get_contents|fopen|readfile|file)\s*\(\s*\$_/,
	},
	{
		id: 'sast/php-assert',
		name: 'Assert with user input',
		severity: 'medium',
		languages: ['php'],
		description: 'assert() with user input can lead to code execution',
		remediation:
			'Avoid using assert() with dynamic input. Use proper validation instead.',
		pattern: /assert\s*\(\s*\$_/,
	},
	{
		id: 'sast/php-create-function',
		name: 'Dangerous create_function',
		severity: 'high',
		languages: ['php'],
		description: 'create_function() allows arbitrary code execution',
		remediation: 'Use anonymous functions instead of create_function().',
		pattern: /create_function\s*\(/,
	},
	{
		id: 'sast/php-preg-replace',
		name: 'preg_replace code execution',
		severity: 'high',
		languages: ['php'],
		description: 'preg_replace with /e modifier allows code execution',
		remediation:
			'Use preg_replace_callback instead of preg_replace with /e modifier.',
		pattern: /preg_replace\s*\(\s*\/[^/]*\/e/,
	},
];
