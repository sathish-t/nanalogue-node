// Tests for error handling in tsnanalogue bindings
// Focuses on runtime errors and validation
// Ported from pynanalogue test_error_handling.py

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bamMods,
  readInfo,
  seqTable,
  simulateModBam,
  windowReads,
} from '../index';
import { createSimpleBam } from './fixtures';

describe('TestZeroLengthReadGuard', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-error-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('readInfo with includeZeroLen=true raises error', async () => {
    await expect(
      readInfo({
        bamPath: simpleBamPath,
        includeZeroLen: true,
      }),
    ).rejects.toThrow(/include_zero_len.*not.*supported/i);
  });

  it('bamMods with includeZeroLen=true raises error', async () => {
    await expect(
      bamMods({
        bamPath: simpleBamPath,
        includeZeroLen: true,
      }),
    ).rejects.toThrow(/include_zero_len.*not.*supported/i);
  });

  it('windowReads with includeZeroLen=true raises error', async () => {
    await expect(
      windowReads({
        bamPath: simpleBamPath,
        win: 5,
        step: 2,
        includeZeroLen: true,
      }),
    ).rejects.toThrow(/include_zero_len.*not.*supported/i);
  });
});

describe('TestWindowReadsValidation', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-window-error-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('windowReads with win=0 raises error', async () => {
    await expect(
      windowReads({
        bamPath: simpleBamPath,
        win: 0,
        step: 2,
      }),
    ).rejects.toThrow();
  });

  it('windowReads with negative win raises error', async () => {
    await expect(
      windowReads({
        bamPath: simpleBamPath,
        win: -5,
        step: 2,
      }),
    ).rejects.toThrow();
  });
});

describe('TestSimulateModBamValidation', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-simulate-error-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('invalid JSON config raises error', async () => {
    await expect(
      simulateModBam({
        jsonConfig: 'not valid json',
        bamPath: join(tmpDir, 'test.bam'),
        fastaPath: join(tmpDir, 'test.fasta'),
      }),
    ).rejects.toThrow();
  });
});

describe('TestFileNotFound', () => {
  it('readInfo with non-existent BAM raises error', async () => {
    await expect(
      readInfo({ bamPath: '/nonexistent/path/to/file.bam' }),
    ).rejects.toThrow();
  });

  it('bamMods with non-existent BAM raises error', async () => {
    await expect(
      bamMods({ bamPath: '/nonexistent/path/to/file.bam' }),
    ).rejects.toThrow();
  });

  it('windowReads with non-existent BAM raises error', async () => {
    await expect(
      windowReads({
        bamPath: '/nonexistent/path/to/file.bam',
        win: 5,
        step: 2,
      }),
    ).rejects.toThrow();
  });

  it('seqTable with non-existent BAM raises error', async () => {
    await expect(
      seqTable({
        bamPath: '/nonexistent/path/to/file.bam',
        region: 'chr1:1-100',
      }),
    ).rejects.toThrow();
  });

  it('peek with non-existent BAM raises error', async () => {
    const { peek } = await import('../index.js');
    await expect(
      peek({ bamPath: '/nonexistent/path/to/file.bam' }),
    ).rejects.toThrow();
  });
});

describe('TestInvalidRegion', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-region-error-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('seqTable with non-existent contig raises error', async () => {
    await expect(
      seqTable({
        bamPath: simpleBamPath,
        region: 'nonexistent_contig:1-100',
      }),
    ).rejects.toThrow();
  });
});

