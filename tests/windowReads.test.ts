// Tests for windowReads function
// Validates JSON output format, expected outputs, gradient mode, and error handling

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { windowReads } from '../index';
import {
  getExampleBamPath,
  loadExpectedJson,
  normalizeJsonForComparison,
  parseWindowReadsJson,
} from './helpers';

const getTestDataPath = (relativePath: string) =>
  resolve(__dirname, 'data', relativePath);

describe('windowReads expected output comparison', () => {
  it('test_example_1_bam_window_reads', async () => {
    const bamPath = getExampleBamPath('example_1.bam');
    const result = await windowReads({ bamPath, win: 2, step: 1 });
    const actual = normalizeJsonForComparison(JSON.parse(result));
    const expected = normalizeJsonForComparison(
      loadExpectedJson('example_1_window_reads_json'),
    );
    expect(actual).toEqual(expected);
  });

  it('test_example_3_bam_window_reads', async () => {
    const bamPath = getExampleBamPath('example_3.bam');
    const result = await windowReads({ bamPath, win: 2, step: 1 });
    const actual = normalizeJsonForComparison(JSON.parse(result));
    const expected = normalizeJsonForComparison(
      loadExpectedJson('example_3_window_reads_json'),
    );
    expect(actual).toEqual(expected);
  });

  it('test_example_7_bam_window_reads', async () => {
    const bamPath = getExampleBamPath('example_7.bam');
    const result = await windowReads({ bamPath, win: 2, step: 1 });
    const actual = normalizeJsonForComparison(JSON.parse(result));
    const expected = normalizeJsonForComparison(
      loadExpectedJson('example_7_window_reads_json'),
    );
    expect(actual).toEqual(expected);
  });
});

describe('windowReads gradient (grad_density) tests', () => {
  it('test_example_10_bam_window_reads_gradient_win10_step1', async () => {
    const bamPath = getExampleBamPath('example_10.bam');
    const result = await windowReads({
      bamPath,
      win: 10,
      step: 1,
      winOp: 'grad_density',
    });
    const actual = normalizeJsonForComparison(JSON.parse(result));
    const expected = normalizeJsonForComparison(
      loadExpectedJson('example_10_win_grad_json_win_10_step_1'),
    );
    expect(actual).toEqual(expected);
  });

  it('test_example_10_bam_window_reads_gradient_win20_step2', async () => {
    const bamPath = getExampleBamPath('example_10.bam');
    const result = await windowReads({
      bamPath,
      win: 20,
      step: 2,
      winOp: 'grad_density',
    });
    const actual = normalizeJsonForComparison(JSON.parse(result));
    const expected = normalizeJsonForComparison(
      loadExpectedJson('example_10_win_grad_json_win_20_step_2'),
    );
    expect(actual).toEqual(expected);
  });

  it('test_example_11_bam_window_reads_gradient_win10_step1', async () => {
    const bamPath = getExampleBamPath('example_11.bam');
    const result = await windowReads({
      bamPath,
      win: 10,
      step: 1,
      winOp: 'grad_density',
    });
    const actual = normalizeJsonForComparison(JSON.parse(result));
    const expected = normalizeJsonForComparison(
      loadExpectedJson('example_11_win_grad_json_win_10_step_1'),
    );
    expect(actual).toEqual(expected);
  });

  it('test_example_11_bam_window_reads_gradient_win20_step2', async () => {
    const bamPath = getExampleBamPath('example_11.bam');
    const result = await windowReads({
      bamPath,
      win: 20,
      step: 2,
      winOp: 'grad_density',
    });
    const actual = normalizeJsonForComparison(JSON.parse(result));
    const expected = normalizeJsonForComparison(
      loadExpectedJson('example_11_win_grad_json_win_20_step_2'),
    );
    expect(actual).toEqual(expected);
  });
});

describe('windowReads error handling', () => {
  it('test_window_reads_invalid_win_op_raises_error', async () => {
    const bamPath = getExampleBamPath('example_1.bam');
    await expect(
      windowReads({
        bamPath,
        win: 5,
        step: 2,
        winOp: 'invalid_option' as 'density', // Cast to bypass TS check; tests runtime validation for JS users
      }),
    ).rejects.toThrow(/win_op must be set to/);
  });
});

describe('windowReads', () => {
  const testBamPath = getTestDataPath('examples/example_1.bam');

  it('returns valid JSON array', async () => {
    const result = await windowReads({
      bamPath: testBamPath,
      win: 2,
      step: 1,
    });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    const entries = parseWindowReadsJson(result);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('returns entries with expected JSON structure', async () => {
    const result = await windowReads({
      bamPath: testBamPath,
      win: 2,
      step: 1,
    });

    const entries = parseWindowReadsJson(result);
    for (const entry of entries) {
      expect(entry).toHaveProperty('alignment_type');
      expect(entry).toHaveProperty('mod_table');
      expect(entry).toHaveProperty('read_id');
      expect(entry).toHaveProperty('seq_len');
      expect(Array.isArray(entry.mod_table)).toBe(true);

      for (const modEntry of entry.mod_table) {
        expect(modEntry).toHaveProperty('base');
        expect(modEntry).toHaveProperty('is_strand_plus');
        expect(modEntry).toHaveProperty('mod_code');
        expect(modEntry).toHaveProperty('data');
        expect(Array.isArray(modEntry.data)).toBe(true);

        for (const row of modEntry.data) {
          expect(row).toHaveLength(6);
        }
      }
    }
  });

  it('accepts step parameter', async () => {
    const result = await windowReads({
      bamPath: testBamPath,
      win: 4,
      step: 2,
    });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('can filter by region', async () => {
    const result = await windowReads({
      bamPath: testBamPath,
      win: 2,
      step: 1,
      region: 'dummyI',
    });

    const entries = parseWindowReadsJson(result);

    // All mapped entries should have contig dummyI
    for (const entry of entries) {
      if (entry.alignment) {
        expect(entry.alignment.contig).toBe('dummyI');
      }
    }
  });

  it('throws error for invalid window size', async () => {
    await expect(
      windowReads({
        bamPath: testBamPath,
        win: 0,
        step: 1,
      }),
    ).rejects.toThrow();
  });
});
