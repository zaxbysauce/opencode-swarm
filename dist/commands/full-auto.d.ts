/**
 * Handles the /swarm full-auto command.
 * Toggles Full-Auto Mode on or off for the active session.
 *
 * @param directory - Project directory (unused but kept for consistency with other commands)
 * @param args - Optional argument: "on" | "off" | undefined (toggle behavior)
 * @param sessionID - Session ID for accessing active session state
 * @returns Feedback message about Full-Auto Mode state
 */
export declare function handleFullAutoCommand(_directory: string, args: string[], sessionID: string): Promise<string>;
