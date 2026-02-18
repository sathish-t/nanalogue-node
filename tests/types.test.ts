// Tests for TypeScript type handling in tsnanalogue
// Validates that functions accept and return correct types
// Ported from pynanalogue test_types.py

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bamMods,
  peek,
  type ReadInfoRecord,
  readInfo,
  seqTable,
  simulateModBam,
  windowReads,
} from '../index';
import { createSimpleBam, EXAMPLE_1_BAM } from './fixtures';
import { parseTsv } from './helpers';

describe('TestReturnTypes', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-types-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('readInfo returns array', async () => {
    const result = await readInfo({ bamPath: simpleBamPath });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('bamMods returns array', async () => {
    const result = await bamMods({ bamPath: simpleBamPath });
    expect(Array.isArray(result)).toBe(true);
  });

  it('windowReads returns string (JSON)', async () => {
    const result = await windowReads({
      bamPath: simpleBamPath,
      win: 5,
      step: 2,
    });
    expect(typeof result).toBe('string');
  });

  it('seqTable returns string (TSV)', async () => {
    const result = await seqTable({
      bamPath: simpleBamPath,
      region: 'contig_00000:4000-6000',
    });
    expect(typeof result).toBe('string');
  });

  it('simulateModBam returns void on success', async () => {
    const config = {
      contigs: { number: 1, len_range: [100, 100] },
      reads: [
        {
          number: 10,
          mapq_range: [10, 20],
          base_qual_range: [10, 20],
          len_range: [0.5, 0.5],
        },
      ],
    };

    const uniqueId = randomUUID().slice(0, 8);
    const bamPath = join(tmpDir, `test_${uniqueId}.bam`);
    const fastaPath = join(tmpDir, `test_${uniqueId}.fasta`);

    const result = await simulateModBam({
      jsonConfig: JSON.stringify(config),
      bamPath,
      fastaPath,
    });

    expect(result).toBeUndefined();
  });

  it('peek returns PeekResult with contigs and modifications', async () => {
    const result = await peek({ bamPath: simpleBamPath });
    expect(result).toHaveProperty('contigs');
    expect(result).toHaveProperty('modifications');
    expect(typeof result.contigs).toBe('object');
    expect(Array.isArray(result.modifications)).toBe(true);
  });
});

describe('TestParameterTypes', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-params-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('readInfo accepts string path', async () => {
    const result = await readInfo({ bamPath: simpleBamPath });
    expect(Array.isArray(result)).toBe(true);
  });

  it('boolean parameters work correctly', async () => {
    // Note: fullRegion cannot be set without region (discriminated union constraint)
    const result = await readInfo({
      bamPath: simpleBamPath,
      includeZeroLen: false,
      excludeMapqUnavail: true,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('numeric parameters accept correct types', async () => {
    const result = await bamMods({
      bamPath: simpleBamPath,
      minSeqLen: 100,
      minAlignLen: 50,
      threads: 4,
      sampleFraction: 0.5,
      mapqFilter: 10,
      minModQual: 128,
      trimReadEndsMod: 5,
      baseQualFilterMod: 20,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('readIdSet parameter works correctly', async () => {
    // Get some read IDs first
    const allReads = await readInfo({ bamPath: simpleBamPath });
    expect(allReads.length).toBeGreaterThan(0);

    const readId = allReads[0].read_id;
    const result = await readInfo({
      bamPath: simpleBamPath,
      readIdSet: [readId],
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('empty readIdSet is handled correctly (returns all)', async () => {
    const result = await readInfo({
      bamPath: simpleBamPath,
      readIdSet: [],
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('TestOutputSchema', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-schema-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('bamMods records have correct structure', async () => {
    const result = await bamMods({ bamPath: simpleBamPath });
    expect(result.length).toBeGreaterThan(0);

    const record = result[0];
    expect(record).toHaveProperty('read_id');
    expect(record).toHaveProperty('seq_len');
    expect(record).toHaveProperty('alignment_type');
    expect(record).toHaveProperty('mod_table');
    expect(Array.isArray(record.mod_table)).toBe(true);

    // Verify types
    expect(typeof record.read_id).toBe('string');
    expect(typeof record.seq_len).toBe('number');
  });

  it('windowReads JSON has correct structure', async () => {
    const result = await windowReads({
      bamPath: simpleBamPath,
      win: 5,
      step: 2,
    });

    const entries = JSON.parse(result) as Record<string, unknown>[];
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);

    const expectedKeys = ['alignment_type', 'mod_table', 'read_id', 'seq_len'];

    for (const key of expectedKeys) {
      expect(entries[0]).toHaveProperty(key);
    }

    const modTable = entries[0].mod_table as Record<string, unknown>[];
    expect(Array.isArray(modTable)).toBe(true);
    for (const modEntry of modTable) {
      expect(modEntry).toHaveProperty('base');
      expect(modEntry).toHaveProperty('is_strand_plus');
      expect(modEntry).toHaveProperty('mod_code');
      expect(modEntry).toHaveProperty('data');
      expect(Array.isArray(modEntry.data)).toBe(true);
    }
  });

  it('seqTable TSV has correct columns', async () => {
    const result = await seqTable({
      bamPath: simpleBamPath,
      region: 'contig_00000:4000-6000',
    });

    const { headers } = parseTsv(result);
    expect(headers).toContain('read_id');
    expect(headers).toContain('sequence');
    expect(headers).toContain('qualities');
  });
});

describe('TestJSONOutput', () => {
  it('readInfo output has expected structure', async () => {
    const result = await readInfo({ bamPath: EXAMPLE_1_BAM });
    expect(Array.isArray(result)).toBe(true);

    if (result.length > 0) {
      const firstRecord = result[0];
      expect(firstRecord).toHaveProperty('read_id');
      expect(firstRecord).toHaveProperty('sequence_length');

      expect(typeof firstRecord.read_id).toBe('string');
      expect(typeof firstRecord.sequence_length).toBe('number');
    }
  });

  it('readInfo mapped records have alignment fields', async () => {
    const result = await readInfo({ bamPath: EXAMPLE_1_BAM });
    const mapped = result.filter(
      (r: ReadInfoRecord) => r.alignment_type !== 'unmapped',
    );

    expect(mapped.length).toBeGreaterThan(0);

    for (const record of mapped) {
      expect(record).toHaveProperty('contig');
      expect(record).toHaveProperty('reference_start');
      expect(record).toHaveProperty('reference_end');
    }
  });

  it('readInfo unmapped records lack alignment fields', async () => {
    const result = await readInfo({ bamPath: EXAMPLE_1_BAM });
    const unmapped = result.filter(
      (r: ReadInfoRecord) => r.alignment_type === 'unmapped',
    );

    for (const record of unmapped) {
      expect(record).not.toHaveProperty('contig');
      expect(record).not.toHaveProperty('reference_start');
    }
  });
});

describe('TestDefaultParameters', () => {
  let tmpDir: string;
  let simpleBamPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'nanalogue-defaults-'));
    simpleBamPath = await createSimpleBam(tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('readInfo with only required parameter', async () => {
    const result = await readInfo({ bamPath: simpleBamPath });
    expect(Array.isArray(result)).toBe(true);
  });

  it('bamMods with only required parameter', async () => {
    const result = await bamMods({ bamPath: simpleBamPath });
    expect(Array.isArray(result)).toBe(true);
  });

  it('windowReads with only required parameters', async () => {
    const result = await windowReads({
      bamPath: simpleBamPath,
      win: 10,
      step: 5,
    });
    expect(typeof result).toBe('string');
  });

  it('seqTable with only required parameters', async () => {
    const result = await seqTable({
      bamPath: simpleBamPath,
      region: 'contig_00000:4000-6000',
    });
    expect(typeof result).toBe('string');
  });

  it('peek with only required parameter', async () => {
    const result = await peek({ bamPath: simpleBamPath });
    expect(result).toHaveProperty('contigs');
    expect(result).toHaveProperty('modifications');
  });
});
