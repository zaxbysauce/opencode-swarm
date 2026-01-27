import type { SMEDomainConfig } from './base';

export const pythonSMEConfig: SMEDomainConfig = {
	domain: 'python',
	description: 'Python development and ecosystem',
	guidance: `For Python tasks, provide:
- Recommended libraries for the task (stdlib vs third-party)
- Windows-specific modules (pywin32, wmi, winreg, ctypes)
- Correct API usage patterns and idioms
- Virtual environment considerations (venv, pip install)
- Type hints and dataclass usage
- Exception handling patterns (specific exceptions, context managers)
- File handling (pathlib vs os.path, encoding considerations)
- Cross-platform compatibility notes
- Async patterns if applicable (asyncio, aiohttp)
- Logging configuration (logging module setup)
- Package structure for larger scripts
- Python version compatibility (3.8+ features)
- Common gotchas (mutable default arguments, import cycles)`,
};
