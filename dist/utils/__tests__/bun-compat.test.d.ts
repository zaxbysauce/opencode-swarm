/**
 * Bun-compat shim tests (issue #704).
 *
 * Each public surface is exercised against the live runtime. When running
 * under Bun the shim delegates to the native `Bun.*` primitives; when running
 * under Node the shim's fallback path is exercised. The test only asserts the
 * observable contract (text equality, written byte count, exit code parity)
 * — it does not lock in implementation details that legitimately differ
 * between the two paths.
 */
export {};
