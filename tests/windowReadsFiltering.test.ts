// Testing filtering parameters for windowReads function
// Uses InputOptions pattern for managing many-parameter test cases
// Ported from pynanalogue test_window_reads_filtering.py

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { windowReads } from '../index';
import {
  createSimpleBam,
  createTwoModsBam,
  createWindowInputOptions,
} from './fixtures';
import {
  getRowCount,
  getUniqueColumnValues,
  getUniqueReadIds,
  parseTsv,
} from './helpers';

describe('TestWindowReadsBamFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-windowreads-filter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_min_seq_len_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all reads
    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter with min_seq_len=6000 (test reads are 5000bp)
    const resultFiltered = await windowReads({ ...base, minSeqLen: 6000 });
    const countFiltered = getRowCount(resultFiltered);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered).toBe(0);
  });

  it('test_min_align_len_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all reads
    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter with min_align_len=1
    const resultFiltered1 = await windowReads({ ...base, minAlignLen: 1 });
    const countFiltered1 = getRowCount(resultFiltered1);

    // Filter with min_align_len=6000
    const resultFiltered2 = await windowReads({ ...base, minAlignLen: 6000 });
    const countFiltered2 = getRowCount(resultFiltered2);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered1).toBeLessThan(countAll);
    expect(countFiltered2).toBe(0);
  });

  it('test_mapq_filter_and_exclude_mapq_unavail', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter with very high mapq
    const resultFiltered = await windowReads({ ...base, mapqFilter: 100 });
    const countFiltered = getRowCount(resultFiltered);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered).toBeLessThan(countAll);
    expect(countFiltered).toBeGreaterThan(0); // Unmapped reads still present

    // Now exclude reads without mapq
    const resultFiltered2 = await windowReads({
      ...base,
      mapqFilter: 100,
      excludeMapqUnavail: true,
    });
    const countFiltered2 = getRowCount(resultFiltered2);

    expect(countFiltered2).toBe(0);
  });

  it.each([
    [1.0, 1.0],
    [0.5, 0.5],
    [0.25, 0.25],
  ])('test_sample_fraction with %f expecting %f', async (sampleFraction, expectedFraction) => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get baseline count
    const resultAll = await windowReads(base);
    const allReadIds = getUniqueReadIds(resultAll);
    const allCount = allReadIds.length;

    // Sample
    const resultSampled = await windowReads({ ...base, sampleFraction });
    const sampledReadIds = getUniqueReadIds(resultSampled);
    const sampledCount = sampledReadIds.length;

    if (sampleFraction === 1.0) {
      expect(sampledCount).toBe(allCount);
    } else {
      // Allow 30% variance due to stochastic sampling
      const expected = allCount * expectedFraction;
      expect(sampledCount).toBeGreaterThanOrEqual(0.7 * expected);
      expect(sampledCount).toBeLessThanOrEqual(1.3 * expected);
    }
  });

  it('test_sample_seed_determinism', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Two calls with same sampleFraction and sampleSeed should return identical results
    const result1 = await windowReads({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const result2 = await windowReads({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });

    const readIds1 = getUniqueReadIds(result1);
    const readIds2 = getUniqueReadIds(result2);

    expect(readIds1).toEqual(readIds2);
  });

  it('test_sample_seed_different_seeds_differ', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Two calls with different seeds should produce different sampled sets
    const result1 = await windowReads({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const result2 = await windowReads({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 99,
    });

    const readIds1 = getUniqueReadIds(result1);
    const readIds2 = getUniqueReadIds(result2);

    // With 1000 reads at 50% sampling, extremely unlikely to get same set
    expect(readIds1).not.toEqual(readIds2);
  });

  it('test_different_region_filters', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Test with a specific region
    const result = await windowReads({ ...base, region: 'contig_00000' });
    const { rows } = parseTsv(result);

    expect(rows.length).toBeGreaterThan(0);

    // Verify all mapped results are from contig_00000 (excluding unmapped ".")
    const mappedRows = rows.filter((r) => r.contig !== '.');
    if (mappedRows.length > 0) {
      const uniqueContigs = [...new Set(mappedRows.map((r) => r.contig))];
      expect(uniqueContigs).toEqual(['contig_00000']);
    }

    // Test with full_region=true
    const result2 = await windowReads({
      ...base,
      region: 'contig_00000',
      fullRegion: true,
    });
    const count2 = getRowCount(result2);
    expect(count2).toBe(0);
  });

  it('test_read_filter_primary_only', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all results
    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter to primary alignments only
    const resultPrimary = await windowReads({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const countPrimary = getRowCount(resultPrimary);

    expect(countAll).toBeGreaterThan(0);
    expect(countPrimary).toBeGreaterThan(0);
    expect(countPrimary).toBeLessThan(countAll);

    // Test that whitespace-separated filter strings produce same results
    const resultPrimary2 = await windowReads({
      ...base,
      readFilter: 'primary_forward, primary_reverse',
    });
    const countPrimary2 = getRowCount(resultPrimary2);

    expect(countPrimary).toBe(countPrimary2);
  });

  it('test_read_ids_filter_single', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Load all data
    const resultAll = await windowReads(base);
    const allReadIds = getUniqueReadIds(resultAll);
    const selectedReadId = allReadIds[0];

    // Count expected rows for this read id
    const { rows: allRows } = parseTsv(resultAll);
    const expectedCount = allRows.filter(
      (r) => r.read_id === selectedReadId,
    ).length;

    // Filter by this single read id
    const resultFiltered = await windowReads({
      ...base,
      readIdSet: [selectedReadId],
    });
    const countFiltered = getRowCount(resultFiltered);

    expect(countFiltered).toBe(expectedCount);
    const filteredReadIds = getUniqueReadIds(resultFiltered);
    expect(filteredReadIds).toEqual([selectedReadId]);
  });

  it('test_read_ids_filter_two', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Load all data
    const resultAll = await windowReads(base);
    const allReadIds = getUniqueReadIds(resultAll);
    const selectedReadIds = allReadIds.slice(0, 2);

    // Count expected rows for these read ids
    const { rows: allRows } = parseTsv(resultAll);
    const expectedCount = allRows.filter((r) =>
      selectedReadIds.includes(r.read_id),
    ).length;

    // Filter by these two read ids
    const resultFiltered = await windowReads({
      ...base,
      readIdSet: selectedReadIds,
    });
    const countFiltered = getRowCount(resultFiltered);

    expect(countFiltered).toBe(expectedCount);
    const filteredReadIds = new Set(getUniqueReadIds(resultFiltered));
    expect(filteredReadIds).toEqual(new Set(selectedReadIds));
  });
});

