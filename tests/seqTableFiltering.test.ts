// Testing filtering parameters for seqTable function
// Uses InputOptions pattern for managing many-parameter test cases
// Ported from pynanalogue test_seq_table_filtering.py

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seqTable, simulateModBam } from '../index';
import {
  createSeqTableInputOptions,
  createSimpleBam,
  createTwoModsBam,
} from './fixtures';
import {
  getRowCount,
  getTotalModCountFromTsv,
  getUniqueReadIds,
  parseTsv,
} from './helpers';

describe('TestInputBamFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-seqtable-filter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_min_seq_len_filter', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Get all reads
    const resultAll = await seqTable(base);
    const countAll = getRowCount(resultAll);

    // Filter with min_seq_len=6000 (test reads are 5000bp)
    const resultFiltered = await seqTable({ ...base, minSeqLen: 6000 });
    const countFiltered = getRowCount(resultFiltered);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered).toBe(0);
  });

  it('test_min_align_len_filter', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Get all reads
    const resultAll = await seqTable(base);
    const countAll = getRowCount(resultAll);

    // Filter with min_align_len=6000 (reads are 5000bp)
    const resultFiltered = await seqTable({ ...base, minAlignLen: 6000 });
    const countFiltered = getRowCount(resultFiltered);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered).toBe(0);
  });

  it('test_mapq_filter', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    const resultAll = await seqTable(base);
    const countAll = getRowCount(resultAll);

    // Filter with very high mapq (test data has mapq 10-20)
    // Note: seqTable has full_region behavior, so unmapped reads are already excluded
    const resultFiltered = await seqTable({ ...base, mapqFilter: 100 });
    const countFiltered = getRowCount(resultFiltered);

    expect(countAll).toBeGreaterThan(0);
    expect(countFiltered).toBe(0);
  });

  it.each([
    [1.0, 1.0],
    [0.5, 0.5],
    // Note: We skip 0.1 because seqTable queries reads that pass fully through
    // a small region, so the sample size is small and fluctuates greatly
  ])('test_sample_fraction with %f expecting %f', async (sampleFraction, expectedFraction) => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Get baseline count
    const resultAll = await seqTable(base);
    const allCount = getRowCount(resultAll);

    // Sample
    const resultSampled = await seqTable({ ...base, sampleFraction });
    const sampledCount = getRowCount(resultSampled);

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
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Two calls with same sampleFraction and sampleSeed should return identical results
    const result1 = await seqTable({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const result2 = await seqTable({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });

    const readIds1 = getUniqueReadIds(result1);
    const readIds2 = getUniqueReadIds(result2);

    // seqTable row order is not guaranteed, so compare sorted
    expect(readIds1.sort()).toEqual(readIds2.sort());
  });

  it('test_sample_seed_different_seeds_differ', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Two calls with different seeds should produce different sampled sets
    const result1 = await seqTable({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const result2 = await seqTable({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 99,
    });

    const readIds1 = getUniqueReadIds(result1);
    const readIds2 = getUniqueReadIds(result2);

    // With 1000 reads at 50% sampling, extremely unlikely to get same set
    expect(readIds1.sort()).not.toEqual(readIds2.sort());
  });

  it('test_read_filter_primary_only', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Get all reads
    const resultAll = await seqTable(base);
    const countAll = getRowCount(resultAll);

    // Filter to primary alignments only
    const resultPrimary = await seqTable({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const countPrimary = getRowCount(resultPrimary);

    // Should have at least some primary reads
    expect(countPrimary).toBeGreaterThan(0);
    // Primary count should be less than all
    expect(countPrimary).toBeLessThan(countAll);

    // Test that whitespace-separated filter strings produce same results
    const resultPrimary2 = await seqTable({
      ...base,
      readFilter: 'primary_forward, primary_reverse',
    });
    const countPrimary2 = getRowCount(resultPrimary2);

    expect(countPrimary).toBe(countPrimary2);
  });

  it('test_read_ids_filter_single', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Load all data
    const resultAll = await seqTable(base);
    const allReadIds = getUniqueReadIds(resultAll);

    if (allReadIds.length === 0) {
      // Skip if no reads in result
      return;
    }

    const selectedReadId = allReadIds[0];

    // Count expected records for this read id
    const { rows: allRows } = parseTsv(resultAll);
    const expectedCount = allRows.filter(
      (r) => r.read_id === selectedReadId,
    ).length;

    // Filter by this single read id
    const resultFiltered = await seqTable({
      ...base,
      readIdSet: [selectedReadId],
    });
    const countFiltered = getRowCount(resultFiltered);

    expect(countFiltered).toBe(expectedCount);
    const filteredReadIds = getUniqueReadIds(resultFiltered);
    expect(filteredReadIds.every((id) => id === selectedReadId)).toBe(true);
  });

  it('test_read_ids_filter_two', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Load all data
    const resultAll = await seqTable(base);
    const allReadIds = getUniqueReadIds(resultAll);

    if (allReadIds.length < 2) {
      // Skip if not enough reads
      return;
    }

    const selectedReadIds = allReadIds.slice(0, 2);

    // Count expected records for these read ids
    const { rows: allRows } = parseTsv(resultAll);
    const expectedCount = allRows.filter((r) =>
      selectedReadIds.includes(r.read_id),
    ).length;

    // Filter by these two read ids
    const resultFiltered = await seqTable({
      ...base,
      readIdSet: selectedReadIds,
    });
    const countFiltered = getRowCount(resultFiltered);

    expect(countFiltered).toBe(expectedCount);
    const filteredReadIds = new Set(getUniqueReadIds(resultFiltered));
    expect(filteredReadIds).toEqual(new Set(selectedReadIds));
  });
});

