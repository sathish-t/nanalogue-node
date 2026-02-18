# `nanalogue-node`

Node.js bindings for Nanalogue: single-molecule BAM/Mod-BAM analysis.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Nanalogue is a tool to parse and analyse BAM/Mod-BAM files with a single-molecule focus.
This package exposes Nanalogue's functions through a Node.js/TypeScript interface using [NAPI-RS](https://napi.rs/).

A common pain point in genomics analyses is that BAM files are information-dense,
making it difficult to gain insight from them. Nanalogue-node helps extract and process
this information, with a particular focus on single-molecule aspects and DNA/RNA modifications.

We support any type of DNA/RNA modifications in any pattern (single/multiple mods,
spatially-isolated/non-isolated, etc.). All we require is that the data is stored
in a BAM file in the mod BAM format (using MM/ML tags as specified in the
[SAM tags specification](https://samtools.github.io/hts-specs/SAMtags.pdf)).

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Functions](#functions)
  - [peek](#peek)
  - [readInfo](#readinfo)
  - [bamMods](#bammods)
  - [windowReads](#windowreads)
  - [seqTable](#seqtable)
  - [simulateModBam](#simulatemodbam)
- [TypeScript Support](#typescript-support)
- [Pagination](#pagination)
- [Filtering Options](#filtering-options)
- [Further Documentation](#further-documentation)
- [Versioning](#versioning)
- [Acknowledgments](#acknowledgments)

## Requirements

- Node.js 22 or higher
- For building from source: Rust toolchain

## Installation

```bash
npm install @nanalogue/node
```

## Functions

All functions return Promises and support extensive filtering options.

### peek

Quickly extract BAM file metadata without processing all records.

<!-- TEST CODE: START peek -->
```typescript
import { peek } from '@nanalogue/node';

const result = await peek({ bamPath: 'tests/data/examples/example_1.bam' });
console.log(JSON.stringify(result));
```
<!-- TEST CODE: END peek -->

The output is a JSON object with two keys: `contigs` (contig names to lengths)
and `modifications` (modification entries as `[base, strand, code]` where
`+` indicates the basecalled strand and `-` indicates its complement).

<!-- TEST OUTPUT: START peek -->
```json
{"contigs":{"dummyI":22,"dummyII":48,"dummyIII":76},"modifications":[["G","-","7200"],["T","+","T"]]}
```
<!-- TEST OUTPUT: END peek -->

### readInfo

Get information about reads in the BAM file.

<!-- TEST CODE: START readInfo -->
```typescript
import { readInfo } from '@nanalogue/node';

const reads = await readInfo({ bamPath: 'tests/data/examples/example_1.bam' });
console.log(JSON.stringify(reads[0], null, 2));
```
<!-- TEST CODE: END readInfo -->

The output is a JSON object for the first read:

<!-- TEST OUTPUT: START readInfo -->
```json
{
  "read_id": "5d10eb9a-aae1-4db8-8ec6-7ebb34d32575",
  "sequence_length": 8,
  "contig": "dummyI",
  "reference_start": 9,
  "reference_end": 17,
  "alignment_length": 8,
  "alignment_type": "primary_forward",
  "mod_count": "T+T:0;(probabilities >= 0.5020, PHRED base qual >= 0)"
}
```
<!-- TEST OUTPUT: END readInfo -->

### bamMods

Extract detailed modification data for each read.

<!-- TEST CODE: START bamMods -->
```typescript
import { bamMods } from '@nanalogue/node';

const mods = await bamMods({ bamPath: 'tests/data/examples/example_1.bam' });
console.log(JSON.stringify(mods[0], null, 2));
```
<!-- TEST CODE: END bamMods -->

The output is a JSON object for the first read. The `data` arrays contain
`[seq_pos, ref_pos, mod_quality]` tuples:

<!-- TEST OUTPUT: START bamMods -->
```json
{
  "alignment_type": "primary_forward",
  "alignment": {
    "start": 9,
    "end": 17,
    "contig": "dummyI",
    "contig_id": 0
  },
  "mod_table": [
    {
      "base": "T",
      "is_strand_plus": true,
      "mod_code": "T",
      "data": [
        [
          0,
          9,
          4
        ],
        [
          3,
          12,
          7
        ],
        [
          4,
          13,
          9
        ],
        [
          7,
          16,
          6
        ]
      ]
    }
  ],
  "read_id": "5d10eb9a-aae1-4db8-8ec6-7ebb34d32575",
  "seq_len": 8
}
```
<!-- TEST OUTPUT: END bamMods -->

### windowReads

Compute windowed modification densities across reads.

<!-- TEST CODE: START windowReads -->
```typescript
import { windowReads } from '@nanalogue/node';

const json = await windowReads({
  bamPath: 'tests/data/examples/example_1.bam',
  win: 2,
  step: 1
});
const entries = JSON.parse(json);
console.log(JSON.stringify(entries[0], null, 2));
```
<!-- TEST CODE: END windowReads -->

The output is a JSON array of per-read entries. Each entry contains alignment
info and a `mod_table` with windowed data tuples
`[win_start, win_end, win_val, mean_base_qual, ref_win_start, ref_win_end]`.
(mean\_base\_qual is 255 as base quality scores are unavailable in this example file.).
NOTE: If the `alignment_type` is "unmapped", then the `alignment` field is not present.

<!-- TEST OUTPUT: START windowReads -->
```json
{
  "alignment_type": "primary_forward",
  "alignment": {
    "start": 9,
    "end": 17,
    "contig": "dummyI",
    "contig_id": 0
  },
  "mod_table": [
    {
      "base": "T",
      "is_strand_plus": true,
      "mod_code": "T",
      "data": [
        [0, 4, 0.0, 255, 9, 13],
        [3, 5, 0.0, 255, 12, 14],
        [4, 8, 0.0, 255, 13, 17]
      ]
    }
  ],
  "read_id": "5d10eb9a-aae1-4db8-8ec6-7ebb34d32575",
  "seq_len": 8
}
```
<!-- TEST OUTPUT: END windowReads -->

Supports `winOp: 'grad_density'` for gradient mode.

### seqTable

Extract sequences and qualities for a genomic region.

<!-- TEST CODE: START seqTable -->
```typescript
import { seqTable } from '@nanalogue/node';

const tsv = await seqTable({
  bamPath: 'tests/data/examples/example_pynanalogue_1.bam',
  region: 'contig_00000:0-10'
});
const lines = tsv.trimEnd().split('\n');
const sorted = [lines[0], ...lines.slice(1).sort()].join('\n');
console.log(sorted);
```
<!-- TEST CODE: END seqTable -->

The output is a TSV with three columns: `read_id`, `sequence`, and `qualities`.
Sequence uses: `.` for deletion, lowercase for insertion, `Z` for modification.

<!-- TEST OUTPUT: START seqTable -->
```text
read_id	sequence	qualities
0.dc09ae0d-6b6e-4cb2-b092-078f251a778e	AZGTAZGTAZ	20.20.20.20.20.20.20.20.20.20
1.cb098e1d-26d6-4e14-b979-b089e492c068	ACGTACGTAC	30.30.30.30.30.30.30.30.30.30
```
<!-- TEST OUTPUT: END seqTable -->

### simulateModBam

Generate synthetic BAM files with defined modification patterns (useful for testing).

<!-- TEST CODE: NOOUTPUT simulateModBam -->
```typescript
import { simulateModBam } from '@nanalogue/node';

const config = JSON.stringify({
  contigs: { number: 2, len_range: [1000, 2000] },
  reads: [{
    number: 100,
    len_range: [0.5, 0.9],
    mods: [{
      base: 'C',
      is_strand_plus: true,
      mod_code: 'm',
      win: [5, 3],
      mod_range: [[0.3, 0.7], [0.1, 0.5]]
    }]
  }]
});

await simulateModBam({
  jsonConfig: config,
  bamPath: 'output.bam',
  fastaPath: 'output.fasta'
});
```
<!-- TEST CODE: END simulateModBam -->

## TypeScript Support

Full TypeScript definitions are included. The package uses discriminated unions
to enforce constraints at compile time (e.g., `fullRegion` can only be set when
`region` is specified).

```typescript
import type { ReadOptions, BamModRecord, ReadInfoRecord } from '@nanalogue/node';
```

## Pagination

All query functions (`readInfo`, `bamMods`, `windowReads`, `seqTable`) support pagination
via `limit` and `offset` parameters. Pagination is applied after filtering, using lazy
`.skip(offset).take(limit)` on the BAM record iterator, so only the requested records
are processed.

<!-- TEST CODE: NOOUTPUT pagination_readInfo -->
```typescript
import { readInfo } from '@nanalogue/node';

// Get the first 10 reads
const page1 = await readInfo({
  bamPath: 'tests/data/examples/example_1.bam',
  limit: 10,
  offset: 0
});

// Get the next 10 reads
const page2 = await readInfo({
  bamPath: 'tests/data/examples/example_1.bam',
  limit: 10,
  offset: 10
});
```
<!-- TEST CODE: END pagination_readInfo -->

When combining pagination with `sampleFraction`, use `sampleSeed` to ensure
deterministic sampling across pages. Without a seed, each call may sample
different reads, making pagination unstable.

<!-- TEST CODE: NOOUTPUT pagination_bamMods -->
```typescript
import { bamMods } from '@nanalogue/node';

// Deterministic 50% subsample, paginated
const page1 = await bamMods({
  bamPath: 'tests/data/examples/example_1.bam',
  sampleFraction: 0.5,
  sampleSeed: 42,
  limit: 10,
  offset: 0
});

// Same seed ensures consistent ordering across pages
const page2 = await bamMods({
  bamPath: 'tests/data/examples/example_1.bam',
  sampleFraction: 0.5,
  sampleSeed: 42,
  limit: 10,
  offset: 10
});
```
<!-- TEST CODE: END pagination_bamMods -->

## Filtering Options

All read functions support extensive filtering:

| Option | Description |
|--------|-------------|
| `treatAsUrl` | Treat bamPath as URL instead of file path |
| `region` | Genomic region filter (e.g., "chr1:1000-2000") |
| `fullRegion` | Only include reads fully spanning the region |
| `readFilter` | Filter by alignment type (e.g., "primary_forward,primary_reverse") |
| `readIdSet` | Filter to specific read IDs |
| `minSeqLen` | Minimum sequence length |
| `minAlignLen` | Minimum alignment length |
| `mapqFilter` | Minimum mapping quality |
| `excludeMapqUnavail` | Exclude reads without mapping quality |
| `sampleFraction` | Subsample reads (0.0 to 1.0) |
| `sampleSeed` | Seed for deterministic sampling (for reproducible subsampling) |
| `threads` | Number of threads for BAM reading |
| `tag` | Filter by modification type |
| `modStrand` | Filter by modification strand ("bc" or "bc_comp") |
| `minModQual` | Minimum modification quality threshold |
| `rejectModQualNonInclusive` | Reject mods where low < prob < high |
| `trimReadEndsMod` | Trim modification info from read ends |
| `baseQualFilterMod` | Base quality filter for modifications |
| `modRegion` | Genomic region for modification filtering |
| `limit` | Maximum number of records to return (must be > 0) |
| `offset` | Number of records to skip before returning results (default: 0) |

## Further Documentation

- [Nanalogue Core Documentation](https://docs.rs/nanalogue)
- [Nanalogue Cookbook](https://www.nanalogue.com)
- [pynanalogue](https://github.com/DNAReplicationLab/pynanalogue) - Python bindings

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Versioning

We use [Semantic Versioning](https://semver.org/).

**Current Status: Pre-1.0 (0.x.y)**

While in 0.x.y versions:
- The API may change without notice
- Breaking changes can occur in minor version updates

After 1.0.0, we will guarantee backwards compatibility in minor/patch releases.

## README Example Testing

Code examples in this README are automatically tested by `tests/readme-examples.test.ts`.
HTML comment markers identify which code blocks to test and what output to expect.

The following marker types are used (shown without angle brackets to avoid parser interference;
in practice, wrap each marker in standard HTML comment delimiters i.e. `<` + `!--` ... `--` + `>`):

- `!-- TEST CODE: START my_example --` / `!-- TEST CODE: END my_example --` wraps a testable code block.
- `!-- TEST OUTPUT: START my_example --` / `!-- TEST OUTPUT: END my_example --` wraps the expected stdout.
- `!-- TEST CODE: NOOUTPUT my_example --` / `!-- TEST CODE: END my_example --` wraps code that is executed
  but has no expected output (e.g. it just verifies the code runs without error).

The marker name (e.g. `my_example` above) is a plain identifier that links a code block
to its output block. Each tested code block must include `console.log()` calls that produce
exactly the text shown in the corresponding output block.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

This software was developed at the Earlham Institute in the UK.
This work was supported by the Biotechnology and Biological Sciences
Research Council (BBSRC), part of UK Research and Innovation,
through the Core Capability Grant BB/CCG2220/1 at the Earlham Institute
and the Earlham Institute Strategic Programme Grant Cellular Genomics
BBX011070/1 and its constituent work packages BBS/E/ER/230001B
(CellGen WP2 Consequences of somatic genome variation on traits).
The work was also supported by the following response-mode project grants:
BB/W006014/1 (Single molecule detection of DNA replication errors) and
BB/Y00549X/1 (Single molecule analysis of Human DNA replication).
This research was supported in part by NBI Research Computing
through use of the High-Performance Computing system and Isilon storage.
