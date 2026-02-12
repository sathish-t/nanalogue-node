// Tests for pagination (limit, offset) support across all query functions
// Verifies that .skip(offset).take(limit) applies correctly after filtering

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type BamModRecord,
  bamMods,
  type ReadInfoRecord,
  readInfo,
  seqTable,
  windowReads,
} from '../index';
import { createSimpleBam, EXAMPLE_3_BAM } from './fixtures';
import { getUniqueReadIds, parseTsv } from './helpers';

// example_3.bam has 10 reads on contig "dummyI" (no modifications)
const bamPath = EXAMPLE_3_BAM;

// simpleBam has 1000 reads with T+T mods on contig_00000/contig_00001
let tmpDir: string;
let simpleBamPath: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-pagination-'));
  simpleBamPath = await createSimpleBam(tmpDir);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true });
});

describe('readInfo pagination', () => {
  it('returns limited records with limit', async () => {
    const result = await readInfo({ bamPath, limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('skips records with offset', async () => {
    const all = await readInfo({ bamPath });
    const withOffset = await readInfo({ bamPath, offset: 1 });
    expect(withOffset).toHaveLength(all.length - 1);
    // First record of offset result should match second record of full result
    expect(withOffset[0].read_id).toBe(all[1].read_id);
  });

  it('returns correct slice with limit + offset', async () => {
    const all = await readInfo({ bamPath });
    const slice = await readInfo({ bamPath, offset: 1, limit: 2 });
    expect(slice).toHaveLength(2);
    expect(slice[0].read_id).toBe(all[1].read_id);
    expect(slice[1].read_id).toBe(all[2].read_id);
  });

  it('returns all records when limit exceeds total', async () => {
    const all = await readInfo({ bamPath });
    const result = await readInfo({ bamPath, limit: 999 });
    expect(result).toHaveLength(all.length);
  });

  it('returns empty array when offset exceeds total', async () => {
    const result = await readInfo({ bamPath, offset: 999 });
    expect(result).toHaveLength(0);
  });

  it('skips N records when offset is used without limit', async () => {
    const all = await readInfo({ bamPath });
    const skipped = await readInfo({ bamPath, offset: 5 });
    expect(skipped).toHaveLength(all.length - 5);
    expect(skipped[0].read_id).toBe(all[5].read_id);
  });

  it('preserves order across pagination loop', async () => {
    const all = await readInfo({ bamPath });
    const PAGE_SIZE = 2;
    const collected: ReadInfoRecord[] = [];
    let offset = 0;

    while (true) {
      const page = await readInfo({ bamPath, limit: PAGE_SIZE, offset });
      collected.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Strict ordered equality — no records lost, duplicated, or reordered
    expect(collected.map((r) => r.read_id)).toEqual(all.map((r) => r.read_id));
  });
});

describe('bamMods pagination', () => {
  it('returns limited records with limit', async () => {
    const result = await bamMods({ bamPath, limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('preserves order across pagination loop', async () => {
    const all = await bamMods({ bamPath });
    const PAGE_SIZE = 3;
    const collected: BamModRecord[] = [];
    let offset = 0;

    while (true) {
      const page = await bamMods({ bamPath, limit: PAGE_SIZE, offset });
      collected.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(collected.map((r) => r.read_id)).toEqual(all.map((r) => r.read_id));
  });
});

describe('windowReads pagination', () => {
  it('limits by read count not row count', async () => {
    const result = await windowReads({
      bamPath: simpleBamPath,
      win: 2,
      step: 1,
      limit: 1,
    });
    const readIds = getUniqueReadIds(result);
    expect(readIds).toHaveLength(1);
  });

  it('preserves order across pagination loop', async () => {
    const all = await windowReads({
      bamPath: simpleBamPath,
      win: 2,
      step: 1,
    });
    const allReadIds = getUniqueReadIds(all);
    expect(allReadIds.length).toBeGreaterThan(0);

    const PAGE_SIZE = 100;
    const collectedReadIds: string[] = [];
    let offset = 0;

    while (true) {
      const page = await windowReads({
        bamPath: simpleBamPath,
        win: 2,
        step: 1,
        limit: PAGE_SIZE,
        offset,
      });
      const pageReadIds = getUniqueReadIds(page);
      collectedReadIds.push(...pageReadIds);
      if (pageReadIds.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(collectedReadIds).toEqual(allReadIds);
  }, 60_000);
});

describe('seqTable pagination', () => {
  it('returns limited records with limit', async () => {
    const result = await seqTable({
      bamPath: simpleBamPath,
      region: 'contig_00000:4000-6000',
      limit: 2,
    });
    const { rows } = parseTsv(result);
    expect(rows).toHaveLength(2);
  });

  it('collects all reads across pagination loop', async () => {
    const all = await seqTable({
      bamPath: simpleBamPath,
      region: 'contig_00000:4000-6000',
    });
    const allParsed = parseTsv(all);
    expect(allParsed.rows.length).toBeGreaterThan(0);

    const PAGE_SIZE = 50;
    const collectedRows: Record<string, string>[] = [];
    let offset = 0;

    while (true) {
      const page = await seqTable({
        bamPath: simpleBamPath,
        region: 'contig_00000:4000-6000',
        limit: PAGE_SIZE,
        offset,
      });
      const { rows } = parseTsv(page);
      collectedRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Compare as sets: seqTable row order is not guaranteed to be stable
    // across calls due to internal processing in rust_reads_table::run()
    expect(collectedRows.map((r) => r.read_id).sort()).toEqual(
      allParsed.rows.map((r) => r.read_id).sort(),
    );
  }, 60_000);

  it('each page contains the correct reads per ground-truth order', async () => {
    // readInfo with a region filter gives a stable read order that seqTable
    // does not guarantee. We use it as the ground truth to verify that each
    // seqTable page contains exactly the expected reads (allowing within-page
    // shuffling).
    const region = 'contig_00000:4000-6000';
    const PAGE_SIZE = 50;

    const groundTruth = await readInfo({
      bamPath: simpleBamPath,
      region,
      fullRegion: true,
    });
    const groundTruthIds = groundTruth.map((r) => r.read_id);
    expect(groundTruthIds.length).toBeGreaterThan(0);

    let offset = 0;
    let pageIndex = 0;

    while (offset < groundTruthIds.length) {
      const page = await seqTable({
        bamPath: simpleBamPath,
        region,
        limit: PAGE_SIZE,
        offset,
      });
      const { rows } = parseTsv(page);
      const pageReadIds = rows.map((r) => r.read_id).sort();

      // The expected reads for this page come from the ground truth slice
      const expectedIds = groundTruthIds
        .slice(offset, offset + PAGE_SIZE)
        .sort();

      expect(pageReadIds, `page ${pageIndex} read_ids mismatch`).toEqual(
        expectedIds,
      );

      pageIndex++;
      offset += PAGE_SIZE;
    }
  }, 60_000);
});

describe('pagination validation errors', () => {
  it('rejects limit: 0', async () => {
    await expect(readInfo({ bamPath, limit: 0 })).rejects.toThrow(
      'limit must be a positive integer',
    );
  });

  it('rejects limit: -1', async () => {
    await expect(readInfo({ bamPath, limit: -1 })).rejects.toThrow(
      'limit must be a positive integer',
    );
  });

  it('rejects offset: -5', async () => {
    await expect(readInfo({ bamPath, offset: -5 })).rejects.toThrow(
      'offset must be non-negative',
    );
  });

  it('rejects limit: NaN', async () => {
    await expect(readInfo({ bamPath, limit: Number.NaN })).rejects.toThrow();
  });

  it('truncates limit: 1.5 to 1 (NAPI-RS floors floats to integers)', async () => {
    const result = await readInfo({ bamPath, limit: 1.5 });
    expect(result).toHaveLength(1);
  });

  it('truncates offset: 1.5 to 1 (NAPI-RS floors floats to integers)', async () => {
    const all = await readInfo({ bamPath });
    const result = await readInfo({ bamPath, offset: 1.5 });
    expect(result).toHaveLength(all.length - 1);
    expect(result[0].read_id).toBe(all[1].read_id);
  });
});
