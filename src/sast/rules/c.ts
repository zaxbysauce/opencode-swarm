/**
 * C/C++ SAST Rules
 * Detects common security vulnerabilities in C/C++ code
 */

import type { SastRule } from './index';

/**
 * C/C++ security rules
 */
export const cRules: SastRule[] = [
	{
		id: 'sast/c-buffer-overflow',
		name: 'Buffer overflow vulnerability',
		severity: 'critical',
		languages: ['c', 'cpp'],
		description: 'strcpy/strcat to fixed-size buffer without bounds checking',
		remediation:
			'Use strncpy, snprintf, or safer alternatives that include size limits.',
		pattern: /\b(?:strcpy|strcat)\s*\(\s*[a-zA-Z_]/,
	},
	{
		id: 'sast/c-gets',
		name: 'Unsafe gets() usage',
		severity: 'critical',
		languages: ['c', 'cpp'],
		description: 'gets() does not check buffer bounds - removed from C11',
		remediation: 'Use fgets() with proper buffer size instead of gets().',
		pattern: /\bgets\s*\(/,
	},
	{
		id: 'sast/c-scanf',
		name: 'Unsafe scanf usage',
		severity: 'high',
		languages: ['c', 'cpp'],
		description: 'scanf without width specifier can cause buffer overflow',
		remediation:
			'Use width specifiers: scanf("%99s", buffer) for a 100-byte buffer.',
		pattern: /\bscanf\s*\(\s*["'][^%]*%s["']/,
	},
	{
		id: 'sast/c-strlen',
		name: 'Unsafe strlen in loop',
		severity: 'medium',
		languages: ['c', 'cpp'],
		description:
			'strlen() called in loop condition can lead to performance issues',
		remediation: 'Cache strlen result before loop or use a pointer approach.',
		pattern: /for\s*\([^)]*strlen\s*\(/,
	},
	{
		id: 'sast/c-sprintf',
		name: 'Unsafe sprintf usage',
		severity: 'high',
		languages: ['c', 'cpp'],
		description: 'sprintf does not check buffer bounds',
		remediation: 'Use snprintf which includes buffer size.',
		pattern: /\bsprintf\s*\(\s*[a-zA-Z_]/,
	},
	{
		id: 'sast/c-strdup',
		name: 'Memory leak via strdup',
		severity: 'low',
		languages: ['c', 'cpp'],
		description: 'strdup allocates memory that must be freed',
		remediation: 'Ensure all strdup results are freed to prevent memory leaks.',
		pattern: /\bstrdup\s*\(/,
	},
	{
		id: 'sast/c-atoi',
		name: 'Unsafe atoi usage',
		severity: 'medium',
		languages: ['c', 'cpp'],
		description: 'atoi does not report errors, returns 0 for invalid input',
		remediation: 'Use strtol or strtoul which provide error reporting.',
		pattern: /\b(?:atoi|atol|atof)\s*\(/,
	},
	{
		id: 'sast/c-format-string',
		name: 'Format string vulnerability',
		severity: 'high',
		languages: ['c', 'cpp'],
		description:
			'User input as format string can lead to information disclosure',
		remediation:
			'Never use user input as format string: printf("%s", userInput) not printf(userInput).',
		pattern: /printf\s*\(\s*\$_/,
	},
	{
		id: 'sast/c-weak-random',
		name: 'Weak random number generation',
		severity: 'medium',
		languages: ['c', 'cpp'],
		description: 'Using rand() for security-critical randomness',
		remediation:
			'Use cryptographic random: getrandom(), arc4random(), or /dev/urandom.',
		pattern: /\brand\s*\(\s*\)/,
	},
];
