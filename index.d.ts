// Node.js bindings for Nanalogue: single-molecule BAM/Mod-BAM analysis
// This file provides TypeScript type definitions for the native module.

export interface PeekResult {
  contigs: Record<string, number>;
  modifications: [string, string, string][];
}

export interface PeekOptions {
  bamPath: string;
  /** If true, treat bamPath as a URL. Otherwise treat as file path. */
  treatAsUrl?: boolean;
}

export declare function peek(options: PeekOptions): Promise<PeekResult>;

// Read info types
export interface MappedReadInfo {
  read_id: string;
  sequence_length: number;
  contig: string;
  reference_start: number;
  reference_end: number;
  alignment_length: number;
  alignment_type: string;
  mod_count: string;
}

export interface UnmappedReadInfo {
  read_id: string;
  sequence_length: number;
  alignment_type: 'unmapped';
  mod_count: string;
}

export type ReadInfoRecord = MappedReadInfo | UnmappedReadInfo;

// Base options shared by ReadOptions (excluding region/fullRegion)
interface BaseReadOptionsCore {
  /** Path to the BAM file (local path or URL). */
  bamPath: string;
  /** If true, treat bamPath as a URL. Otherwise treat as file path. */
  treatAsUrl?: boolean;
  /** Minimum sequence length filter. */
  minSeqLen?: number;
  /** Minimum alignment length filter. */
  minAlignLen?: number;
  /** Filter to a set of read IDs. */
  readIdSet?: string[];
  /** Number of threads for BAM reading. */
  threads?: number;
  /** Include zero-length sequences (may cause crashes). */
  includeZeroLen?: boolean;
  /** Comma-separated read filter (e.g., "primary_forward,primary_reverse"). */
  readFilter?: string;
  /** Subsample fraction (0.0 to 1.0). */
  sampleFraction?: number;
  /** Minimum mapping quality filter. */
  mapqFilter?: number;
  /** Exclude reads with unavailable mapping quality. */
  excludeMapqUnavail?: boolean;
  /** Filter to specific modification tag. */
  tag?: string;
  /** Filter by modification strand ("bc" or "bc_comp"). */
  modStrand?: string;
  /** Minimum modification quality threshold. */
  minModQual?: number;
  /**
   * Reject modification calls where low < probability < high.
   * Tuple of [low, high] where both are 0-255.
   * If low >= high or difference is <= 1, no rejection range is applied.
   */
  rejectModQualNonInclusive?: [number, number];
  /** Trim modification info from read ends (bp). */
  trimReadEndsMod?: number;
  /** Base quality filter for modifications. */
  baseQualFilterMod?: number;
  /** Genomic region for modification filtering. */
  modRegion?: string;
}

/**
 * ReadOptions with a region filter specified.
 * When `region` is set, `fullRegion` can optionally be used to require reads
 * to fully span the region.
 */
interface ReadOptionsWithRegion extends BaseReadOptionsCore {
  /** Genomic region filter (e.g., "chr1:1000-2000"). */
  region: string;
  /**
   * Only include reads fully spanning the region.
   * Can only be set when `region` is specified.
   */
  fullRegion?: boolean;
}

/**
 * ReadOptions without a region filter.
 * When `region` is not set, `fullRegion` cannot be used.
 */
interface ReadOptionsWithoutRegion extends BaseReadOptionsCore {
  region?: undefined;
  fullRegion?: undefined;
}

/**
 * Options for read operations including BAM filtering and modification parameters.
 *
 * Note: `fullRegion` can only be set when `region` is specified.
 */
export type ReadOptions = ReadOptionsWithRegion | ReadOptionsWithoutRegion;

export declare function readInfo(options: ReadOptions): Promise<ReadInfoRecord[]>;

// Simulation types
export interface SimulateOptions {
  jsonConfig: string;
  bamPath: string;
  fastaPath: string;
}

