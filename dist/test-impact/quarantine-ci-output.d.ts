import type { QuarantineArtifact, QuarantineArtifactEntry } from './quarantine-artifact.js';
/**
 * Format a single quarantined test as a GitHub Actions warning annotation.
 * Format: ::warning file={testFile},title=Flaky test: {testName}::{testName} flakyScore={flakyScore} runs={totalRuns} recommendation={recommendation}
 */
export declare function formatAnnotation(entry: QuarantineArtifactEntry): string;
/**
 * Read quarantine artifact and emit GitHub Actions annotations to stdout.
 * Returns the number of annotations emitted.
 * Returns 0 if no quarantine artifact exists or no tests are quarantined.
 */
export declare function emitQuarantineAnnotations(workingDir?: string): number;
/**
 * Format the full quarantine summary as a GitHub Actions summary block.
 * Uses ::group:: and ::endgroup:: for collapsible sections.
 */
export declare function formatQuarantineSummary(artifact: QuarantineArtifact): string;
