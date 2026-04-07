/**
 * Handles the /swarm turbo command.
 * Toggles Turbo Mode on or off for the active session.
 *
 * @param directory - Project directory (unused but kept for consistency with other commands)
 * @param args - Optional argument: "on" | "off" | undefined (toggle behavior)
 * @param sessionID - Session ID for accessing active session state
 * @returns Feedback message about Turbo Mode state
 */
export declare function handleTurboCommand(_directory: string, args: string[], sessionID: string): Promise<string>;
