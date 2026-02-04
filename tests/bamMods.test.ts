// Tests for bamMods function

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bamMods,
  type MappedBamModRecord,
  type UnmappedBamModRecord,
} from '../index';
import { getExampleBamPath, loadExpectedJson } from './helpers';

const getTestDataPath = (relativePath: string) =>
  resolve(__dirname, 'data', relativePath);

describe('bamMods expected output comparison', () => {
  it('test_example_1_bam_bam_mods', async () => {
    const bamPath = getExampleBamPath('example_1.bam');
    const result = await bamMods({ bamPath });
    const expected = loadExpectedJson('example_1_bam_mods.json');
    expect(result).toEqual(expected);
  });

  it('test_example_3_bam_bam_mods', async () => {
    const bamPath = getExampleBamPath('example_3.bam');
    const result = await bamMods({ bamPath });
    const expected = loadExpectedJson('example_3_bam_mods.json');
    expect(result).toEqual(expected);
  });

  it('test_example_7_bam_bam_mods', async () => {
    const bamPath = getExampleBamPath('example_7.bam');
    const result = await bamMods({ bamPath });
    const expected = loadExpectedJson('example_7_bam_mods.json');
    expect(result).toEqual(expected);
  });
});

describe('bamMods', () => {
  const testBamPath = getTestDataPath('examples/example_1.bam');

  it('returns detailed modification data as JSON', async () => {
    const result = await bamMods({ bamPath: testBamPath });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns records with expected structure for mapped reads', async () => {
    const result = await bamMods({ bamPath: testBamPath });
    const mappedRecords = result.filter(
      (r): r is MappedBamModRecord => r.alignment_type !== 'unmapped',
    );

    expect(mappedRecords.length).toBeGreaterThan(0);

    const firstMapped = mappedRecords[0];
    expect(firstMapped).toHaveProperty('read_id');
    expect(firstMapped).toHaveProperty('seq_len');
    expect(firstMapped).toHaveProperty('alignment');
    expect(firstMapped.alignment).toHaveProperty('start');
    expect(firstMapped.alignment).toHaveProperty('end');
    expect(firstMapped.alignment).toHaveProperty('contig');
    expect(firstMapped).toHaveProperty('mod_table');
    expect(Array.isArray(firstMapped.mod_table)).toBe(true);
  });

  it('returns records with expected structure for unmapped reads', async () => {
    const result = await bamMods({ bamPath: testBamPath });
    const unmappedRecords = result.filter(
      (r): r is UnmappedBamModRecord => r.alignment_type === 'unmapped',
    );

    // example_1.bam has unmapped reads
    expect(unmappedRecords.length).toBeGreaterThan(0);

    const firstUnmapped = unmappedRecords[0];
    expect(firstUnmapped).toHaveProperty('read_id');
    expect(firstUnmapped).toHaveProperty('seq_len');
    expect(firstUnmapped.alignment_type).toBe('unmapped');
    expect(firstUnmapped).toHaveProperty('mod_table');
    expect(firstUnmapped).not.toHaveProperty('alignment');
  });

  it('mod_table contains modification data arrays', async () => {
    const result = await bamMods({ bamPath: testBamPath });
    const recordsWithMods = result.filter((r) => r.mod_table.length > 0);

    expect(recordsWithMods.length).toBeGreaterThan(0);

    const modEntry = recordsWithMods[0].mod_table[0];
    expect(modEntry).toHaveProperty('base');
    expect(modEntry).toHaveProperty('is_strand_plus');
    expect(modEntry).toHaveProperty('mod_code');
    expect(modEntry).toHaveProperty('data');
    expect(Array.isArray(modEntry.data)).toBe(true);

    // data should be arrays of [read_pos, ref_pos, probability]
    if (modEntry.data.length > 0) {
      const dataPoint = modEntry.data[0];
      expect(Array.isArray(dataPoint)).toBe(true);
      expect(dataPoint.length).toBe(3);
    }
  });

  it('can filter by read ID', async () => {
    // First get all reads to find a valid read ID
    const allReads = await bamMods({ bamPath: testBamPath });
    expect(allReads.length).toBeGreaterThan(0);

    const targetReadId = allReads[0].read_id;
    const filtered = await bamMods({
      bamPath: testBamPath,
      readIdSet: [targetReadId],
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].read_id).toBe(targetReadId);
  });

  it('can filter by region', async () => {
    const result = await bamMods({
      bamPath: testBamPath,
      region: 'dummyI',
    });

    const mappedRecords = result.filter(
      (r): r is MappedBamModRecord => r.alignment_type !== 'unmapped',
    );

    // All mapped records should be on dummyI
    for (const record of mappedRecords) {
      expect(record.alignment.contig).toBe('dummyI');
    }
  });
});
