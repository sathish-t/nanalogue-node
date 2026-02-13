// Testing filtering parameters for readInfo function
// Uses InputOptions pattern for managing many-parameter test cases
// Ported from pynanalogue test_read_info_filtering.py

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type ReadInfoRecord, readInfo } from '../index';
import {
  createInputOptions,
  createSimpleBam,
  createTwoModsBam,
} from './fixtures';
import {
  getModCountForType,
  getTotalModCount,
  getUniqueContigsFromRecords,
  getUniqueReadIdsFromRecords,
  hasModInModCount,
} from './helpers';

describe('TestInputBamFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-readinfo-filter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_min_seq_len_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all reads
    const resultAll = await readInfo(base);

    // Filter with min_seq_len=6000 (test reads are 5000bp)
    const resultFiltered = await readInfo({ ...base, minSeqLen: 6000 });

    // Should filter out all reads since they're all 5kb
    expect(resultAll.length).toBeGreaterThan(0);
    expect(resultFiltered.length).toBe(0);
  });

  it('test_min_align_len_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all reads
    const resultAll = await readInfo(base);

    // Filter with min_align_len=1 first
    const resultFiltered1 = await readInfo({ ...base, minAlignLen: 1 });

    // Filter with min_align_len=6000
    const resultFiltered2 = await readInfo({ ...base, minAlignLen: 6000 });

    // Should filter out unmapped reads (they have no alignment length)
    expect(resultAll.length).toBeGreaterThan(0);
    expect(resultFiltered1.length).toBeLessThan(resultAll.length);

    // Should filter out all reads since they're all 5kb
    expect(resultFiltered2.length).toBe(0);
  });

  it('test_mapq_filter_and_exclude_mapq_unavail', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await readInfo(base);

    // Filter with very high mapq (test data has mapq 10-20)
    // Unmapped reads don't have MAPQ, so they pass through
    const resultFiltered = await readInfo({ ...base, mapqFilter: 100 });

    expect(resultAll.length).toBeGreaterThan(0);
    expect(resultFiltered.length).toBeLessThan(resultAll.length);
    expect(resultFiltered.length).toBeGreaterThan(0); // Unmapped reads still present

    // Now exclude reads without mapq and verify we get zero results
    const resultFiltered2 = await readInfo({
      ...base,
      mapqFilter: 100,
      excludeMapqUnavail: true,
    });

    expect(resultFiltered2.length).toBe(0);
  });

  it.each([
    [1.0, 1.0],
    [0.5, 0.5],
    [0.25, 0.25],
  ])('test_sample_fraction with %f expecting %f', async (sampleFraction, expectedFraction) => {
    const base = createInputOptions(simpleBamPath);

    // Get baseline count
    const resultAll = await readInfo(base);
    const allReadIds = getUniqueReadIdsFromRecords(resultAll);
    const allCount = allReadIds.length;

    // Sample
    const resultSampled = await readInfo({ ...base, sampleFraction });
    const sampledReadIds = getUniqueReadIdsFromRecords(resultSampled);
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
    const base = createInputOptions(simpleBamPath);

    // Two calls with same sampleFraction and sampleSeed should return identical results
    const result1 = await readInfo({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const result2 = await readInfo({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });

    const readIds1 = getUniqueReadIdsFromRecords(result1);
    const readIds2 = getUniqueReadIdsFromRecords(result2);

    expect(readIds1).toEqual(readIds2);
  });

  it('test_sample_seed_different_seeds_differ', async () => {
    const base = createInputOptions(simpleBamPath);

    // Two calls with different seeds should produce different sampled sets
    const result1 = await readInfo({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const result2 = await readInfo({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 99,
    });

    const readIds1 = getUniqueReadIdsFromRecords(result1);
    const readIds2 = getUniqueReadIdsFromRecords(result2);

    // With 1000 reads at 50% sampling, extremely unlikely to get same set
    expect(readIds1).not.toEqual(readIds2);
  });

  it('test_different_region_filters', async () => {
    const base = createInputOptions(simpleBamPath);

    // Test with a specific region (simulated BAM contigs are named contig_00000, etc.)
    const result = await readInfo({ ...base, region: 'contig_00000' });

    // Verify all results are from contig_00000
    expect(result.length).toBeGreaterThan(0);
    const uniqueContigs = getUniqueContigsFromRecords(result);
    expect(uniqueContigs).toEqual(['contig_00000']);

    // Test with full_region=true - no reads pass through entire region
    const result2 = await readInfo({
      ...base,
      region: 'contig_00000',
      fullRegion: true,
    });
    expect(result2.length).toBe(0);
  });

  it('test_read_filter_primary_only', async () => {
    const base = createInputOptions(simpleBamPath);

    // Filter to primary alignments only
    const resultPrimary = await readInfo({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });

    // Check that we only have primary alignments
    expect(resultPrimary.length).toBeGreaterThan(0);
    for (const record of resultPrimary) {
      expect(record.alignment_type).toMatch(/primary/);
    }

    // Test that whitespace-separated filter strings produce same results
    const resultPrimary2 = await readInfo({
      ...base,
      readFilter: 'primary_forward, primary_reverse',
    });

    expect(resultPrimary.length).toBe(resultPrimary2.length);
  });

  it('test_read_ids_filter_single', async () => {
    const base = createInputOptions(simpleBamPath);

    // Load all data
    const resultAll = await readInfo(base);
    const allReadIds = getUniqueReadIdsFromRecords(resultAll);
    const selectedReadId = allReadIds[0];

    // Count expected records for this read id
    const expectedCount = resultAll.filter(
      (r: ReadInfoRecord) => r.read_id === selectedReadId,
    ).length;

    // Filter by this single read id
    const resultFiltered = await readInfo({
      ...base,
      readIdSet: [selectedReadId],
    });

    expect(resultFiltered.length).toBe(expectedCount);
    expect(
      resultFiltered.every((r: ReadInfoRecord) => r.read_id === selectedReadId),
    ).toBe(true);
  });

  it('test_read_ids_filter_two', async () => {
    const base = createInputOptions(simpleBamPath);

    // Load all data
    const resultAll = await readInfo(base);
    const allReadIds = getUniqueReadIdsFromRecords(resultAll);
    const selectedReadIds = allReadIds.slice(0, 2);

    // Count expected records for these read ids
    const expectedCount = resultAll.filter((r: ReadInfoRecord) =>
      selectedReadIds.includes(r.read_id),
    ).length;

    // Filter by these two read ids
    const resultFiltered = await readInfo({
      ...base,
      readIdSet: selectedReadIds,
    });

    expect(resultFiltered.length).toBe(expectedCount);
    const filteredIds = new Set(
      resultFiltered.map((r: ReadInfoRecord) => r.read_id),
    );
    expect(filteredIds).toEqual(new Set(selectedReadIds));
  });
});

describe('TestInputModsFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-mods-filter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_mod_strand_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await readInfo(base);
    const totalModsAll = getTotalModCount(resultAll);

    // Filter to only basecalled complement strand
    const resultBcComp = await readInfo({ ...base, modStrand: 'bc_comp' });
    const totalModsBcComp = getTotalModCount(resultBcComp);

    // Our test data has mods on basecalled strand, not complement
    // Same number of records but zero mod counts on complement
    expect(resultAll.length).toBe(resultBcComp.length);
    expect(totalModsAll).toBeGreaterThan(0);
    expect(totalModsBcComp).toBe(0);
  });

  it('test_min_mod_qual_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await readInfo(base);
    const totalModsAll = getTotalModCount(resultAll);

    // Filter with high quality threshold
    const resultHighQual = await readInfo({ ...base, minModQual: 200 });
    const totalModsHighQual = getTotalModCount(resultHighQual);

    // Same number of records but fewer mods with higher quality threshold
    expect(resultAll.length).toBe(resultHighQual.length);
    expect(totalModsHighQual).toBeLessThan(totalModsAll);
  });

  it('test_trim_read_ends_mod', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await readInfo(base);
    const totalModsAll = getTotalModCount(resultAll);

    // Trim 1000bp from each end
    const resultTrimmed = await readInfo({ ...base, trimReadEndsMod: 1000 });
    const totalModsTrimmed = getTotalModCount(resultTrimmed);

    // Same number of records but fewer mods after trimming ends
    expect(resultAll.length).toBe(resultTrimmed.length);
    expect(totalModsTrimmed).toBeLessThan(totalModsAll);
  });

  it('test_base_qual_filter_mod', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await readInfo(base);
    const totalModsAll = getTotalModCount(resultAll);

    // Filter mods on bases with quality < 15
    const resultQualFiltered = await readInfo({
      ...base,
      baseQualFilterMod: 15,
    });
    const totalModsQualFiltered = getTotalModCount(resultQualFiltered);

    // Same number of records but fewer mods with quality filtering
    expect(resultAll.length).toBe(resultQualFiltered.length);
    expect(totalModsQualFiltered).toBeLessThan(totalModsAll);
  });

  it('test_mod_region_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all mods (no region filter)
    const resultAll = await readInfo(base);
    const totalModsAll = getTotalModCount(resultAll);

    // Filter to just contig_00000
    const resultContig = await readInfo({ ...base, modRegion: 'contig_00000' });
    const totalModsContig = getTotalModCount(resultContig);

    // Filter to specific range within contig_00000
    const resultRange = await readInfo({
      ...base,
      modRegion: 'contig_00000:1000-2000',
    });
    const totalModsRange = getTotalModCount(resultRange);

    // Same number of records in all cases
    expect(resultAll.length).toBe(resultContig.length);
    expect(resultAll.length).toBe(resultRange.length);

    // Filtering by contig should give fewer mods than no filter
    expect(totalModsContig).toBeLessThan(totalModsAll);

    // Filtering by specific range should give even fewer mods
    expect(totalModsRange).toBeLessThan(totalModsContig);
  });
});

