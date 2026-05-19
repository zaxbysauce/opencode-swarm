# Failure classifier infrastructure category (issue #495)

## What changed

- Added `infrastructure_failure` to `FailureClassification` in
  `src/test-impact/failure-classifier.ts`.
- Added infrastructure-error detection in `classifyFailure` for common stderr
  patterns:
  `OutOfMemoryError`, `Killed`, `ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND`, and
  exit code `137`.
- Added regression coverage in
  `src/test-impact/__tests__/failure-classifier.test.ts` to verify each pattern
  classifies as `infrastructure_failure`.
- Updated downstream barrel export typing test in
  `src/tools/__tests__/barrel-exports.test.ts`.

## Why

Previously these failures were classified as `unknown`, which reduced triage
quality. The new category identifies likely environment/infra breakages without
changing non-infrastructure classification behavior.
