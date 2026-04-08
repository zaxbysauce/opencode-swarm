import type { EnvironmentProfile } from './profile.js';
/**
 * Renders a concise runtime environment block for agent prompts.
 * Audience: 'coder' or 'testengineer'
 */
export declare function renderEnvironmentPrompt(profile: EnvironmentProfile, audience: 'coder' | 'testengineer'): string;
