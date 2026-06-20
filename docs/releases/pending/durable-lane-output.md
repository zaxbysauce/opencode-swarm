Add durable full-output artifacts for dispatch lane results.

`dispatch_lanes`, `dispatch_lanes_async`, and `collect_lane_results` now return
bounded previews plus `output_ref` provenance for full lane transcripts stored
under `.swarm/lane-results/`. Architects can page full lane output with
`retrieve_lane_output` before candidate extraction, JSON parsing, or reviewer
routing, so long-running lanes are no longer limited by the result preview.

Migration: no configuration change required. Existing callers can keep reading
`output`; workflows that need complete lane evidence should use `output_ref` and
handle `output_degraded` or `transcript_incomplete` as coverage gaps.

Breaking changes: none.
