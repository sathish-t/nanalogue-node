// Shared test fixtures for tsnanalogue tests
// Provides BAM generation helpers and InputOptions builder pattern

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type ReadOptions,
  simulateModBam,
  type WindowOptions,
} from '../index';

const TEST_DATA_DIR = resolve(__dirname, 'data');
const SIMULATION_CONFIGS_DIR = join(TEST_DATA_DIR, 'simulation_configs');
const EXAMPLES_DIR = join(TEST_DATA_DIR, 'examples');

/**
 * Load a simulation config JSON file
 */
async function loadSimulationConfig(configName: string): Promise<string> {
  const configPath = join(SIMULATION_CONFIGS_DIR, `${configName}.json`);
  return readFile(configPath, 'utf-8');
}

/**
 * Generate a BAM file from a simulation config
 */
async function generateBamFromConfig(
  tmpDir: string,
  configName: string,
  prefix: string = 'test',
): Promise<{ bamPath: string; fastaPath: string }> {
  const config = await loadSimulationConfig(configName);
  const uniqueId = randomUUID().slice(0, 8);
  const bamPath = join(tmpDir, `${prefix}_${uniqueId}.bam`);
  const fastaPath = join(tmpDir, `${prefix}_${uniqueId}.fasta`);

  await simulateModBam({
    jsonConfig: config,
    bamPath,
    fastaPath,
  });

  return { bamPath, fastaPath };
}

/**
 * Create a simple test BAM with 1000 reads, 10kb contigs, T+T modifications
 * Equivalent to pytest simple_bam fixture
 */
export async function createSimpleBam(tmpDir: string): Promise<string> {
  const { bamPath } = await generateBamFromConfig(
    tmpDir,
    'simple_bam',
    'simple',
  );
  return bamPath;
}

/**
 * Create a larger benchmark BAM with 1000 reads, 1Mb contigs
 * Equivalent to pytest benchmark_bam fixture
 */
export async function createBenchmarkBam(tmpDir: string): Promise<string> {
  const { bamPath } = await generateBamFromConfig(
    tmpDir,
    'benchmark_bam',
    'benchmark',
  );
  return bamPath;
}

/**
 * Create a test BAM with two modification types (T- and C+76792)
 * Equivalent to pytest two_mods_bam fixture
 */
export async function createTwoModsBam(tmpDir: string): Promise<string> {
  const { bamPath } = await generateBamFromConfig(
    tmpDir,
    'two_mods_bam',
    'two_mods',
  );
  return bamPath;
}

/**
 * Get path to a static example BAM file
 */
export function getExampleBamPath(filename: string): string {
  return join(EXAMPLES_DIR, filename);
}

/**
 * Get path to expected output file
 */
export function getExpectedOutputPath(filename: string): string {
  return join(TEST_DATA_DIR, 'expected_outputs', filename);
}

/**
 * Options for read operations - mirrors ReadOptions but with sensible defaults
 * Used for building test parameter combinations without combinatorial explosion
 */
export interface InputOptions {
  bamPath: string;
  treatAsUrl?: boolean;
  minSeqLen?: number;
  minAlignLen?: number;
  readIdSet?: string[];
  threads?: number;
  includeZeroLen?: boolean;
  readFilter?: string;
  sampleFraction?: number;
  mapqFilter?: number;
  excludeMapqUnavail?: boolean;
  region?: string;
  fullRegion?: boolean;
  tag?: string;
  modStrand?: string;
  minModQual?: number;
  rejectModQualNonInclusive?: [number, number];
  trimReadEndsMod?: number;
  baseQualFilterMod?: number;
  modRegion?: string;
}

/**
 * Options for window reads operations.
 * Uses Omit to exclude region/fullRegion to avoid discriminated union issues.
 */
export interface WindowInputOptions
  extends Omit<InputOptions, 'region' | 'fullRegion'> {
  win: number;
  step: number;
  region?: string;
  fullRegion?: boolean;
}

/**
 * Create InputOptions with defaults, allowing specific overrides.
 * Returns ReadOptions type for compatibility with discriminated union.
 */
export function createInputOptions(
  bamPath: string,
  overrides: Partial<Omit<InputOptions, 'bamPath'>> = {},
): ReadOptions {
  return {
    bamPath,
    threads: 2,
    ...overrides,
  } as ReadOptions;
}

/**
 * Create WindowInputOptions with defaults.
 * Returns WindowOptions type for compatibility with discriminated union.
 */
export function createWindowInputOptions(
  bamPath: string,
  win: number,
  overrides: Partial<Omit<WindowInputOptions, 'bamPath' | 'win'>> = {},
): WindowOptions {
  return {
    bamPath,
    win,
    step: overrides.step ?? 2,
    threads: 2,
    ...overrides,
  } as WindowOptions;
}

/**
 * Create InputOptions for seq_table with defaults (region is required for seq_table).
 * Returns ReadOptions type for compatibility with discriminated union.
 */
export function createSeqTableInputOptions(
  bamPath: string,
  region: string,
  overrides: Partial<Omit<InputOptions, 'bamPath' | 'region'>> = {},
): ReadOptions {
  return {
    bamPath,
    region,
    threads: 2,
    ...overrides,
  } as ReadOptions;
}

// Static example BAM paths for convenience
export const EXAMPLE_1_BAM = getExampleBamPath('example_1.bam');
export const EXAMPLE_3_BAM = getExampleBamPath('example_3.bam');
export const EXAMPLE_7_BAM = getExampleBamPath('example_7.bam');
export const EXAMPLE_10_BAM = getExampleBamPath('example_10.bam');
export const EXAMPLE_11_BAM = getExampleBamPath('example_11.bam');
export const EXAMPLE_PYNANALOGUE_1_BAM = getExampleBamPath(
  'example_pynanalogue_1.bam',
);
export const EXAMPLE_PYNANALOGUE_1_FIRST_READ_REV_BAM = getExampleBamPath(
  'example_pynanalogue_1_first_read_rev.bam',
);