describe('TestTreatAsUrl', () => {
  // NOTE: We only test treatAsUrl=false here because we cannot rely on URLs
  // being active forever. The treatAsUrl=true pathway is not tested.

  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-treat-as-url-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_treat_as_url_false_works_with_file_path', async () => {
    const base = createInputOptions(simpleBamPath);

    // Explicitly set treatAsUrl=false - should work with file path
    const result = await readInfo({
      ...base,
      treatAsUrl: false,
    });

    expect(result.length).toBeGreaterThan(0);
  });

  it('test_treat_as_url_undefined_works_with_file_path', async () => {
    const base = createInputOptions(simpleBamPath);

    // treatAsUrl undefined (default) - should work with file path
    const result = await readInfo(base);

    expect(result.length).toBeGreaterThan(0);
  });
});

describe('TestRejectModQualNonInclusive', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-reject-mod-qual-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it.each([
    {
      low: 0,
      high: 0,
      shouldSucceed: true,
      description: 'equal values (no rejection)',
    },
    {
      low: 0,
      high: 1,
      shouldSucceed: true,
      description: 'diff of 1 (no rejection)',
    },
    {
      low: 0,
      high: 3,
      shouldSucceed: true,
      description: 'diff > 1 (Both variant)',
    },
    { low: 100, high: 200, shouldSucceed: true, description: 'valid range' },
    {
      low: 200,
      high: 100,
      shouldSucceed: false,
      description: 'invalid: low > high',
    },
  ])('test_reject_mod_qual_validation $description', async ({
    low,
    high,
    shouldSucceed,
  }) => {
    const base = createInputOptions(simpleBamPath);

    if (shouldSucceed) {
      const result = await readInfo({
        ...base,
        rejectModQualNonInclusive: [low, high],
      });
      expect(Array.isArray(result)).toBe(true);
    } else {
      await expect(
        readInfo({
          ...base,
          rejectModQualNonInclusive: [low, high],
        }),
      ).rejects.toThrow(/low < high/i);
    }
  });

  it('test_reject_mod_qual_filters_all_mods_with_full_range', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all mods (no rejection filter)
    const resultAll = await readInfo(base);
    const totalModsAll = getTotalModCount(resultAll);

    // Reject mods with probabilities in range [0, 255] - should reject mods with
    // probabilities not set exactly to zero and exactly to 255.
    // SimpleBam fixture has mods in ranges [0.1, 0.2] and [0.7, 0.8] (~[25,50] and [175,200])
    const resultFiltered = await readInfo({
      ...base,
      rejectModQualNonInclusive: [0, 255],
    });
    const totalModsFiltered = getTotalModCount(resultFiltered);

    // Should have same number of records
    expect(resultAll.length).toBe(resultFiltered.length);

    // Original should have mods, filtered should have zero
    expect(totalModsAll).toBeGreaterThan(0);
    expect(totalModsFiltered).toBe(0);
  });
});

