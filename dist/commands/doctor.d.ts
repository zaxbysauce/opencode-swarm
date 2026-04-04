/**
 * Handle /swarm config doctor command.
 * Maps to: config doctor service (runConfigDoctor)
 */
export declare function handleDoctorCommand(directory: string, args: string[]): Promise<string>;
/**
 * Handle /swarm doctor tools command.
 * Maps to: tool doctor service (runToolDoctor)
 */
export declare function handleDoctorToolsCommand(directory: string, _args: string[]): Promise<string>;