describe('TestInputModsFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-seqtable-mods-filter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_mod_strand_filter', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    const resultAll = await seqTable(base);
    const totalModsAll = getTotalModCountFromTsv(resultAll);

    // Filter to only basecalled complement strand
    const resultBcComp = await seqTable({ ...base, modStrand: 'bc_comp' });
    const totalModsBcComp = getTotalModCountFromTsv(resultBcComp);

    // Our test data has mods on basecalled strand, not complement
    // Same number of records but zero mod counts on complement
    expect(getRowCount(resultAll)).toBe(getRowCount(resultBcComp));
    expect(totalModsAll).toBeGreaterThan(0);
    expect(totalModsBcComp).toBe(0);
  });

  it('test_min_mod_qual_filter', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    const resultAll = await seqTable(base);
    const totalModsAll = getTotalModCountFromTsv(resultAll);

    // Filter with high quality threshold
    const resultHighQual = await seqTable({ ...base, minModQual: 200 });
    const totalModsHighQual = getTotalModCountFromTsv(resultHighQual);

    // Same number of records but fewer mods with higher quality threshold
    expect(getRowCount(resultAll)).toBe(getRowCount(resultHighQual));
    expect(totalModsHighQual).toBeLessThan(totalModsAll);
  });

  it('test_trim_read_ends_mod', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    const resultAll = await seqTable(base);
    const totalModsAll = getTotalModCountFromTsv(resultAll);

    // Trim 1000bp from each end
    const resultTrimmed = await seqTable({ ...base, trimReadEndsMod: 1000 });
    const totalModsTrimmed = getTotalModCountFromTsv(resultTrimmed);

    // Same number of records but fewer mods after trimming ends
    expect(getRowCount(resultAll)).toBe(getRowCount(resultTrimmed));
    expect(totalModsTrimmed).toBeLessThan(totalModsAll);
  });

  it('test_base_qual_filter_mod', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    const resultAll = await seqTable(base);
    const totalModsAll = getTotalModCountFromTsv(resultAll);

    // Filter mods on bases with quality < 15
    const resultQualFiltered = await seqTable({
      ...base,
      baseQualFilterMod: 15,
    });
    const totalModsQualFiltered = getTotalModCountFromTsv(resultQualFiltered);

    // Same number of records but fewer mods with quality filtering
    expect(getRowCount(resultAll)).toBe(getRowCount(resultQualFiltered));
    expect(totalModsQualFiltered).toBeLessThan(totalModsAll);
  });
});

describe('TestTagFiltering', () => {
  let tmpDir: string;
  let twoModsBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-seqtable-tag-filter-'));
    twoModsBamPath = await createTwoModsBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_tag_filter', async () => {
    const base = createSeqTableInputOptions(
      twoModsBamPath,
      'contig_00000:4000-6000',
    );

    // Get all mods (no tag filter)
    const resultAll = await seqTable(base);
    const totalModsAll = getTotalModCountFromTsv(resultAll);

    // Filter to only 76792 mods
    const result76792 = await seqTable({ ...base, tag: '76792' });
    const totalMods76792 = getTotalModCountFromTsv(result76792);

    // Filter to only T mods
    const resultT = await seqTable({ ...base, tag: 'T' });
    const totalModsT = getTotalModCountFromTsv(resultT);

    // Total mods when filtering should be less than all mods
    expect(totalModsAll).toBeGreaterThan(0);

    // The sum of mods from each tag filter should equal total mods
    expect(totalMods76792 + totalModsT).toBe(totalModsAll);

    // Each tag filter should have some mods
    expect(totalMods76792).toBeGreaterThan(0);
    expect(totalModsT).toBeGreaterThan(0);
  });
});

