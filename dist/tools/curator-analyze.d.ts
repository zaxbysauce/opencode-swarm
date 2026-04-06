/**
 * Curator analyze tool — explicit mechanism to trigger curator phase analysis
 * and apply knowledge recommendations. Closes the curator data pipeline by
 * giving the architect an explicit tool to call after reviewing phase data.
 */
import { createSwarmTool } from './create-tool';
export declare const curator_analyze: ReturnType<typeof createSwarmTool>;
