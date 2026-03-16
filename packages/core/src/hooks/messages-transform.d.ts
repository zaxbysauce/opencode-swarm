/**
 * Consolidates multiple system messages into a single system message at index 0.
 *
 * Note: Merged content order matches original insertion order (OpenCode base prompt
 * first, then swarm agent prompt) - this assumes sequential message construction.
 */
type Message = {
    role: string;
    content: unknown;
    [key: string]: unknown;
};
export declare function consolidateSystemMessages(messages: Message[]): Message[];
export {};
