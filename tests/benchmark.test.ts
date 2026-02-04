// Performance benchmark tests for tsnanalogue
// Uses larger test data to verify functions work at scale
// Ported from pynanalogue test_benchmark.py

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bamMods, readInfo, windowReads } from '../index';
import { createBenchmarkBam } from './fixtures';
import { getRowCount } from './helpers';

describe('Benchmark Tests', () => {
  let tmpDir: string;
  let benchmarkBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-benchmark-'));
    // This creates a BAM with 1000 reads and 1Mb contigs
    benchmarkBamPath = await createBenchmarkBam(tmpDir);
  }, 60000); // 60 second timeout for BAM generation

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('benchmark_readInfo completes on large BAM', async () => {
    const result = await readInfo({ bamPath: benchmarkBamPath });

    // Verify we got results
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Should have 1000 reads (or close to it)
    expect(result.length).toBeGreaterThanOrEqual(800);
    expect(result.length).toBeLessThanOrEqual(1200);
  }, 30000); // 30 second timeout

  it('benchmark_bamMods completes on large BAM', async () => {
    const result = await bamMods({ bamPath: benchmarkBamPath });

    // Verify we got results
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout

  it('benchmark_windowReads completes on large BAM', async () => {
    const result = await windowReads({
      bamPath: benchmarkBamPath,
      win: 5,
      step: 2,
    });

    // Verify we got results
    const rowCount = getRowCount(result);
    expect(rowCount).toBeGreaterThan(0);
  }, 30000); // 30 second timeout
});
