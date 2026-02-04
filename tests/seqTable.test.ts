// Tests for seqTable function

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seqTable } from '../index';

const getTestDataPath = (relativePath: string) =>
  resolve(__dirname, 'data', relativePath);

// Note: Parametrized region tests (0-10, 15-25, 95-105, 190-200) are in seqTableIntegration.test.ts

describe('seqTable', () => {
  const testBamPath = getTestDataPath('examples/example_1.bam');
  // Region is required for seqTable - use dummyI which exists in example_1.bam
  const testRegion = 'dummyI';

  it('returns TSV output', async () => {
    const result = await seqTable({ bamPath: testBamPath, region: testRegion });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);

    // Should be TSV format
    const lines = result.split('\n').filter((line) => line.length > 0);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('contains expected columns', async () => {
    const result = await seqTable({ bamPath: testBamPath, region: testRegion });

    const lines = result.split('\n').filter((line) => line.length > 0);
    // Find the header line (first non-comment line)
    const headerLine = lines.find((line) => !line.startsWith('#')) || lines[0];

    // Should contain read_id and other info columns
    expect(headerLine).toContain('read_id');
  });

  it('returns consistent column count per row', async () => {
    const result = await seqTable({ bamPath: testBamPath, region: testRegion });

    // Filter out comment lines and empty lines
    const dataLines = result
      .split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    if (dataLines.length < 2) return; // Need at least header + 1 data line

    const headerFields = dataLines[0].split('\t');
    const headerCount = headerFields.length;

    // All data lines should have same column count
    for (const line of dataLines) {
      const fields = line.split('\t');
      expect(fields.length).toBe(headerCount);
    }
  });

  it('can filter by region', async () => {
    const result = await seqTable({
      bamPath: testBamPath,
      region: 'dummyI',
    });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('can filter by read ID', async () => {
    // First get all reads
    const allReads = await seqTable({
      bamPath: testBamPath,
      region: testRegion,
    });
    // Filter out comment lines
    const dataLines = allReads
      .split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    if (dataLines.length < 2) {
      // Skip test if not enough data
      return;
    }

    // Get header and first data line
    const headerLine = dataLines[0];
    const firstDataLine = dataLines[1];
    const readIdIndex = headerLine.split('\t').indexOf('read_id');
    const targetReadId = firstDataLine.split('\t')[readIdIndex];

    const filtered = await seqTable({
      bamPath: testBamPath,
      region: testRegion,
      readIdSet: [targetReadId],
    });

    const filteredDataLines = filtered
      .split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    // Should have header + 1 data line (read may appear multiple times with different alignments)
    expect(filteredDataLines.length).toBeGreaterThanOrEqual(2);
  });
});
