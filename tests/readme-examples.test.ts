// Tests that verify README.md code examples produce expected outputs
// This ensures documentation stays in sync with actual behavior

import { describe, expect, it } from 'vitest';
import { bamMods, peek, readInfo, seqTable, windowReads } from '../index';

const EXAMPLE_1_BAM = 'tests/data/examples/example_1.bam';
const EXAMPLE_PYNANALOGUE_1_BAM =
  'tests/data/examples/example_pynanalogue_1.bam';

describe('README examples', () => {
  it('peek example produces documented output', async () => {
    const result = await peek({ bamPath: EXAMPLE_1_BAM });

    expect(result.contigs).toEqual({ dummyI: 22, dummyII: 48, dummyIII: 76 });
    expect(result.modifications).toEqual([
      ['G', '-', '7200'],
      ['T', '+', 'T'],
    ]);
  });

  it('readInfo example produces documented output', async () => {
    const reads = await readInfo({ bamPath: EXAMPLE_1_BAM });

    expect(reads[0]).toEqual({
      read_id: '5d10eb9a-aae1-4db8-8ec6-7ebb34d32575',
      sequence_length: 8,
      contig: 'dummyI',
      reference_start: 9,
      reference_end: 17,
      alignment_length: 8,
      alignment_type: 'primary_forward',
      mod_count: 'T+T:0;(probabilities >= 0.5020, PHRED base qual >= 0)',
    });
  });

  it('bamMods example produces documented output', async () => {
    const mods = await bamMods({ bamPath: EXAMPLE_1_BAM });

    expect(mods[0]).toEqual({
      alignment_type: 'primary_forward',
      alignment: { start: 9, end: 17, contig: 'dummyI', contig_id: 0 },
      mod_table: [
        {
          base: 'T',
          is_strand_plus: true,
          mod_code: 'T',
          data: [
            [0, 9, 4],
            [3, 12, 7],
            [4, 13, 9],
            [7, 16, 6],
          ],
        },
      ],
      read_id: '5d10eb9a-aae1-4db8-8ec6-7ebb34d32575',
      seq_len: 8,
    });
  });

  it('windowReads example produces documented output', async () => {
    const tsv = await windowReads({
      bamPath: EXAMPLE_1_BAM,
      win: 2,
      step: 1,
    });

    const lines = tsv.split('\n');
    expect(lines[0]).toBe(
      '#contig\tref_win_start\tref_win_end\tread_id\twin_val\tstrand\tbase\tmod_strand\tmod_type\twin_start\twin_end\tbasecall_qual',
    );
    expect(lines[1]).toBe(
      'dummyI\t9\t13\t5d10eb9a-aae1-4db8-8ec6-7ebb34d32575\t0\t+\tT\t+\tT\t0\t4\t255',
    );
    expect(lines[2]).toBe(
      'dummyI\t12\t14\t5d10eb9a-aae1-4db8-8ec6-7ebb34d32575\t0\t+\tT\t+\tT\t3\t5\t255',
    );
  });

  it('seqTable example produces documented output', async () => {
    const tsv = await seqTable({
      bamPath: EXAMPLE_PYNANALOGUE_1_BAM,
      region: 'contig_00000:0-10',
    });

    const lines = tsv.split('\n');
    expect(lines[0]).toBe('read_id\tsequence\tqualities');

    // Parse rows into objects for easier testing
    const row1 = lines[1].split('\t');
    const row2 = lines[2].split('\t');

    const rows = [
      { read_id: row1[0], sequence: row1[1], qualities: row1[2] },
      { read_id: row2[0], sequence: row2[1], qualities: row2[2] },
    ];

    // Find the row with modified sequence (AZGTAZGTAZ) and unmodified (ACGTACGTAC)
    const modifiedRow = rows.find((r) => r.sequence === 'AZGTAZGTAZ');
    const unmodifiedRow = rows.find((r) => r.sequence === 'ACGTACGTAC');

    if (!modifiedRow || !unmodifiedRow) {
      throw new Error('Expected rows not found in seqTable output');
    }

    // Read IDs should start with 0. and 1.
    expect(modifiedRow.read_id.startsWith('0.')).toBe(true);
    expect(unmodifiedRow.read_id.startsWith('1.')).toBe(true);

    // Qualities should match expected values
    expect(modifiedRow.qualities).toBe('20.20.20.20.20.20.20.20.20.20');
    expect(unmodifiedRow.qualities).toBe('30.30.30.30.30.30.30.30.30.30');
  });
});
