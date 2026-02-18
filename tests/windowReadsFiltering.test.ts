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
  getUniqueModCodesFromWindowJson,
  getUniqueReadIdsFromWindowJson,
  getWindowDataCount,
  getWindowDataCountForReadId,
  parseWindowReadsJson,
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
    const countAll = getWindowDataCount(resultAll);

    // Filter with min_seq_len=6000 (test reads are 5000bp)
    const resultFiltered = await windowReads({ ...base, minSeqLen: 6000 });
    const countFiltered = getWindowDataCount(resultFiltered);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered).toBe(0);
  });

  it('test_min_align_len_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all reads
    const resultAll = await windowReads(base);
    const countAll = getWindowDataCount(resultAll);

    // Filter with min_align_len=1
    const resultFiltered1 = await windowReads({ ...base, minAlignLen: 1 });
    const countFiltered1 = getWindowDataCount(resultFiltered1);

    // Filter with min_align_len=6000
    const resultFiltered2 = await windowReads({ ...base, minAlignLen: 6000 });
    const countFiltered2 = getWindowDataCount(resultFiltered2);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered1).toBeLessThan(countAll);
    expect(countFiltered2).toBe(0);
  });

  it('test_mapq_filter_and_exclude_mapq_unavail', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getWindowDataCount(resultAll);

    // Filter with very high mapq
    const resultFiltered = await windowReads({ ...base, mapqFilter: 100 });
    const countFiltered = getWindowDataCount(resultFiltered);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered).toBeLessThan(countAll);
    expect(countFiltered).toBeGreaterThan(0); // Unmapped reads still present

    // Now exclude reads without mapq
    const resultFiltered2 = await windowReads({
      ...base,
      mapqFilter: 100,
      excludeMapqUnavail: true,
    });
    const countFiltered2 = getWindowDataCount(resultFiltered2);

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
    const allReadIds = getUniqueReadIdsFromWindowJson(resultAll);
    const allCount = allReadIds.length;

    // Sample
    const resultSampled = await windowReads({ ...base, sampleFraction });
    const sampledReadIds = getUniqueReadIdsFromWindowJson(resultSampled);
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

    const readIds1 = getUniqueReadIdsFromWindowJson(result1);
    const readIds2 = getUniqueReadIdsFromWindowJson(result2);

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

    const readIds1 = getUniqueReadIdsFromWindowJson(result1);
    const readIds2 = getUniqueReadIdsFromWindowJson(result2);

    // With 1000 reads at 50% sampling, extremely unlikely to get same set
    expect(readIds1).not.toEqual(readIds2);
  });

  it('test_different_region_filters', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Test with a specific region
    const result = await windowReads({ ...base, region: 'contig_00000' });
    const entries = parseWindowReadsJson(result);

    expect(entries.length).toBeGreaterThan(0);

    // Verify all mapped results are from contig_00000
    const mappedEntries = entries.filter((e) => e.alignment !== undefined);
    if (mappedEntries.length > 0) {
      const uniqueContigs = [
        ...new Set(mappedEntries.map((e) => e.alignment?.contig)),
      ];
      expect(uniqueContigs).toEqual(['contig_00000']);
    }

    // Test with full_region=true
    const result2 = await windowReads({
      ...base,
      region: 'contig_00000',
      fullRegion: true,
    });
    const count2 = getWindowDataCount(result2);
    expect(count2).toBe(0);
  });

  it('test_read_filter_primary_only', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all results
    const resultAll = await windowReads(base);
    const countAll = getWindowDataCount(resultAll);

    // Filter to primary alignments only
    const resultPrimary = await windowReads({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const countPrimary = getWindowDataCount(resultPrimary);

    expect(countAll).toBeGreaterThan(0);
    expect(countPrimary).toBeGreaterThan(0);
    expect(countPrimary).toBeLessThan(countAll);

    // Test that whitespace-separated filter strings produce same results
    const resultPrimary2 = await windowReads({
      ...base,
      readFilter: 'primary_forward, primary_reverse',
    });
    const countPrimary2 = getWindowDataCount(resultPrimary2);

    expect(countPrimary).toBe(countPrimary2);
  });

  it('test_read_ids_filter_single', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Load all data
    const resultAll = await windowReads(base);
    const allReadIds = getUniqueReadIdsFromWindowJson(resultAll);
    const selectedReadId = allReadIds[0];

    // Count expected data entries for this read id
    const expectedCount = getWindowDataCountForReadId(
      resultAll,
      selectedReadId,
    );

    // Filter by this single read id
    const resultFiltered = await windowReads({
      ...base,
      readIdSet: [selectedReadId],
    });
    const countFiltered = getWindowDataCount(resultFiltered);

    expect(countFiltered).toBe(expectedCount);
    const filteredReadIds = getUniqueReadIdsFromWindowJson(resultFiltered);
    expect(filteredReadIds).toEqual([selectedReadId]);
  });

  it('test_read_ids_filter_two', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Load all data
    const resultAll = await windowReads(base);
    const allReadIds = getUniqueReadIdsFromWindowJson(resultAll);
    const selectedReadIds = allReadIds.slice(0, 2);

    // Count expected data entries for these read ids
    let expectedCount = 0;
    for (const readId of selectedReadIds) {
      expectedCount += getWindowDataCountForReadId(resultAll, readId);
    }

    // Filter by these two read ids
    const resultFiltered = await windowReads({
      ...base,
      readIdSet: selectedReadIds,
    });
    const countFiltered = getWindowDataCount(resultFiltered);

    expect(countFiltered).toBe(expectedCount);
    const filteredReadIds = new Set(
      getUniqueReadIdsFromWindowJson(resultFiltered),
    );
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
    const countAll = getWindowDataCount(resultAll);

    // Filter to only basecalled complement strand
    const resultBcComp = await windowReads({ ...base, modStrand: 'bc_comp' });
    const countBcComp = getWindowDataCount(resultBcComp);

    // Our test data has mods on basecalled strand, not complement
    expect(countAll).toBeGreaterThan(0);
    expect(countBcComp).toBe(0);
  });

  it('test_min_mod_qual_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getWindowDataCount(resultAll);

    // Filter with high quality threshold
    const resultHighQual = await windowReads({ ...base, minModQual: 200 });
    const countHighQual = getWindowDataCount(resultHighQual);

    // Should have fewer rows with higher quality threshold
    expect(countHighQual).toBeLessThan(countAll);
  });

  it('test_trim_read_ends_mod', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getWindowDataCount(resultAll);

    // Trim 1000bp from each end
    const resultTrimmed = await windowReads({ ...base, trimReadEndsMod: 1000 });
    const countTrimmed = getWindowDataCount(resultTrimmed);

    // Should have fewer rows after trimming ends
    expect(countTrimmed).toBeLessThan(countAll);
  });

  it('test_base_qual_filter_mod', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    const resultAll = await windowReads(base);
    const countAll = getWindowDataCount(resultAll);

    // Filter mods on bases with quality < 15
    const resultQualFiltered = await windowReads({
      ...base,
      baseQualFilterMod: 15,
    });
    const countQualFiltered = getWindowDataCount(resultQualFiltered);

    // Should have fewer rows with quality filtering
    expect(countQualFiltered).toBeLessThan(countAll);
  });

  it('test_mod_region_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all mods (no region filter)
    const resultAll = await windowReads(base);
    const countAll = getWindowDataCount(resultAll);

    // Filter to just contig_00000
    const resultContig = await windowReads({
      ...base,
      modRegion: 'contig_00000',
    });
    const countContig = getWindowDataCount(resultContig);

    // Filter to specific range within contig_00000
    const resultRange = await windowReads({
      ...base,
      modRegion: 'contig_00000:1000-2000',
    });
    const countRange = getWindowDataCount(resultRange);

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
    const modTypesAll = new Set(getUniqueModCodesFromWindowJson(resultAll));

    // Verify both mod types are present
    expect(modTypesAll.has('T')).toBe(true);
    expect(modTypesAll.has('76792')).toBe(true);

    // Filter to only 76792 mods
    const result76792 = await windowReads({ ...base, tag: '76792' });
    const modTypes76792 = new Set(getUniqueModCodesFromWindowJson(result76792));

    expect(getWindowDataCount(result76792)).toBeGreaterThan(0);
    expect(modTypes76792).toEqual(new Set(['76792']));

    // Filter to only T mods
    const resultT = await windowReads({ ...base, tag: 'T' });
    const modTypesT = new Set(getUniqueModCodesFromWindowJson(resultT));

    expect(getWindowDataCount(resultT)).toBeGreaterThan(0);
    expect(modTypesT).toEqual(new Set(['T']));

    // Verify filtering produces fewer results than unfiltered
    expect(getWindowDataCount(result76792)).toBeLessThan(
      getWindowDataCount(resultAll),
    );
    expect(getWindowDataCount(resultT)).toBeLessThan(
      getWindowDataCount(resultAll),
    );
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
    const count1 = getWindowDataCount(result1);

    // win=10, step=2 (larger window, same step = fewer windows)
    const result2 = await windowReads({
      bamPath: simpleBamPath,
      win: 10,
      step: 2,
    });
    const count2 = getWindowDataCount(result2);

    // win=5, step=5 (same window, larger step = fewer windows)
    const result3 = await windowReads({
      bamPath: simpleBamPath,
      win: 5,
      step: 5,
    });
    const count3 = getWindowDataCount(result3);

    // win=10, step=10 (largest window, largest step = fewest windows)
    const result4 = await windowReads({
      bamPath: simpleBamPath,
      win: 10,
      step: 10,
    });
    const count4 = getWindowDataCount(result4);

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
    const allPrimaryReadIds = getUniqueReadIdsFromWindowJson(allPrimary);
    expect(allPrimaryReadIds.length).toBeGreaterThan(3);

    // Get limited primary reads (limit is by read count, not row count)
    const limited = await windowReads({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
      limit: 3,
    });
    const limitedReadIds = getUniqueReadIdsFromWindowJson(limited);

    expect(limitedReadIds).toHaveLength(3);
  });

  it('test_pagination_loop_with_filter', async () => {
    const base = createWindowInputOptions(simpleBamPath, 5);

    // Get all primary reads without pagination
    const allPrimary = await windowReads({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const allPrimaryReadIds = getUniqueReadIdsFromWindowJson(allPrimary);
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
      const pageReadIds = getUniqueReadIdsFromWindowJson(page);
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
    const allSampledReadIds = getUniqueReadIdsFromWindowJson(allSampled);
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
      const pageReadIds = getUniqueReadIdsFromWindowJson(page);
      collectedReadIds.push(...pageReadIds);
      if (pageReadIds.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(collectedReadIds).toEqual(allSampledReadIds);
  }, 60_000);
});