describe('TestTagFiltering', () => {
  let tmpDir: string;
  let twoModsBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-tag-filter-'));
    twoModsBamPath = await createTwoModsBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_tag_filter', async () => {
    const base = createInputOptions(twoModsBamPath);

    // Get all mods (no tag filter)
    const resultAll = await readInfo(base);

    // Check that both mod types are present in unfiltered data
    const hasTMod = resultAll.some((r: ReadInfoRecord) =>
      hasModInModCount(r.mod_count ?? 'NA', 'T-T'),
    );
    const has76792Mod = resultAll.some((r: ReadInfoRecord) =>
      hasModInModCount(r.mod_count ?? 'NA', 'C+76792'),
    );

    expect(hasTMod).toBe(true);
    expect(has76792Mod).toBe(true);

    // Filter to only 76792 mods
    const result76792 = await readInfo({ ...base, tag: '76792' });

    // Verify only 76792 mods are present (T-T should have 0 count)
    const total76792Mods = result76792.reduce(
      (sum: number, r: ReadInfoRecord) =>
        sum + getModCountForType(r.mod_count ?? 'NA', 'C+76792'),
      0,
    );
    const totalTModsIn76792 = result76792.reduce(
      (sum: number, r: ReadInfoRecord) =>
        sum + getModCountForType(r.mod_count ?? 'NA', 'T-T'),
      0,
    );

    expect(total76792Mods).toBeGreaterThan(0);
    expect(totalTModsIn76792).toBe(0);

    // Filter to only T mods
    const resultT = await readInfo({ ...base, tag: 'T' });

    // Verify only T mods are present
    const totalTMods = resultT.reduce(
      (sum: number, r: ReadInfoRecord) =>
        sum + getModCountForType(r.mod_count ?? 'NA', 'T-T'),
      0,
    );
    const total76792ModsInT = resultT.reduce(
      (sum: number, r: ReadInfoRecord) =>
        sum + getModCountForType(r.mod_count ?? 'NA', 'C+76792'),
      0,
    );

    expect(totalTMods).toBeGreaterThan(0);
    expect(total76792ModsInT).toBe(0);
  });
});

