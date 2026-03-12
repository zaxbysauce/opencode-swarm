#!/usr/bin/env bun
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const candidates = ['tree-sitter', 'web-tree-sitter'];
const languages = [
  { name: 'javascript-500', path: 'examples/syntax-check/sample-js-500.js' },
  { name: 'javascript-2000', path: 'examples/syntax-check/sample-js-2000.js' },
  { name: 'python-500', path: 'examples/syntax-check/sample-py-500.py' },
  { name: 'python-2000', path: 'examples/syntax-check/sample-py-2000.py' },
  { name: 'go-500', path: 'examples/syntax-check/sample-go-500.go' },
  { name: 'go-2000', path: 'examples/syntax-check/sample-go-2000.go' },
  { name: 'rust-500', path: 'examples/syntax-check/sample-rs-500.rs' },
  { name: 'rust-2000', path: 'examples/syntax-check/sample-rs-2000.rs' },
];

interface BenchmarkResult {
  candidate: string;
  totalParseMs: number;
  peakHeapDelta: number;
  bundleSizeBytes: number;
}

async function runCandidate(candidate: string): Promise<BenchmarkResult> {
  const startHeap = process.memoryUsage().heapUsed;
  const startTime = performance.now();
  for (const file of languages) {
    const filePath = resolve(file.path);
    try {
      statSync(filePath);
      const source = readFileSync(filePath, 'utf8');
      const parserTime = performance.now();
      // TODO: Swap this stub with the actual tree-sitter parse call once grammars are bundled.
      void source;
      performance.now();
    } catch {
      console.warn(`Sample file missing: ${filePath}`);
    }
  }
  const endTime = performance.now();
  const endHeap = process.memoryUsage().heapUsed;
  return {
    candidate,
    totalParseMs: Math.round(endTime - startTime),
    peakHeapDelta: Math.round(endHeap - startHeap),
    bundleSizeBytes: 0, // TODO: Populate actual bundle size
  };
}

async function main() {
  const results: BenchmarkResult[] = [];
  for (const candidate of candidates) {
    try {
      const result = await runCandidate(candidate);
      results.push(result);
      console.log(`Candidate ${candidate}: ${result.totalParseMs}ms parse, ${result.peakHeapDelta}B heap delta`);
    } catch (error) {
      console.error(`Failed to benchmark ${candidate}:`, error);
    }
  }
  console.log('[BENCHMARK_JSON]', JSON.stringify({ results }, null, 2), '[/BENCHMARK_JSON]');
}

main();
