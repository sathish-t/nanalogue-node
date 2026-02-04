// Tests for windowReads function

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { windowReads } from '../index';
import {
  compareTsvSorted,
  getExampleBamPath,
  loadExpectedTsvRaw,
} from './helpers';

const getTestDataPath = (relativePath: string) =>
  resolve(__dirname, 'data', relativePath);

describe('windowReads expected output comparison', () => {
  it('test_example_1_bam_window_reads', async () => {
    const bamPath = getExampleBamPath('example_1.bam');
    const result = await windowReads({ bamPath, win: 2, step: 1 });
    const expected = loadExpectedTsvRaw('example_1_window_reads');
    expect(compareTsvSorted(result, expected)).toBe(true);
  });

  it('test_example_3_bam_window_reads', async () => {
    const bamPath = getExampleBamPath('example_3.bam');
    const result = await windowReads({ bamPath, win: 2, step: 1 });
    const expected = loadExpectedTsvRaw('example_3_window_reads');
    expect(compareTsvSorted(result, expected)).toBe(true);
  });

  it('test_example_7_bam_window_reads', async () => {
    const bamPath = getExampleBamPath('example_7.bam');
    const result = await windowReads({ bamPath, win: 2, step: 1 });
    const expected = loadExpectedTsvRaw('example_7_window_reads');
    expect(compareTsvSorted(result, expected)).toBe(true);
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
    const expected = loadExpectedTsvRaw('example_10_win_grad_win_10_step_1');
    expect(compareTsvSorted(result, expected)).toBe(true);
  });

  it('test_example_10_bam_window_reads_gradient_win20_step2', async () => {
    const bamPath = getExampleBamPath('example_10.bam');
    const result = await windowReads({
      bamPath,
      win: 20,
      step: 2,
      winOp: 'grad_density',
    });
    const expected = loadExpectedTsvRaw('example_10_win_grad_win_20_step_2');
    expect(compareTsvSorted(result, expected)).toBe(true);
  });

  it('test_example_11_bam_window_reads_gradient_win10_step1', async () => {
    const bamPath = getExampleBamPath('example_11.bam');
    const result = await windowReads({
      bamPath,
      win: 10,
      step: 1,
      winOp: 'grad_density',
    });
    const expected = loadExpectedTsvRaw('example_11_win_grad_win_10_step_1');
    expect(compareTsvSorted(result, expected)).toBe(true);
  });

  it('test_example_11_bam_window_reads_gradient_win20_step2', async () => {
    const bamPath = getExampleBamPath('example_11.bam');
    const result = await windowReads({
      bamPath,
      win: 20,
      step: 2,
      winOp: 'grad_density',
    });
    const expected = loadExpectedTsvRaw('example_11_win_grad_win_20_step_2');
    expect(compareTsvSorted(result, expected)).toBe(true);
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
        winOp: 'invalid_option',
      }),
    ).rejects.toThrow(/win_op must be set to/);
  });
});

describe('windowReads', () => {
  const testBamPath = getTestDataPath('examples/example_1.bam');

  it('returns TSV output with header', async () => {
    const result = await windowReads({
      bamPath: testBamPath,
      win: 2,
      step: 1,
    });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    // Should start with a header line
    const lines = result.split('\n');
    expect(lines[0].startsWith('#')).toBe(true);
    expect(lines[0]).toContain('contig');
    expect(lines[0]).toContain('read_id');
  });

  it('returns valid TSV format', async () => {
    const result = await windowReads({
      bamPath: testBamPath,
      win: 2,
      step: 1,
    });

    const lines = result.split('\n').filter((line) => line.length > 0);
    const headerFields = lines[0].split('\t');

    // Check data lines have consistent column count
    for (let i = 1; i < lines.length; i++) {
      const dataFields = lines[i].split('\t');
      expect(dataFields.length).toBe(headerFields.length);
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

    const lines = result
      .split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    // All data lines should be for dummyI or unmapped (.)
    for (const line of lines) {
      const contig = line.split('\t')[0];
      expect(['dummyI', '.']).toContain(contig);
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
