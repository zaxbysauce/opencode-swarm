#!/usr/bin/env bash
# Check for mock.module / vi.mock cross-contamination by running known-problematic
# test file pairs together in the same Bun process. Bun's shared test runner can
# leak vi.mock('node:fs') and vi.mock('node:child_process') across files, causing
# false test failures that don't appear when tests run individually.
set -euo pipefail

# Known cross-contamination pairs (files + expected pass count when co-run).
# If these pairs produce fewer passes than the sum of individual runs, a mock
# module is leaking between test files.
PAIRS=(
  "tests/unit/diff/ast-diff.test.ts|src/hooks/__tests__/semantic-diff-injection.test.ts|41|16"
)

failed=0
tmpdir="${RUNNER_TEMP:-${TEMP:-/tmp}}"

for pair in "${PAIRS[@]}"; do
  IFS='|' read -r file_a file_b expected_a expected_b <<< "$pair"
  expected=$((expected_a + expected_b))

  tmp="$tmpdir/cross-contam-$$-${file_a##*/}-${file_b##*/}"
  exit_code=0
  bun --smol test "$file_a" "$file_b" --timeout 120000 > "$tmp" 2>&1 || exit_code=$?

  if [ $exit_code -ne 0 ]; then
    # Check if actual pass count matches expected
    actual=$(grep -oP '^\s*\d+ pass' "$tmp" | grep -oP '\d+' || echo "0")
    if [ "$actual" -lt "$expected" ]; then
      echo "::error title=Cross-contamination detected::Co-run of $file_a + $file_b: expected ${expected} pass, got ${actual} pass. A mock.module or vi.mock() is leaking across test files."
      echo ""
      echo "Test pair: $file_a + $file_b"
      echo "Expected passes (individual): ${expected}"
      echo "Actual passes (co-run): ${actual}"
      echo ""
      echo "Tail of output:"
      tail -20 "$tmp"
      failed=1
    fi
  fi
  rm -f "$tmp"
done

if [ "$failed" -gt 0 ]; then
  echo ""
  echo "Cross-contamination detected. These test files must be refactored"
  echo "to use the _internals DI seam pattern (see AGENTS.md §7) or have"
  echo "their mock isolation improved."
  exit 1
fi

echo "No cross-contamination detected: all test pairs pass when co-run."
