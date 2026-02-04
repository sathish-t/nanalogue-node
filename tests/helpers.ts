// Test helper functions for tsnanalogue tests
// Provides TSV parsing, mod counting, and other utilities

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  BamModRecord,
  MappedBamModRecord,
  MappedReadInfo,
  ReadInfoRecord,
} from '../index';

/**
 * Base interface for records with common properties
 * Used for helper functions that work with both ReadInfoRecord and BamModRecord
 */
export interface BaseRecord {
  read_id: string;
  alignment_type: string;
}

/**
 * Parsed TSV result
 */
export interface ParsedTsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parse a TSV string into headers and rows
 * Handles two formats:
 * 1. Header starts with '#' (e.g., "#contig\tread_id...") - strip the #
 * 2. Pure comment lines starting with '# ' (with space) are skipped
 */
export function parseTsv(tsv: string): ParsedTsv {
  const lines = tsv.trim().split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Find the header line - it's either:
  // 1. A line starting with '#' followed immediately by a column name (no space)
  // 2. Or the first non-comment line
  let headerLineIndex = 0;

  // Skip pure comment lines (lines starting with "# " - hash followed by space)
  while (headerLineIndex < lines.length) {
    const line = lines[headerLineIndex];
    // Pure comment: starts with "# " (hash + space)
    if (line.startsWith('# ')) {
      headerLineIndex++;
      continue;
    }
    break;
  }

  if (headerLineIndex >= lines.length) {
    return { headers: [], rows: [] };
  }

  let headerLine = lines[headerLineIndex];

  // If header starts with '#' (but not "# "), strip the '#'
  if (headerLine.startsWith('#') && !headerLine.startsWith('# ')) {
    headerLine = headerLine.slice(1);
  }

  const headers = headerLine.split('\t').map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines and comment lines (starting with "# ")
    if (!line.trim() || line.startsWith('# ') || line.startsWith('#')) {
      continue;
    }

    const values = line.split('\t');
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Get number of data rows in TSV (excluding header)
 */
export function getRowCount(tsv: string): number {
  const { rows } = parseTsv(tsv);
  return rows.length;
}

/**
 * Get unique values from a column in TSV
 */
export function getUniqueColumnValues(tsv: string, column: string): string[] {
  const { rows } = parseTsv(tsv);
  const values = new Set<string>();
  for (const row of rows) {
    if (row[column] !== undefined) {
      values.add(row[column]);
    }
  }
  return Array.from(values);
}

/**
 * Filter TSV rows by column value
 */
export function filterTsvRows(
  tsv: string,
  column: string,
  value: string,
): Record<string, string>[] {
  const { rows } = parseTsv(tsv);
  return rows.filter((row) => row[column] === value);
}

/**
 * Get unique read IDs from TSV
 */
export function getUniqueReadIds(tsv: string): string[] {
  return getUniqueColumnValues(tsv, 'read_id');
}

/**
 * Count modification markers (Z and z) in a sequence string
 * Z = modification on reference, z = modification in insertion
 */
export function countModsInSequence(sequence: string): number {
  return (sequence.match(/[Zz]/g) || []).length;
}

/**
 * Parse mod_count string and extract count for T+T modification
 * Format: "T+T:2104;(probabilities >= 0.5020, PHRED base qual >= 0)"
 * Or with multiple: "G-7200:0;T+T:3;(...)"
 */
export function parseModCount(modCountStr: string): number {
  if (modCountStr === 'NA' || !modCountStr) {
    return 0;
  }

  // Match pattern like "T+T:2104"
  const match = modCountStr.match(/T\+T:(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Get mod count for a specific modification type
 * @param modCountStr - The mod_count string like "T-T:123;C+76792:456;(...)"
 * @param modPattern - Pattern to look for, e.g. "T-T" or "C+76792"
 */
export function getModCountForType(
  modCountStr: string,
  modPattern: string,
): number {
  if (modCountStr === 'NA' || !modCountStr) {
    return 0;
  }

  // Escape special regex characters in the pattern
  const escapedPattern = modPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedPattern}:(\\d+)`);
  const match = modCountStr.match(regex);

  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Check if a specific mod pattern exists in mod_count string with count > 0
 */
export function hasModInModCount(
  modCountStr: string,
  modPattern: string,
): boolean {
  return getModCountForType(modCountStr, modPattern) > 0;
}

/**
 * Sum up all T+T mod counts across all records from readInfo
 */
export function getTotalModCount(records: ReadInfoRecord[]): number {
  let total = 0;
  for (const record of records) {
    const modCountStr = record.mod_count ?? 'NA';
    total += parseModCount(modCountStr);
  }
  return total;
}

/**
 * Sum up mods in sequences from seqTable output
 */
export function getTotalModCountFromTsv(tsv: string): number {
  const { rows } = parseTsv(tsv);
  let total = 0;
  for (const row of rows) {
    if (row.sequence) {
      total += countModsInSequence(row.sequence);
    }
  }
  return total;
}

/**
 * Get all unique read IDs from readInfo/bamMods result array
 */
export function getUniqueReadIdsFromRecords(records: BaseRecord[]): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.read_id) {
      ids.add(record.read_id);
    }
  }
  return Array.from(ids);
}

/**
 * Count records by alignment type
 */
export function countByAlignmentType(
  records: BaseRecord[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const type = record.alignment_type ?? 'unknown';
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Filter records by alignment type
 */
export function filterByAlignmentType<T extends BaseRecord>(
  records: T[],
  type: string,
): T[] {
  return records.filter((r) => r.alignment_type === type);
}

/**
 * Get unique contigs from records
 * Handles different record structures (readInfo vs bamMods)
 */
export function getUniqueContigsFromRecords(
  records: (ReadInfoRecord | BamModRecord)[],
): string[] {
  const contigs = new Set<string>();
  for (const record of records) {
    // ReadInfoRecord has contig directly, BamModRecord has alignment.contig
    let contig: string | undefined;
    if ('contig' in record) {
      contig = (record as MappedReadInfo).contig;
    } else if ('alignment' in record) {
      contig = (record as MappedBamModRecord).alignment.contig;
    }
    if (contig) {
      contigs.add(contig);
    }
  }
  return Array.from(contigs);
}

/**
 * Sum mod_table data counts across all bamMods records
 */
export function getTotalModTableCount(records: BamModRecord[]): number {
  let total = 0;
  for (const record of records) {
    for (const entry of record.mod_table) {
      total += entry.data.length;
    }
  }
  return total;
}

/**
 * Get unique mod codes from bamMods records
 */
export function getUniqueModCodes(records: BamModRecord[]): string[] {
  const codes = new Set<string>();
  for (const record of records) {
    for (const entry of record.mod_table) {
      codes.add(entry.mod_code);
    }
  }
  return Array.from(codes);
}

/**
 * Get path to expected output file
 */
export function getExpectedOutputPath(filename: string): string {
  return resolve(__dirname, 'data', 'expected_outputs', filename);
}

/**
 * Get path to example BAM file
 */
export function getExampleBamPath(filename: string): string {
  return resolve(__dirname, 'data', 'examples', filename);
}

/**
 * Load expected JSON output file
 */
export function loadExpectedJson(filename: string): unknown {
  const content = readFileSync(getExpectedOutputPath(filename), 'utf-8');
  return JSON.parse(content);
}

/**
 * Load expected TSV output file and parse it
 */
export function loadExpectedTsv(filename: string): ParsedTsv {
  const content = readFileSync(getExpectedOutputPath(filename), 'utf-8');
  return parseTsv(content);
}

/**
 * Load expected TSV output file as raw string
 */
export function loadExpectedTsvRaw(filename: string): string {
  return readFileSync(getExpectedOutputPath(filename), 'utf-8');
}

/**
 * Compare two TSV outputs after sorting rows
 * This handles the fact that row order may differ
 */
export function compareTsvSorted(actual: string, expected: string): boolean {
  const actualParsed = parseTsv(actual);
  const expectedParsed = parseTsv(expected);

  // Check headers match
  if (actualParsed.headers.join('\t') !== expectedParsed.headers.join('\t')) {
    return false;
  }

  // Sort both by all columns concatenated
  const sortFn = (a: Record<string, string>, b: Record<string, string>) => {
    const aStr = Object.values(a).join('\t');
    const bStr = Object.values(b).join('\t');
    return aStr.localeCompare(bStr);
  };

  const actualSorted = [...actualParsed.rows].sort(sortFn);
  const expectedSorted = [...expectedParsed.rows].sort(sortFn);

  if (actualSorted.length !== expectedSorted.length) {
    return false;
  }

  for (let i = 0; i < actualSorted.length; i++) {
    const actualRow = Object.values(actualSorted[i]).join('\t');
    const expectedRow = Object.values(expectedSorted[i]).join('\t');
    if (actualRow !== expectedRow) {
      return false;
    }
  }

  return true;
}

/**
 * Normalize JSON for comparison (sort arrays, normalize numbers)
 */
export function normalizeJsonForComparison(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    // Sort arrays of objects by read_id if present, otherwise stringify
    const normalized = obj.map(normalizeJsonForComparison);
    if (
      normalized.length > 0 &&
      typeof normalized[0] === 'object' &&
      normalized[0] !== null &&
      'read_id' in normalized[0]
    ) {
      return normalized.sort((a, b) => {
        const aId = (a as { read_id: string }).read_id;
        const bId = (b as { read_id: string }).read_id;
        return aId.localeCompare(bId);
      });
    }
    return normalized;
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = normalizeJsonForComparison(
        (obj as Record<string, unknown>)[key],
      );
    }
    return sorted;
  }
  return obj;
}
