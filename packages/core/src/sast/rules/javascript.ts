/**
 * JavaScript/TypeScript SAST Rules
 * Detects common security vulnerabilities in JS/TS code
 */

import type { SastRule } from './index';

/**
 * JavaScript/TypeScript security rules
 */
export const javascriptRules: SastRule[] = [
	{
		id: 'sast/js-eval',
		name: 'Dangerous eval() Usage',
		severity: 'high',
		languages: ['javascript', 'typescript'],
		description:
			'Dangerous use of eval() detected - allows arbitrary code execution',
		remediation:
			'Avoid using eval(). If you must parse dynamic content, use JSON.parse() or a proper parser instead.',
		pattern: /\beval\s*\(/,
	},
	{
		id: 'sast/js-dangerous-function',
		name: 'Dangerous new Function()',
		severity: 'high',
		languages: ['javascript', 'typescript'],
		description:
			'Dangerous use of new Function() detected - allows arbitrary code execution',
		remediation:
			'Avoid using new Function(). Use a safer alternative like JSON.parse() or a proper expression parser.',
		pattern: /\bnew\s+Function\s*\(/,
	},
	{
		id: 'sast/js-command-injection',
		name: 'Command Injection via child_process',
		severity: 'critical',
		languages: ['javascript', 'typescript'],
		description:
			'Potential command injection via child_process.exec() with unsanitized input',
		remediation:
			'Never pass user input directly to exec(). Use execFile() with arguments array or sanitize input thoroughly.',
		pattern: /exec\s*\(\s*[`'"]/,
		validate: (_match, _context) => {
			// Skip validation for now - we detect the pattern first
			return true;
		},
	},
	{
		id: 'sast/js-set-timeout-string',
		name: 'setTimeout/setInterval with string',
		severity: 'high',
		languages: ['javascript', 'typescript'],
		description:
			'setTimeout/setInterval called with string argument - similar to eval()',
		remediation:
			'Use function references instead of strings: setTimeout(() => ..., 1000) instead of setTimeout("...", 1000)',
		pattern: /(?:setTimeout|setInterval)\s*\(\s*['"`]/,
	},
	{
		id: 'sast/js-innerhtml',
		name: 'Dangerous innerHTML usage',
		severity: 'medium',
		languages: ['javascript', 'typescript'],
		description:
			'Potential XSS via innerHTML - user input may be injected into DOM',
		remediation:
			'Use textContent instead of innerHTML, or sanitize input with a library like DOMPurify.',
		pattern: /\.innerHTML\s*=/,
	},
	{
		id: 'sast/js-document-write',
		name: 'Dangerous document.write usage',
		severity: 'medium',
		languages: ['javascript', 'typescript'],
		description: 'document.write() can introduce XSS vulnerabilities',
		remediation:
			'Use DOM manipulation methods (createElement, appendChild, textContent) instead.',
		pattern: /document\.write\s*\(/,
	},
	{
		id: 'sast/js-postmessage',
		name: 'Unsafely handling postMessage',
		severity: 'medium',
		languages: ['javascript', 'typescript'],
		description: 'postMessage event listener without origin validation',
		remediation:
			'Always validate the origin in postMessage event handlers: event.origin === expectedOrigin',
		pattern: /addEventListener\s*\(\s*['"]message['"]/,
	},
	{
		id: 'sast/js-hardcoded-secret',
		name: 'Hardcoded secret detected',
		severity: 'critical',
		languages: ['javascript', 'typescript'],
		description: 'Potential hardcoded API key, password, or token detected',
		remediation:
			'Move secrets to environment variables or a secure secrets manager.',
		pattern:
			/(?:api_key|password|secret|token|auth)[_-]?\w*\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/i,
	},
];