export declare function simulateModBam(options: SimulateOptions): Promise<void>;

// Detailed modification data types (bamMods)
export interface ModTableEntry {
  base: string;
  is_strand_plus: boolean;
  mod_code: string;
  data: [number, number, number][]; // [read_pos, ref_pos, probability]
}

export interface MappedBamModRecord {
  alignment_type: 'primary_forward' | 'primary_reverse' | 'secondary_forward' | 'secondary_reverse' | 'supplementary_forward' | 'supplementary_reverse';
  alignment: {
    start: number;
    end: number;
    contig: string;
    contig_id: number;
  };
  mod_table: ModTableEntry[];
  read_id: string;
  seq_len: number;
}

export interface UnmappedBamModRecord {
  alignment_type: 'unmapped';
  mod_table: ModTableEntry[];
  read_id: string;
  seq_len: number;
}

export type BamModRecord = MappedBamModRecord | UnmappedBamModRecord;

export declare function bamMods(options: ReadOptions): Promise<BamModRecord[]>;

// Base options shared by WindowOptions (excluding region/fullRegion)
interface BaseWindowOptionsCore {
  /** Path to the BAM file (local path or URL). */
  bamPath: string;
  /** If true, treat bamPath as a URL. Otherwise treat as file path. */
  treatAsUrl?: boolean;
  /** Window size in number of bases. */
  win: number;
  /** Step size for sliding the window. */
  step: number;
  /** Type of windowing operation: "density" or "grad_density". */
  winOp?: string;
  /** Minimum sequence length filter. */
  minSeqLen?: number;
  /** Minimum alignment length filter. */
  minAlignLen?: number;
  /** Filter to a set of read IDs. */
  readIdSet?: string[];
  /** Number of threads for BAM reading. */
  threads?: number;
  /** Include zero-length sequences (may cause crashes). */
  includeZeroLen?: boolean;
  /** Comma-separated read filter. */
  readFilter?: string;
  /** Subsample fraction (0.0 to 1.0). */
  sampleFraction?: number;
  /** Minimum mapping quality filter. */
  mapqFilter?: number;
  /** Exclude reads with unavailable mapping quality. */
  excludeMapqUnavail?: boolean;
  /** Filter to specific modification tag. */
  tag?: string;
  /** Filter by modification strand. */
  modStrand?: string;
  /** Minimum modification quality threshold. */
  minModQual?: number;
  /**
   * Reject modification calls where low < probability < high.
   * Tuple of [low, high] where both are 0-255.
   * If low >= high or difference is <= 1, no rejection range is applied.
   */
  rejectModQualNonInclusive?: [number, number];
  /** Trim modification info from read ends (bp). */
  trimReadEndsMod?: number;
  /** Base quality filter for modifications. */
  baseQualFilterMod?: number;
  /** Genomic region for modification filtering. */
  modRegion?: string;
}

/**
 * WindowOptions with a region filter specified.
 * When `region` is set, `fullRegion` can optionally be used to require reads
 * to fully span the region.
 */
interface WindowOptionsWithRegion extends BaseWindowOptionsCore {
  /** Genomic region filter (e.g., "chr1:1000-2000"). */
  region: string;
  /**
   * Only include reads fully spanning the region.
   * Can only be set when `region` is specified.
   */
  fullRegion?: boolean;
}

/**
 * WindowOptions without a region filter.
 * When `region` is not set, `fullRegion` cannot be used.
 */
interface WindowOptionsWithoutRegion extends BaseWindowOptionsCore {
  region?: undefined;
  fullRegion?: undefined;
}

/**
 * Options for windowed modification analysis.
 *
 * Note: `fullRegion` can only be set when `region` is specified.
 */
export type WindowOptions = WindowOptionsWithRegion | WindowOptionsWithoutRegion;

export declare function windowReads(options: WindowOptions): Promise<string>;

export declare function seqTable(options: ReadOptions): Promise<string>;