describe('TestPaginationWithFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-readinfo-pagfilter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_limit_with_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all primary reads
    const allPrimary = await readInfo({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    expect(allPrimary.length).toBeGreaterThan(3);

    // Get limited primary reads
    const limited = await readInfo({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
      limit: 3,
    });

    expect(limited).toHaveLength(3);
    for (const record of limited) {
      expect(record.alignment_type).toMatch(/primary/);
    }
  });

  it('test_pagination_loop_with_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all primary reads without pagination
    const allPrimary = await readInfo({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    expect(allPrimary.length).toBeGreaterThan(0);

    // Paginate through primary reads
    const PAGE_SIZE = 50;
    const collected: ReadInfoRecord[] = [];
    let offset = 0;

    while (true) {
      const page = await readInfo({
        ...base,
        readFilter: 'primary_forward,primary_reverse',
        limit: PAGE_SIZE,
        offset,
      });
      collected.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(collected.map((r) => r.read_id)).toEqual(
      allPrimary.map((r) => r.read_id),
    );
  });

  it('test_sample_seed_pagination_stability', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all sampled reads with seed
    const allSampled = await readInfo({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    expect(allSampled.length).toBeGreaterThan(0);

    // Paginate through same sampled set
    const PAGE_SIZE = 100;
    const collected: ReadInfoRecord[] = [];
    let offset = 0;

    while (true) {
      const page = await readInfo({
        ...base,
        sampleFraction: 0.5,
        sampleSeed: 42,
        limit: PAGE_SIZE,
        offset,
      });
      collected.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(collected.map((r) => r.read_id)).toEqual(
      allSampled.map((r) => r.read_id),
    );
  });
});
