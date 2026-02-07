import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createAgents, getAgentConfigs } from '../../../src/agents';
import type { PluginConfig } from '../../../src/config';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let originalXDG: string | undefined;

beforeEach(() => {
    originalXDG = process.env.XDG_CONFIG_HOME;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-test-'));
    process.env.XDG_CONFIG_HOME = tempDir;
});

afterEach(() => {
    if (originalXDG === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXDG;
});

describe('createAgents', () => {
    describe('no config', () => {
        it('returns 7 agents', () => {
            const agents = createAgents();
            expect(agents).toHaveLength(7);
        });

        it('agent names are correct', () => {
            const agents = createAgents();
            const names = agents.map(a => a.name).sort();
            expect(names).toEqual([
                'architect',
                'coder',
                'critic',
                'explorer',
                'reviewer',
                'sme',
                'test_engineer'
            ]);
        });

        it('each agent has model, temperature, prompt, description', () => {
            const agents = createAgents();
            
            for (const agent of agents) {
                expect(agent).toHaveProperty('name');
                expect(agent).toHaveProperty('config');
                expect(agent.config).toHaveProperty('model');
                expect(agent.config).toHaveProperty('temperature');
                expect(agent.config).toHaveProperty('prompt');
                expect(agent).toHaveProperty('description');
                
                // Verify properties are not empty
                expect(agent.name.length).toBeGreaterThan(0);
                expect(agent.config.model?.length ?? 0).toBeGreaterThan(0);
                expect(typeof agent.config.temperature).toBe('number');
                expect(agent.config.temperature).toBeGreaterThanOrEqual(0);
                expect(agent.config.temperature).toBeLessThanOrEqual(2);
                expect(agent.config.prompt?.length ?? 0).toBeGreaterThan(0);
                expect(agent.description?.length ?? 0).toBeGreaterThan(0);
            }
        });
    });

    describe('with agent overrides', () => {
        it('model override applies correctly', () => {
            const config = {
                agents: {
                    coder: {
                        model: 'custom/model'
                    }
                }
            };
            
            const agents = createAgents(config as unknown as PluginConfig);
            const coder = agents.find(a => a.name === 'coder');
            expect(coder?.config.model).toBe('custom/model');
        });

        it('temperature override applies correctly', () => {
            const config = {
                agents: {
                    coder: {
                        temperature: 0.5
                    }
                }
            };
            
            const agents = createAgents(config as unknown as PluginConfig);
            const coder = agents.find(a => a.name === 'coder');
            expect(coder?.config.temperature).toBe(0.5);
        });

        it('disabled agent is filtered out', () => {
            const config = {
                agents: {
                    sme: {
                        disabled: true
                    }
                }
            };
            
            const agents = createAgents(config as unknown as PluginConfig);
            const sme = agents.find(a => a.name === 'sme');
            expect(sme).toBeUndefined();
            expect(agents).toHaveLength(6);
        });
    });

    describe('with swarms', () => {
        it('single swarm named default has no prefix', () => {
            const config = {
                swarms: {
                    default: {}
                }
            };
            
            const agents = createAgents(config as unknown as PluginConfig);
            const names = agents.map(a => a.name).sort();
            expect(names).toEqual([
                'architect',
                'coder',
                'critic',
                'explorer',
                'reviewer',
                'sme',
                'test_engineer'
            ]);
        });

        it('single named swarm adds prefix to all agents', () => {
            const config = {
                swarms: {
                    local: {
                        name: 'Local'
                    }
                }
            };
            
            const agents = createAgents(config as unknown as PluginConfig);
            const names = agents.map(a => a.name).sort();
            expect(names).toEqual([
                'local_architect',
                'local_coder',
                'local_critic',
                'local_explorer',
                'local_reviewer',
                'local_sme',
                'local_test_engineer'
            ]);
        });

        it('architect prompt contains swarm header for non-default swarms', () => {
            const config = {
                swarms: {
                    cloud: {
                        name: 'Cloud'
                    }
                }
            };
            
            const agents = createAgents(config as unknown as PluginConfig);
            const cloudArchitect = agents.find(a => a.name === 'cloud_architect');
            expect(cloudArchitect?.description).toContain('[Cloud]');
            expect(cloudArchitect?.config.prompt).toContain('## ⚠️ YOU ARE THE CLOUD SWARM ARCHITECT');
            expect(cloudArchitect?.config.prompt).toContain('cloud_');
        });
    });

    describe('architect template replacement', () => {
        it('default swarm replaces SWARM_ID with "default"', () => {
            const agents = createAgents();
            const architect = agents.find(a => a.name === 'architect');
            expect(architect?.config.prompt).toContain('Swarm: default');
            expect(architect?.config.prompt).not.toContain('{{SWARM_ID}}');
        });

        it('default swarm replaces AGENT_PREFIX with empty string', () => {
            const agents = createAgents();
            const architect = agents.find(a => a.name === 'architect');
            expect(architect?.config.prompt).not.toContain('{{AGENT_PREFIX}}');
        });

        it('default swarm replaces QA_RETRY_LIMIT with default value 3', () => {
            const agents = createAgents();
            const architect = agents.find(a => a.name === 'architect');
            expect(architect?.config.prompt).toContain('3');
            expect(architect?.config.prompt).not.toContain('{{QA_RETRY_LIMIT}}');
        });

        it('custom qa_retry_limit replaces correctly', () => {
            const config = {
                qa_retry_limit: 5
            };
            
            const agents = createAgents(config as unknown as PluginConfig);
            const architect = agents.find(a => a.name === 'architect');
            expect(architect?.config.prompt).toContain('5');
            expect(architect?.config.prompt).not.toContain('{{QA_RETRY_LIMIT}}');
        });
    });
});

describe('getAgentConfigs', () => {
    it('returns Record<string, SDKAgentConfig>', () => {
        const configs = getAgentConfigs();
        expect(typeof configs).toBe('object');
        expect(configs).not.toBeNull();
        
        for (const [name, config] of Object.entries(configs)) {
            expect(typeof name).toBe('string');
            expect(name.length).toBeGreaterThan(0);
            expect(config).toHaveProperty('model');
            expect(config).toHaveProperty('temperature');
            expect(config).toHaveProperty('prompt');
            expect(config).toHaveProperty('description');
            expect(config).toHaveProperty('mode');
        }
    });

    it('architect has mode primary', () => {
        const configs = getAgentConfigs();
        const architect = configs.architect;
        expect(architect.mode).toBe('primary');
    });

    it('all other agents have mode subagent', () => {
        const configs = getAgentConfigs();
        const agentNames = Object.keys(configs).filter(name => name !== 'architect');
        
        for (const name of agentNames) {
            expect(configs[name].mode).toBe('subagent');
        }
    });

    it('each agent config includes description', () => {
        const configs = getAgentConfigs();
        
        for (const [name, config] of Object.entries(configs)) {
            expect(config.description?.length ?? 0).toBeGreaterThan(0);
        }
    });

    it('prefixed architect also has mode primary', () => {
        const config = {
            swarms: {
                local: {
                    name: 'Local'
                }
            }
        };
        
        const configs = getAgentConfigs(config as unknown as PluginConfig);
        const localArchitect = configs.local_architect;
        expect(localArchitect.mode).toBe('primary');
    });

    it('handles agent overrides in getAgentConfigs', () => {
        const config = {
            agents: {
                coder: {
                    model: 'custom/model',
                    temperature: 0.7
                }
            }
        };
        
        const configs = getAgentConfigs(config as unknown as PluginConfig);
        const coder = configs.coder;
        expect(coder.model).toBe('custom/model');
        expect(coder.temperature).toBe(0.7);
    });

    it('handles disabled agents in getAgentConfigs', () => {
        const config = {
            agents: {
                sme: {
                    disabled: true
                }
            }
        };
        
        const configs = getAgentConfigs(config as unknown as PluginConfig);
        expect(configs.sme).toBeUndefined();
        expect(Object.keys(configs)).toHaveLength(6);
    });
});