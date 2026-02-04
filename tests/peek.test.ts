// Tests for the peek() function which returns BAM file metadata

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { peek, simulateModBam } from '../index';
import { createSimpleBam, createTwoModsBam } from './fixtures';

const getTestDataPath = (relativePath: string) =>
  resolve(__dirname, 'data', relativePath);

describe('peek', () => {
  it('returns contigs and modifications for example_1.bam', async () => {
    const result = await peek({
      bamPath: getTestDataPath('examples/example_1.bam'),
    });

    expect(result).toHaveProperty('contigs');
    expect(result).toHaveProperty('modifications');
    expect(typeof result.contigs).toBe('object');
    expect(Array.isArray(result.modifications)).toBe(true);
  });

  it('returns correct contigs for example_1.bam', async () => {
    const result = await peek({
      bamPath: getTestDataPath('examples/example_1.bam'),
    });

    // example_1.bam should have dummyI, dummyII, dummyIII contigs
    expect(Object.keys(result.contigs).length).toBeGreaterThan(0);
    expect(result.contigs).toHaveProperty('dummyI');
    expect(result.contigs).toHaveProperty('dummyII');
    expect(result.contigs).toHaveProperty('dummyIII');
    expect(result.contigs.dummyI).toBe(22);
    expect(result.contigs.dummyII).toBe(48);
    expect(result.contigs.dummyIII).toBe(76);
  });

  it('returns correct modifications for example_1.bam', async () => {
    const result = await peek({
      bamPath: getTestDataPath('examples/example_1.bam'),
    });

    // example_1.bam should have G-7200 and T+T modifications
    expect(result.modifications.length).toBe(2);

    // Modifications are returned as [base, strand, mod_code] tuples
    const modStrings = result.modifications.map((m) => m.join(''));
    expect(modStrings).toContain('G-7200');
    expect(modStrings).toContain('T+T');
  });

  it('returns correct data for example_3.bam', async () => {
    const result = await peek({
      bamPath: getTestDataPath('examples/example_3.bam'),
    });

    // example_3.bam should have dummyI, dummyII, dummyIII contigs
    expect(result.contigs).toHaveProperty('dummyI');
    expect(result.contigs).toHaveProperty('dummyII');
    expect(result.contigs).toHaveProperty('dummyIII');
  });

  it('handles BAM file with no modifications gracefully', async () => {
    const result = await peek({
      bamPath: getTestDataPath('examples/example_7.bam'),
    });

    // Should still return contigs even if no modifications
    expect(result).toHaveProperty('contigs');
    expect(result).toHaveProperty('modifications');
    expect(Array.isArray(result.modifications)).toBe(true);
  });
});

describe('peek with generated BAM fixtures', () => {
  let tmpDir: string;
  let simpleBamPath: string;
  let twoModsBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-peek-'));
    simpleBamPath = await createSimpleBam(tmpDir);
    twoModsBamPath = await createTwoModsBam(tmpDir);
  }, 60000);

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('test_peek_simple_bam', async () => {
    const result = await peek({ bamPath: simpleBamPath });

    // Verify result structure
    expect(result).toHaveProperty('contigs');
    expect(result).toHaveProperty('modifications');

    // Verify contigs (simple_bam has 2 contigs of 10000bp each)
    const expectedContigs = { contig_00000: 10000, contig_00001: 10000 };
    expect(result.contigs).toEqual(expectedContigs);

    // Verify modifications (simple_bam has T+T modifications)
    const expectedMods = [['T', '+', 'T']];
    expect(result.modifications).toEqual(expectedMods);
  });

  it('test_peek_two_mods', async () => {
    const result = await peek({ bamPath: twoModsBamPath });

    // Verify result structure
    expect(result).toHaveProperty('contigs');
    expect(result).toHaveProperty('modifications');

    // Verify contigs
    const expectedContigs = { contig_00000: 10000, contig_00001: 10000 };
    expect(result.contigs).toEqual(expectedContigs);

    // Verify two modifications detected (order may vary)
    expect(result.modifications.length).toBe(2);
    const modsSet = new Set(result.modifications.map((m) => m.join('')));
    expect(modsSet.has('T-T')).toBe(true);
    expect(modsSet.has('C+76792')).toBe(true);
  });

  it('test_peek_no_mods', async () => {
    // Generate BAM with no modifications
    const config = {
      contigs: { number: 3, len_range: [20000, 20000] },
      reads: [
        {
          number: 100,
          mapq_range: [20, 30],
          base_qual_range: [20, 30],
          len_range: [0.5, 0.5],
          insert_middle: 'ATCG',
          mods: [],
        },
      ],
    };

    const noModsBamPath = join(tmpDir, 'no_mods.bam');
    const noModsFastaPath = join(tmpDir, 'no_mods.fasta');
    await simulateModBam({
      jsonConfig: JSON.stringify(config),
      bamPath: noModsBamPath,
      fastaPath: noModsFastaPath,
    });

    const result = await peek({ bamPath: noModsBamPath });

    // Verify result structure
    expect(result).toHaveProperty('contigs');
    expect(result).toHaveProperty('modifications');

    // Verify contigs
    const expectedContigs = {
      contig_00000: 20000,
      contig_00001: 20000,
      contig_00002: 20000,
    };
    expect(result.contigs).toEqual(expectedContigs);

    // Verify no modifications detected
    expect(result.modifications).toEqual([]);
  });
});
