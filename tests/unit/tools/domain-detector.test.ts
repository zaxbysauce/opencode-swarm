import { describe, it, expect } from 'bun:test';
import { detect_domains } from '../../../src/tools/domain-detector';
import type { ToolContext } from '@opencode-ai/plugin/tool';

// Mock ToolContext for testing
const mockContext: ToolContext = {
	sessionID: 'test-session',
	messageID: 'test-message',
	agent: 'test-agent',
	directory: '/test/dir',
	worktree: '/test/worktree',
	abort: new AbortController().signal,
	metadata: () => {},
	ask: async () => {},
};

describe('detect_domains', () => {
	describe('single domain detection', () => {
		it('should detect windows domain', async () => {
			const result = await detect_domains.execute({ text: 'I need help with Windows registry and WMI queries' }, mockContext);
			expect(result).toContain('windows');
		});

		it('should detect powershell domain', async () => {
			const result = await detect_domains.execute({ text: 'Creating a PowerShell cmdlet to Get-Process and Set-Item' }, mockContext);
			expect(result).toContain('powershell');
		});

		it('should detect python domain', async () => {
			const result = await detect_domains.execute({ text: 'Setting up Python with pip and pandas for data analysis' }, mockContext);
			expect(result).toContain('python');
		});

		it('should detect oracle domain', async () => {
			const result = await detect_domains.execute({ text: 'Connecting to Oracle database using SQLPlus and PL/SQL' }, mockContext);
			expect(result).toContain('oracle');
		});

		it('should detect network domain', async () => {
			const result = await detect_domains.execute({ text: 'Configuring network firewall rules and DNS settings' }, mockContext);
			expect(result).toContain('network');
		});

		it('should detect security domain', async () => {
			const result = await detect_domains.execute({ text: 'Implementing security hardening and compliance checks' }, mockContext);
			expect(result).toContain('security');
		});

		it('should detect linux domain', async () => {
			const result = await detect_domains.execute({ text: 'Managing Linux services with systemctl and bash scripts' }, mockContext);
			expect(result).toContain('linux');
		});

		it('should detect vmware domain', async () => {
			const result = await detect_domains.execute({ text: 'Deploying VMware vSphere with ESXi and vCenter' }, mockContext);
			expect(result).toContain('vmware');
		});

		it('should detect azure domain', async () => {
			const result = await detect_domains.execute({ text: 'Setting up Azure virtual machines and Entra ID' }, mockContext);
			expect(result).toContain('azure');
		});

		it('should detect active_directory domain', async () => {
			const result = await detect_domains.execute({ text: 'Managing Active Directory users and LDAP queries' }, mockContext);
			expect(result).toContain('active_directory');
		});

		it('should detect ui_ux domain', async () => {
			const result = await detect_domains.execute({ text: 'Designing UI/UX with wireframes and user interface elements' }, mockContext);
			expect(result).toContain('ui_ux');
		});
	});

	describe('multi-domain detection', () => {
		it('should detect multiple domains from mixed keywords', async () => {
			const result = await detect_domains.execute({
				text: 'Creating PowerShell scripts for Windows server management with Active Directory integration',
			}, mockContext);
			expect(result).toContain('powershell');
			expect(result).toContain('windows');
			expect(result).toContain('active_directory');
		});

		it('should detect network and security domains', async () => {
			const result = await detect_domains.execute({
				text: 'Configuring firewall rules for network compliance and audit management',
			}, mockContext);
			expect(result).toContain('network');
			expect(result).toContain('security');
		});

		it('should detect azure and linux domains', async () => {
			const result = await detect_domains.execute({
				text: 'Deploying applications on Azure VM running Ubuntu Linux with bash automation',
			}, mockContext);
			expect(result).toContain('azure');
			expect(result).toContain('linux');
		});
	});

	describe('no match scenarios', () => {
		it('should return no domains detected message for unrelated text', async () => {
			const result = await detect_domains.execute({
				text: 'This is just regular text about weather and cooking',
			}, mockContext);
			expect(result).toBe('No specific domains detected. The Architect should determine requirements from context.');
		});

		it('should return no domains detected for empty string', async () => {
			const result = await detect_domains.execute({ text: '' }, mockContext);
			expect(result).toBe('No specific domains detected. The Architect should determine requirements from context.');
		});

		it('should return no domains detected for whitespace', async () => {
			const result = await detect_domains.execute({ text: '   \n\t  ' }, mockContext);
			expect(result).toBe('No specific domains detected. The Architect should determine requirements from context.');
		});
	});

	describe('case insensitivity', () => {
		it('should detect powershell in uppercase', async () => {
			const result = await detect_domains.execute({ text: 'POWERSHELL scripts for automation' }, mockContext);
			expect(result).toContain('powershell');
		});

		it('should detect windows in mixed case', async () => {
			const result = await detect_domains.execute({ text: 'Windows Registry editing with RegEdit' }, mockContext);
			expect(result).toContain('windows');
		});

		it('should detect oracle in lowercase', async () => {
			const result = await detect_domains.execute({ text: 'oracle database configuration' }, mockContext);
			expect(result).toContain('oracle');
		});

		it('should handle mixed case in patterns', async () => {
			const result = await detect_domains.execute({ text: 'Active DIRECTORY and LDAP integration' }, mockContext);
			expect(result).toContain('active_directory');
		});
	});

	describe('single domain occurrence', () => {
		it('should only list each domain once even with multiple matches', async () => {
			const result = await detect_domains.execute({
				text: 'Windows Windows Windows registry and WMI Windows services',
			}, mockContext);
			const windowsMatches = result.match(/windows/g);
			expect(windowsMatches).not.toBeNull();
			// Should only appear once in the detected domains list
			const windowsInList = result.split('Detected domains: ')[1]?.split('\n')[0].split(', ').filter(d => d === 'windows');
			expect(windowsInList?.length).toBe(1);
		});

		it('should handle multiple patterns for same domain', async () => {
			const result = await detect_domains.execute({
				text: 'Python and Django and Flask and Pandas framework',
			}, mockContext);
			const pythonMatches = result.match(/python/g);
			expect(pythonMatches).not.toBeNull();
			// Should only appear once despite multiple Python-related patterns matching
			const pythonInList = result.split('Detected domains: ')[1]?.split('\n')[0].split(', ').filter(d => d === 'python');
			expect(pythonInList?.length).toBe(1);
		});
	});

	describe('return format', () => {
		it('should return correct format for detected domains', async () => {
			const result = await detect_domains.execute({ text: 'Azure and Python development' }, mockContext);
			expect(result).toStartWith('Detected domains: ');
			expect(result).toContain('\n\nUse these as DOMAIN values when delegating to @sme.');
		});

		it('should join domains with comma and space', async () => {
			const result = await detect_domains.execute({ text: 'Linux bash scripting and Python automation' }, mockContext);
			expect(result).toContain('python, linux');
		});

		it('should maintain alphabetical order for multiple domains', async () => {
			const result = await detect_domains.execute({ text: 'Python and Azure and Linux development' }, mockContext);
			const domainsSection = result.split('Detected domains: ')[1]?.split('\n')[0];
			expect(domainsSection).toMatch(/^python, linux, azure/);
		});
	});

	describe('specific pattern matching', () => {
		it('should match Oracle error codes', async () => {
			const result = await detect_domains.execute({ text: 'ORA-12541: TNS:no listener error' }, mockContext);
			expect(result).toContain('oracle');
		});

		it('should match PowerShell cmdlets', async () => {
			const result = await detect_domains.execute({ text: 'Get-ChildItem and New-Item commands' }, mockContext);
			expect(result).toContain('powershell');
		});

		it('should match complex patterns', async () => {
			const result = await detect_domains.execute({ text: 'scheduled task configuration via Group Policy' }, mockContext);
			expect(result).toContain('windows');
		});

		it('should match partial word patterns', async () => {
			const result = await detect_domains.execute({ text: 'vulnerability assessment and hardening' }, mockContext);
			expect(result).toContain('security');
		});
	});
});