describe('TestInputValidation', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-validation-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('threads=0 raises error', async () => {
    await expect(
      readInfo({
        bamPath: simpleBamPath,
        threads: 0,
      }),
    ).rejects.toThrow(/threads must be a positive integer/i);
  });

  it('sample_fraction < 0 raises error', async () => {
    await expect(
      readInfo({
        bamPath: simpleBamPath,
        sampleFraction: -0.1,
      }),
    ).rejects.toThrow(/sample_fraction must be between 0 and 1/i);
  });

  it('sample_fraction > 1 raises error', async () => {
    await expect(
      readInfo({
        bamPath: simpleBamPath,
        sampleFraction: 1.5,
      }),
    ).rejects.toThrow(/sample_fraction must be between 0 and 1/i);
  });

  it('valid sample_fraction values work', async () => {
    // These should not throw
    await expect(
      readInfo({
        bamPath: simpleBamPath,
        sampleFraction: 0.0,
      }),
    ).resolves.toBeDefined();

    await expect(
      readInfo({
        bamPath: simpleBamPath,
        sampleFraction: 1.0,
      }),
    ).resolves.toBeDefined();

    await expect(
      readInfo({
        bamPath: simpleBamPath,
        sampleFraction: 0.5,
      }),
    ).resolves.toBeDefined();
  });

  it('threads=0 raises error for bamMods', async () => {
    await expect(
      bamMods({
        bamPath: simpleBamPath,
        threads: 0,
      }),
    ).rejects.toThrow(/threads must be a positive integer/i);
  });

  it('threads=0 raises error for windowReads', async () => {
    await expect(
      windowReads({
        bamPath: simpleBamPath,
        win: 5,
        step: 2,
        threads: 0,
      }),
    ).rejects.toThrow(/threads must be a positive integer/i);
  });

  it('sample_fraction invalid raises error for bamMods', async () => {
    await expect(
      bamMods({
        bamPath: simpleBamPath,
        sampleFraction: -0.5,
      }),
    ).rejects.toThrow(/sample_fraction must be between 0 and 1/i);
  });

  it('sample_fraction invalid raises error for windowReads', async () => {
    await expect(
      windowReads({
        bamPath: simpleBamPath,
        win: 5,
        step: 2,
        sampleFraction: 2.0,
      }),
    ).rejects.toThrow(/sample_fraction must be between 0 and 1/i);
  });

  it('sample_fraction invalid raises error for seqTable', async () => {
    await expect(
      seqTable({
        bamPath: simpleBamPath,
        region: 'contig_00000:4000-6000',
        sampleFraction: -0.1,
      }),
    ).rejects.toThrow(/sample_fraction must be between 0 and 1/i);
  });

  it('invalid tag value raises error for readInfo', async () => {
    await expect(
      readInfo({
        bamPath: simpleBamPath,
        tag: 'invalid_garbage_tag',
      }),
    ).rejects.toThrow(/invalid.*tag/i);
  });

  it('invalid tag value raises error for bamMods', async () => {
    await expect(
      bamMods({
        bamPath: simpleBamPath,
        tag: 'not_a_real_tag',
      }),
    ).rejects.toThrow(/invalid.*tag/i);
  });

  it('invalid tag value raises error for windowReads', async () => {
    await expect(
      windowReads({
        bamPath: simpleBamPath,
        win: 5,
        step: 2,
        tag: 'bogus_tag_value',
      }),
    ).rejects.toThrow(/invalid.*tag/i);
  });

  it('invalid tag value raises error for seqTable', async () => {
    await expect(
      seqTable({
        bamPath: simpleBamPath,
        region: 'contig_00000:4000-6000',
        tag: 'fake_tag',
      }),
    ).rejects.toThrow(/invalid.*tag/i);
  });
});

describe('TestFullRegionWithoutRegion', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-fullregion-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('fullRegion without region raises error for readInfo', async () => {
    // This tests runtime validation for plain JS users
    // TypeScript users are protected by discriminated unions
    await expect(
      readInfo({
        bamPath: simpleBamPath,
        fullRegion: true,
      } as Parameters<typeof readInfo>[0]),
    ).rejects.toThrow(/full_region.*without.*region/i);
  });

  it('fullRegion without region raises error for bamMods', async () => {
    await expect(
      bamMods({
        bamPath: simpleBamPath,
        fullRegion: true,
      } as Parameters<typeof bamMods>[0]),
    ).rejects.toThrow(/full_region.*without.*region/i);
  });

  it('fullRegion without region raises error for windowReads', async () => {
    await expect(
      windowReads({
        bamPath: simpleBamPath,
        win: 5,
        step: 2,
        fullRegion: true,
      } as Parameters<typeof windowReads>[0]),
    ).rejects.toThrow(/full_region.*without.*region/i);
  });
});

describe('TestSeqTableConstraints', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-seqtable-constraints-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('seqTable with fullRegion=false raises error', async () => {
    // seqTable requires fullRegion to be true for pynanalogue compatibility
    // If user explicitly sets it to false, we should error rather than silently override
    await expect(
      seqTable({
        bamPath: simpleBamPath,
        region: 'contig_00000:4000-6000',
        fullRegion: false,
      }),
    ).rejects.toThrow(/seqTable.*fullRegion.*true/i);
  });

  it('seqTable with mismatched modRegion raises error', async () => {
    // seqTable requires modRegion to match region for pynanalogue compatibility
    // If user explicitly sets a different modRegion, we should error rather than silently override
    await expect(
      seqTable({
        bamPath: simpleBamPath,
        region: 'contig_00000:4000-6000',
        modRegion: 'contig_00000:1000-2000',
      }),
    ).rejects.toThrow(/seqTable.*modRegion.*match.*region/i);
  });
});
