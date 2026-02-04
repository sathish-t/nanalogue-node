// Tests for seqTable() function with expected sequence outputs
// Validates sequence extraction from BAM files with modification markers
// Ported from pynanalogue test_seq_table.py

import { describe, expect, it } from 'vitest';
import { seqTable } from '../index';
import {
  EXAMPLE_PYNANALOGUE_1_BAM,
  EXAMPLE_PYNANALOGUE_1_FIRST_READ_REV_BAM,
} from './fixtures';
import { parseTsv } from './helpers';

const BAM_FORWARD = EXAMPLE_PYNANALOGUE_1_BAM;
const BAM_FIRST_READ_REV = EXAMPLE_PYNANALOGUE_1_FIRST_READ_REV_BAM;

describe('seqTable integration tests', () => {
  describe('region 0-10', () => {
    it.each([
      ['forward', BAM_FORWARD, 'AZGTAZGTAZ', 'ACGTACGTAC'],
      ['first_read_rev', BAM_FIRST_READ_REV, 'ACZTACZTAC', 'ACGTACGTAC'],
    ])('test_seq_table_region_0_10 (%s)', async (_name, bamFile, expected0Seq, expected1Seq) => {
      const result = await seqTable({
        bamPath: bamFile,
        region: 'contig_00000:0-10',
      });

      const { rows } = parseTsv(result);

      expect(rows.length).toBe(2);

      const expected: Record<string, { sequence: string; qualities: string }> =
        {
          '0.': {
            sequence: expected0Seq,
            qualities: '20.20.20.20.20.20.20.20.20.20',
          },
          '1.': {
            sequence: expected1Seq,
            qualities: '30.30.30.30.30.30.30.30.30.30',
          },
        };

      for (const row of rows) {
        const readId = row.read_id;
        const prefix = readId.slice(0, 2);

        expect(prefix in expected).toBe(true);
        expect(row.sequence).toBe(expected[prefix].sequence);
        expect(row.qualities).toBe(expected[prefix].qualities);
      }
    });
  });

  describe('region 15-25', () => {
    it.each([
      ['forward', BAM_FORWARD, 'TAZGT.....', 'TACGT.....'],
      ['first_read_rev', BAM_FIRST_READ_REV, 'TACZT.....', 'TACGT.....'],
    ])('test_seq_table_region_15_25 (%s) with partial coverage', async (_name, bamFile, expected0Seq, expected1Seq) => {
      const result = await seqTable({
        bamPath: bamFile,
        region: 'contig_00000:15-25',
      });

      const { rows } = parseTsv(result);

      expect(rows.length).toBe(2);

      const expected: Record<string, { sequence: string; qualities: string }> =
        {
          '0.': {
            sequence: expected0Seq,
            qualities: '20.20.20.20.20.255.255.255.255.255',
          },
          '1.': {
            sequence: expected1Seq,
            qualities: '30.30.30.30.30.255.255.255.255.255',
          },
        };

      for (const row of rows) {
        const readId = row.read_id;
        const prefix = readId.slice(0, 2);

        expect(prefix in expected).toBe(true);
        expect(row.sequence).toBe(expected[prefix].sequence);
        expect(row.qualities).toBe(expected[prefix].qualities);
      }
    });
  });

  describe('region 95-105', () => {
    it.each([
      ['forward', BAM_FORWARD, 'TAZGTztztAZGTA', 'TACGTctctACGTA'],
      [
        'first_read_rev',
        BAM_FIRST_READ_REV,
        'TACZTctctACZTA',
        'TACGTctctACGTA',
      ],
    ])('test_seq_table_region_95_105 (%s) with insertions', async (_name, bamFile, expected0Seq, expected1Seq) => {
      const result = await seqTable({
        bamPath: bamFile,
        region: 'contig_00000:95-105',
      });

      const { rows } = parseTsv(result);

      expect(rows.length).toBe(2);

      const expected: Record<string, { sequence: string; qualities: string }> =
        {
          '0.': {
            sequence: expected0Seq,
            qualities: '20.20.20.20.20.20.20.20.20.20.20.20.20.20',
          },
          '1.': {
            sequence: expected1Seq,
            qualities: '30.30.30.30.30.30.30.30.30.30.30.30.30.30',
          },
        };

      for (const row of rows) {
        const readId = row.read_id;
        const prefix = readId.slice(0, 2);

        expect(prefix in expected).toBe(true);
        expect(row.sequence).toBe(expected[prefix].sequence);
        expect(row.qualities).toBe(expected[prefix].qualities);
      }
    });
  });

  describe('region 190-200', () => {
    it.each([
      ['forward', BAM_FORWARD, 'GTAZGTAZGT', 'GTACGTACGT'],
      ['first_read_rev', BAM_FIRST_READ_REV, 'ZTACZTACZT', 'GTACGTACGT'],
    ])('test_seq_table_region_190_200 (%s)', async (_name, bamFile, expected0Seq, expected1Seq) => {
      const result = await seqTable({
        bamPath: bamFile,
        region: 'contig_00000:190-200',
      });

      const { rows } = parseTsv(result);

      expect(rows.length).toBe(2);

      const expected: Record<string, { sequence: string; qualities: string }> =
        {
          '0.': {
            sequence: expected0Seq,
            qualities: '20.20.20.20.20.20.20.20.20.20',
          },
          '1.': {
            sequence: expected1Seq,
            qualities: '30.30.30.30.30.30.30.30.30.30',
          },
        };

      for (const row of rows) {
        const readId = row.read_id;
        const prefix = readId.slice(0, 2);

        expect(prefix in expected).toBe(true);
        expect(row.sequence).toBe(expected[prefix].sequence);
        expect(row.qualities).toBe(expected[prefix].qualities);
      }
    });
  });
});