describe('TestExcludeMapqUnavail', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-seqtable-mapq-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_exclude_mapq_unavail', async () => {
    // Create BAM with MAPQ=255 (unavailable)
    const config = {
      contigs: { number: 1, len_range: [10000, 10000] },
      reads: [
        {
          number: 1000,
          mapq_range: [255, 255],
          base_qual_range: [20, 30],
          len_range: [0.5, 0.5],
          insert_middle: 'ATCG',
          mods: [],
        },
      ],
    };

    const bamPath = join(tmpDir, 'mapq_unavail.bam');
    const fastaPath = join(tmpDir, 'mapq_unavail.fasta');

    await simulateModBam({
      jsonConfig: JSON.stringify(config),
      bamPath,
      fastaPath,
    });

    const base = createSeqTableInputOptions(bamPath, 'contig_00000:4000-6000');

    // Without exclude_mapq_unavail, reads with MAPQ=255 should pass through
    const resultWithoutFlag = await seqTable(base);
    const countWithoutFlag = getRowCount(resultWithoutFlag);

    // With exclude_mapq_unavail=true, all reads should be filtered out
    const resultWithFlag = await seqTable({
      ...base,
      excludeMapqUnavail: true,
    });
    const countWithFlag = getRowCount(resultWithFlag);

    expect(countWithoutFlag).toBeGreaterThan(0);
    expect(countWithFlag).toBe(0);
  });
});

describe('TestPaginationWithFiltering', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-seqtable-pagfilter-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_limit_with_filter', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Get all primary reads
    const allPrimary = await seqTable({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const allPrimaryCount = getRowCount(allPrimary);
    expect(allPrimaryCount).toBeGreaterThan(3);

    // Get limited primary reads
    const limited = await seqTable({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
      limit: 3,
    });
    const { rows } = parseTsv(limited);

    expect(rows).toHaveLength(3);
  });

  it('test_pagination_loop_with_filter', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Get all primary reads without pagination
    const allPrimary = await seqTable({
      ...base,
      readFilter: 'primary_forward,primary_reverse',
    });
    const allPrimaryParsed = parseTsv(allPrimary);
    expect(allPrimaryParsed.rows.length).toBeGreaterThan(0);

    // Paginate through primary reads
    const PAGE_SIZE = 50;
    const collectedRows: Record<string, string>[] = [];
    let offset = 0;

    while (true) {
      const page = await seqTable({
        ...base,
        readFilter: 'primary_forward,primary_reverse',
        limit: PAGE_SIZE,
        offset,
      });
      const { rows } = parseTsv(page);
      collectedRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // seqTable row order is not guaranteed, compare sorted
    expect(collectedRows.map((r) => r.read_id).sort()).toEqual(
      allPrimaryParsed.rows.map((r) => r.read_id).sort(),
    );
  }, 60_000);

  it('test_sample_seed_pagination_stability', async () => {
    const base = createSeqTableInputOptions(
      simpleBamPath,
      'contig_00000:4000-6000',
    );

    // Get all sampled reads with seed
    const allSampled = await seqTable({
      ...base,
      sampleFraction: 0.5,
      sampleSeed: 42,
    });
    const allSampledParsed = parseTsv(allSampled);
    expect(allSampledParsed.rows.length).toBeGreaterThan(0);

    // Paginate through same sampled set
    const PAGE_SIZE = 50;
    const collectedRows: Record<string, string>[] = [];
    let offset = 0;

    while (true) {
      const page = await seqTable({
        ...base,
        sampleFraction: 0.5,
        sampleSeed: 42,
        limit: PAGE_SIZE,
        offset,
      });
      const { rows } = parseTsv(page);
      collectedRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // seqTable row order is not guaranteed, compare sorted
    expect(collectedRows.map((r) => r.read_id).sort()).toEqual(
      allSampledParsed.rows.map((r) => r.read_id).sort(),
    );
  }, 60_000);
});
