// Tests for the simulateModBam() function which generates synthetic BAM files
// from JSON configuration for testing purposes.

import { randomUUID } from 'node:crypto';
import { access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { peek, readInfo, simulateModBam } from '../index';

const getTestDataPath = (relativePath: string) =>
  resolve(__dirname, 'data', relativePath);

describe('simulateModBam', () => {
  let tempDir: string;
  let bamPath: string;
  let fastaPath: string;

  beforeEach(() => {
    tempDir = tmpdir();
    const uniqueId = randomUUID().slice(0, 8);
    bamPath = join(tempDir, `test_${uniqueId}.bam`);
    fastaPath = join(tempDir, `test_${uniqueId}.fasta`);
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await rm(bamPath, { force: true });
      await rm(`${bamPath}.bai`, { force: true });
      await rm(fastaPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('creates BAM and FASTA files from simple config', async () => {
    const configPath = getTestDataPath('simulation_configs/simple_bam.json');
    const jsonConfig = await readFile(configPath, 'utf-8');

    await simulateModBam({ jsonConfig, bamPath, fastaPath });

    // Verify files were created
    await expect(access(bamPath)).resolves.toBeUndefined();
    await expect(access(fastaPath)).resolves.toBeUndefined();
  });

  it('creates valid BAM that can be read with peek', async () => {
    const configPath = getTestDataPath('simulation_configs/simple_bam.json');
    const jsonConfig = await readFile(configPath, 'utf-8');

    await simulateModBam({ jsonConfig, bamPath, fastaPath });

    // Use peek to verify the BAM is valid
    const result = await peek({ bamPath });
    expect(result.contigs).toBeDefined();
    expect(Object.keys(result.contigs).length).toBeGreaterThan(0);
  });

  it('creates BAM with expected number of contigs', async () => {
    const configPath = getTestDataPath('simulation_configs/simple_bam.json');
    const jsonConfig = await readFile(configPath, 'utf-8');
    const config = JSON.parse(jsonConfig);

    await simulateModBam({ jsonConfig, bamPath, fastaPath });

    const result = await peek({ bamPath });
    expect(Object.keys(result.contigs).length).toBe(config.contigs.number);
  });

  it('creates BAM with expected modifications', async () => {
    const configPath = getTestDataPath('simulation_configs/simple_bam.json');
    const jsonConfig = await readFile(configPath, 'utf-8');

    await simulateModBam({ jsonConfig, bamPath, fastaPath });

    const result = await peek({ bamPath });
    // simple_bam.json configures T+T modification
    const modStrings = result.modifications.map((m) => m.join(''));
    expect(modStrings).toContain('T+T');
  });

  it('creates BAM that can be queried with readInfo', async () => {
    const configPath = getTestDataPath('simulation_configs/simple_bam.json');
    const jsonConfig = await readFile(configPath, 'utf-8');
    const config = JSON.parse(jsonConfig);

    await simulateModBam({ jsonConfig, bamPath, fastaPath });

    const reads = await readInfo({ bamPath });
    expect(Array.isArray(reads)).toBe(true);
    // Should have the configured number of reads (1000 in simple_bam.json)
    expect(reads.length).toBe(config.reads[0].number);
  });

  it('rejects invalid JSON config', async () => {
    const invalidConfig = '{ invalid json }';

    await expect(
      simulateModBam({ jsonConfig: invalidConfig, bamPath, fastaPath }),
    ).rejects.toThrow(/Invalid JSON config/);
  });

  it('handles two_mods_bam config with multiple modifications', async () => {
    const configPath = getTestDataPath('simulation_configs/two_mods_bam.json');
    const jsonConfig = await readFile(configPath, 'utf-8');

    await simulateModBam({ jsonConfig, bamPath, fastaPath });

    const result = await peek({ bamPath });
    expect(result.contigs).toBeDefined();
    expect(result.modifications.length).toBeGreaterThan(0);
  });
});
