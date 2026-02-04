// Testing filtering parameters for bamMods function
// Uses InputOptions pattern for managing many-parameter test cases
// Ported from pynanalogue test_polars_bam_mods_filtering.py

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type BamModRecord, bamMods } from '../index';
import {
  createInputOptions,
  createSimpleBam,
  createTwoModsBam,
} from './fixtures';
import {
  getTotalModTableCount,
  getUniqueContigsFromRecords,
  getUniqueModCodes,
  getUniqueReadIdsFromRecords,
} from './helpers';

describe('TestInputBamFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-bammods-filter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_min_seq_len_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all reads
    const resultAll = await bamMods(base);

    // Filter with min_seq_len=6000 (test reads are 5000bp)
    const resultFiltered = await bamMods({ ...base, minSeqLen: 6000 });

    // Should filter out all reads since they're all 5kb
    expect(resultAll.length).toBeGreaterThan(0);
    expect(resultFiltered.length).toBe(0);
  });

  it('test_min_align_len_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all reads
    const resultAll = await bamMods(base);

    // Filter with min_align_len=1 first
    const resultFiltered1 = await bamMods({ ...base, minAlignLen: 1 });

    // Filter with min_align_len=6000
    const resultFiltered2 = await bamMods({ ...base, minAlignLen: 6000 });

    // Should filter out unmapped reads
    expect(resultAll.length).toBeGreaterThan(0);
    expect(resultFiltered1.length).toBeLessThan(resultAll.length);

    // Should filter out all reads since they're all 5kb
    expect(resultFiltered2.length).toBe(0);
  });

  it('test_mapq_filter_and_exclude_mapq_unavail', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await bamMods(base);

    // Filter with very high mapq (test data has mapq 10-20)
    const resultFiltered = await bamMods({ ...base, mapqFilter: 100 });

    expect(resultAll.length).toBeGreaterThan(0);
    expect(resultFiltered.length).toBeLessThan(resultAll.length);
    expect(resultFiltered.length).toBeGreaterThan(0); // Unmapped reads still present

    // Now exclude reads without mapq
    const resultFiltered2 = await bamMods({
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
    const resultAll = await bamMods(base);
    const allReadIds = getUniqueReadIdsFromRecords(resultAll);
    const allCount = allReadIds.length;

    // Sample
    const resultSampled = await bamMods({ ...base, sampleFraction });
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

  it('test_different_region_filters', async () => {
    const base = createInputOptions(simpleBamPath);

    // Test with a specific region
    const result = await bamMods({ ...base, region: 'contig_00000' });

    // Verify all mapped results are from contig_00000
    expect(result.length).toBeGreaterThan(0);
    const uniqueContigs = getUniqueContigsFromRecords(result);
    expect(uniqueContigs).toEqual(['contig_00000']);

    // Test with full_region=true
    const result2 = await bamMods({
      ...base,
      region: 'contig_00000',
      fullRegion: true,
    });
    expect(result2.length).toBe(0);
  });

  it('test_read_filter_primary_only', async () => {
    const base = createInputOptions(simpleBamPath);

    // Filter to primary alignments only
    const resultPrimary = await bamMods({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });

    // Check that we only have primary alignments
    expect(resultPrimary.length).toBeGreaterThan(0);
    for (const record of resultPrimary) {
      expect(record.alignment_type).toMatch(/primary/);
    }

    // Test that whitespace-separated filter strings produce same results
    const resultPrimary2 = await bamMods({
      ...base,
      readFilter: 'primary_forward, primary_reverse',
    });

    expect(resultPrimary.length).toBe(resultPrimary2.length);
  });

  it('test_read_ids_filter_single', async () => {
    const base = createInputOptions(simpleBamPath);

    // Load all data
    const resultAll = await bamMods(base);
    const allReadIds = getUniqueReadIdsFromRecords(resultAll);
    const selectedReadId = allReadIds[0];

    // Count expected records for this read id
    const expectedCount = resultAll.filter(
      (r: BamModRecord) => r.read_id === selectedReadId,
    ).length;

    // Filter by this single read id
    const resultFiltered = await bamMods({
      ...base,
      readIdSet: [selectedReadId],
    });

    expect(resultFiltered.length).toBe(expectedCount);
    expect(
      resultFiltered.every((r: BamModRecord) => r.read_id === selectedReadId),
    ).toBe(true);
  });

  it('test_read_ids_filter_two', async () => {
    const base = createInputOptions(simpleBamPath);

    // Load all data
    const resultAll = await bamMods(base);
    const allReadIds = getUniqueReadIdsFromRecords(resultAll);
    const selectedReadIds = allReadIds.slice(0, 2);

    // Count expected records for these read ids
    const expectedCount = resultAll.filter((r: BamModRecord) =>
      selectedReadIds.includes(r.read_id),
    ).length;

    // Filter by these two read ids
    const resultFiltered = await bamMods({
      ...base,
      readIdSet: selectedReadIds,
    });

    expect(resultFiltered.length).toBe(expectedCount);
    const filteredIds = new Set(
      resultFiltered.map((r: BamModRecord) => r.read_id),
    );
    expect(filteredIds).toEqual(new Set(selectedReadIds));
  });
});

describe('TestInputModsFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-bammods-mods-filter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_mod_strand_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await bamMods(base);
    const totalModsAll = getTotalModTableCount(resultAll);

    // Filter to only basecalled complement strand
    const resultBcComp = await bamMods({ ...base, modStrand: 'bc_comp' });
    const totalModsBcComp = getTotalModTableCount(resultBcComp);

    // Our test data has mods on basecalled strand, not complement
    expect(totalModsAll).toBeGreaterThan(0);
    expect(totalModsBcComp).toBe(0);
  });

  it('test_min_mod_qual_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await bamMods(base);
    const totalModsAll = getTotalModTableCount(resultAll);

    // Filter with high quality threshold
    const resultHighQual = await bamMods({ ...base, minModQual: 200 });
    const totalModsHighQual = getTotalModTableCount(resultHighQual);

    // Should have fewer mods with higher quality threshold
    expect(totalModsHighQual).toBeLessThan(totalModsAll);
  });

  it('test_trim_read_ends_mod', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await bamMods(base);
    const totalModsAll = getTotalModTableCount(resultAll);

    // Trim 1000bp from each end
    const resultTrimmed = await bamMods({ ...base, trimReadEndsMod: 1000 });
    const totalModsTrimmed = getTotalModTableCount(resultTrimmed);

    // Should have fewer mods after trimming ends
    expect(totalModsTrimmed).toBeLessThan(totalModsAll);
  });

  it('test_base_qual_filter_mod', async () => {
    const base = createInputOptions(simpleBamPath);

    const resultAll = await bamMods(base);
    const totalModsAll = getTotalModTableCount(resultAll);

    // Filter mods on bases with quality < 15
    const resultQualFiltered = await bamMods({
      ...base,
      baseQualFilterMod: 15,
    });
    const totalModsQualFiltered = getTotalModTableCount(resultQualFiltered);

    // Should have fewer mods with quality filtering
    expect(totalModsQualFiltered).toBeLessThan(totalModsAll);
  });

  it('test_mod_region_filter', async () => {
    const base = createInputOptions(simpleBamPath);

    // Get all mods (no region filter)
    const resultAll = await bamMods(base);
    const countAll = getTotalModTableCount(resultAll);

    // Filter to just contig_00000
    const resultContig = await bamMods({ ...base, modRegion: 'contig_00000' });
    const countContig = getTotalModTableCount(resultContig);

    // Filter to specific range within contig_00000
    const resultRange = await bamMods({
      ...base,
      modRegion: 'contig_00000:1000-2000',
    });
    const countRange = getTotalModTableCount(resultRange);

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
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-bammods-tag-filter-'));
    twoModsBamPath = await createTwoModsBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_tag_filter', async () => {
    const base = createInputOptions(twoModsBamPath);

    // Get all mods (no tag filter)
    const resultAll = await bamMods(base);
    const modCodesAll = new Set(getUniqueModCodes(resultAll));

    // Verify both mod types are present
    expect(modCodesAll.has('T')).toBe(true);
    expect(modCodesAll.has('76792')).toBe(true);

    // Filter to only 76792 mods
    const result76792 = await bamMods({ ...base, tag: '76792' });
    const modCodes76792 = new Set(getUniqueModCodes(result76792));

    expect(result76792.length).toBeGreaterThan(0);
    expect(modCodes76792).toEqual(new Set(['76792']));

    // Filter to only T mods
    const resultT = await bamMods({ ...base, tag: 'T' });
    const modCodesT = new Set(getUniqueModCodes(resultT));

    expect(resultT.length).toBeGreaterThan(0);
    expect(modCodesT).toEqual(new Set(['T']));

    // Verify counts add up
    const total76792 = getTotalModTableCount(result76792);
    const totalT = getTotalModTableCount(resultT);
    const totalAll = getTotalModTableCount(resultAll);

    expect(total76792 + totalT).toBe(totalAll);
  });
});