describe('TestWindowReadsModsFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(
      join(tmpdir(), 'nanalogue-windowreads-mods-filter-'),
    );
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_mod_strand_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter to only basecalled complement strand
    const resultBcComp = await windowReads({ ...base, modStrand: 'bc_comp' });
    const countBcComp = getRowCount(resultBcComp);

    // Our test data has mods on basecalled strand, not complement
    expect(countAll).toBeGreaterThan(0);
    expect(countBcComp).toBe(0);
  });

  it('test_min_mod_qual_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter with high quality threshold
    const resultHighQual = await windowReads({ ...base, minModQual: 200 });
    const countHighQual = getRowCount(resultHighQual);

    // Should have fewer rows with higher quality threshold
    expect(countHighQual).toBeLessThan(countAll);
  });

  it('test_trim_read_ends_mod', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Trim 1000bp from each end
    const resultTrimmed = await windowReads({ ...base, trimReadEndsMod: 1000 });
    const countTrimmed = getRowCount(resultTrimmed);

    // Should have fewer rows after trimming ends
    expect(countTrimmed).toBeLessThan(countAll);
  });

  it('test_base_qual_filter_mod', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter mods on bases with quality < 15
    const resultQualFiltered = await windowReads({
      ...base,
      baseQualFilterMod: 15,
    });
    const countQualFiltered = getRowCount(resultQualFiltered);

    // Should have fewer rows with quality filtering
    expect(countQualFiltered).toBeLessThan(countAll);
  });

  it('test_mod_region_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all mods (no region filter)
    const resultAll = await windowReads(base);
    const countAll = getRowCount(resultAll);

    // Filter to just contig_00000
    const resultContig = await windowReads({
      ...base,
      modRegion: 'contig_00000',
    });
    const countContig = getRowCount(resultContig);

    // Filter to specific range within contig_00000
    const resultRange = await windowReads({
      ...base,
      modRegion: 'contig_00000:1000-2000',
    });
    const countRange = getRowCount(resultRange);

    // Filtering by contig should give fewer results than no filter
    expect(countContig).toBeLessThan(countAll);

    // Filtering by specific range should give even fewer results
    expect(countRange).toBeLessThan(countContig);
  });
});

