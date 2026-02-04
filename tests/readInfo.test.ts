// Tests for the readInfo() function which returns read information from BAM files
// This file tests the read_info functionality from nanalogue-core

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ReadInfoRecord, readInfo } from '../index';
import { getExampleBamPath, loadExpectedJson } from './helpers';

const getTestDataPath = (relativePath: string) =>
  resolve(__dirname, 'data', relativePath);

describe('readInfo expected output comparison', () => {
  it('test_example_1_bam_read_info', async () => {
    const bamPath = getExampleBamPath('example_1.bam');
    const result = await readInfo({ bamPath });
    const expected = loadExpectedJson('example_1_read_info.json');
    expect(result).toEqual(expected);
  });

  it('test_example_3_bam_read_info', async () => {
    const bamPath = getExampleBamPath('example_3.bam');
    const result = await readInfo({ bamPath });
    const expected = loadExpectedJson('example_3_read_info.json');
    expect(result).toEqual(expected);
  });

  it('test_example_7_bam_read_info', async () => {
    const bamPath = getExampleBamPath('example_7.bam');
    const result = await readInfo({ bamPath });
    const expected = loadExpectedJson('example_7_read_info.json');
    expect(result).toEqual(expected);
  });
});

describe('readInfo', () => {
  it('matches expected output for example_1.bam', async () => {
    const bamPath = getTestDataPath('examples/example_1.bam');
    const expectedPath = getTestDataPath(
      'expected_outputs/example_1_read_info.json',
    );

    const result = await readInfo({ bamPath });
    const expected = JSON.parse(await readFile(expectedPath, 'utf-8'));

    expect(result).toEqual(expected);
  });

  it('returns array of read records', async () => {
    const bamPath = getTestDataPath('examples/example_1.bam');
    const result = await readInfo({ bamPath });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles unmapped reads correctly', async () => {
    const bamPath = getTestDataPath('examples/example_1.bam');
    const result = await readInfo({ bamPath });

    const unmapped = result.filter(
      (r: ReadInfoRecord) => r.alignment_type === 'unmapped',
    );
    for (const record of unmapped) {
      // Unmapped reads should NOT have contig, reference_start, reference_end, alignment_length
      expect(record).not.toHaveProperty('contig');
      expect(record).not.toHaveProperty('reference_start');
    }
  });

  it('filters by minSeqLen', async () => {
    const bamPath = getTestDataPath('examples/example_1.bam');

    const resultAll = await readInfo({ bamPath });
    const resultFiltered = await readInfo({ bamPath, minSeqLen: 40 });

    expect(resultAll.length).toBeGreaterThan(resultFiltered.length);
  });
});