describe('TestTagFiltering', () => {
  let tmpDir: string;
  let twoModsBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-windowreads-tag-filter-'));
    twoModsBamPath = await createTwoModsBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_tag_filter', async () => {
    const base = createWindowInputOptions(twoModsBamPath, 5);

    // Get all mods (no tag filter)
    const resultAll = await windowReads(base);
    const modTypesAll = new Set(getUniqueColumnValues(resultAll, 'mod_type'));

    // Verify both mod types are present
    expect(modTypesAll.has('T')).toBe(true);
    expect(modTypesAll.has('76792')).toBe(true);

    // Filter to only 76792 mods
    const result76792 = await windowReads({ ...base, tag: '76792' });
    const modTypes76792 = new Set(
      getUniqueColumnValues(result76792, 'mod_type'),
    );

    expect(getRowCount(result76792)).toBeGreaterThan(0);
    expect(modTypes76792).toEqual(new Set(['76792']));

    // Filter to only T mods
    const resultT = await windowReads({ ...base, tag: 'T' });
    const modTypesT = new Set(getUniqueColumnValues(resultT, 'mod_type'));

    expect(getRowCount(resultT)).toBeGreaterThan(0);
    expect(modTypesT).toEqual(new Set(['T']));

    // Verify filtering produces fewer results than unfiltered
    expect(getRowCount(result76792)).toBeLessThan(getRowCount(resultAll));
    expect(getRowCount(resultT)).toBeLessThan(getRowCount(resultAll));
  });
});

describe('TestWindowReadsWindowingParams', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-windowreads-params-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_win_and_step_affect_output_counts', async () => {
    // win=5, step=2 (baseline - smallest window, smallest step = most windows)
    const result1 = await windowReads({
      bamPath: simpleBamPath,
      win: 5,
      step: 2,
    });
    const count1 = getRowCount(result1);

    // win=10, step=2 (larger window, same step = fewer windows)
    const result2 = await windowReads({
      bamPath: simpleBamPath,
      win: 10,
      step: 2,
    });
    const count2 = getRowCount(result2);

    // win=5, step=5 (same window, larger step = fewer windows)
    const result3 = await windowReads({
      bamPath: simpleBamPath,
      win: 5,
      step: 5,
    });
    const count3 = getRowCount(result3);

    // win=10, step=10 (largest window, largest step = fewest windows)
    const result4 = await windowReads({
      bamPath: simpleBamPath,
      win: 10,
      step: 10,
    });
    const count4 = getRowCount(result4);

    // Verify relationships that prove win and step are being used
    expect(count1).toBeGreaterThan(count2);
    expect(count1).toBeGreaterThan(count3);
    expect(count2).toBeGreaterThan(count4);
    expect(count3).toBeGreaterThan(count4);
  });
});

describe('TestPaginationWithFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-windowreads-pagfilter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_limit_with_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all primary reads
    const allPrimary = await windowReads({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const allPrimaryReadIds = getUniqueReadIds(allPrimary);
    expect(allPrimaryReadIds.length).toBeGreaterThan(3);

    // Get limited primary reads (limit is by read count, not row count)
    const limited = await windowReads({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
      limit: 3,
    });
    const limitedReadIds = getUniqueReadIds(limited);

    expect(limitedReadIds).toHaveLength(3);
  });

  it('test_pagination_loop_with_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all primary reads without pagination
    const allPrimary = await windowReads({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const allPrimaryReadIds = getUniqueReadIds(allPrimary);
    expect(allPrimaryReadIds.length).toBeGreaterThan(0);

    // Paginate through primary reads
    const PAGE_SIZE = 100;
    const collectedReadIds: string[] = [];
    let offset = 0;

    while (true) {
      const page = await windowReads({
        ...base,
        readFilter: 'primary_forward,primary_reverse',
        limit: PAGE_SIZE,
        offset,
      });
      const pageReadIds = getUniqueReadIds(page);
      collectedReadIds.push(...pageReadIds);
      if (pageReadIds.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(collectedReadIds).toEqual(allPrimaryReadIds);
  }, 60_000);

  it('test_sample_seed_pagination_stability', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all sampled reads with seed
    const allSampled = await windowReads({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const allSampledReadIds = getUniqueReadIds(allSampled);
    expect(allSampledReadIds.length).toBeGreaterThan(0);

    // Paginate through same sampled set
    const PAGE_SIZE = 100;
    const collectedReadIds: string[] = [];
    let offset = 0;

    while (true) {
      const page = await windowReads({
        ...base,
        sampleFraction: 0.5,
        sampleSeed: 42,
        limit: PAGE_SIZE,
        offset,
      });
      const pageReadIds = getUniqueReadIds(page);
      collectedReadIds.push(...pageReadIds);
      if (pageReadIds.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(collectedReadIds).toEqual(allSampledReadIds);
  }, 60_000);
});
