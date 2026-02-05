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

```typescript
import { peek } from '@nanalogue/node';

const result = await peek({ bamPath: 'tests/data/examples/example_1.bam' });
console.log(result);
// Output:
// {
//   contigs: { dummyI: 22, dummyII: 48, dummyIII: 76 },
//   modifications: [ [ 'G', '-', '7200' ], [ 'T', '+', 'T' ] ]
// }
```

### readInfo

Get information about reads in the BAM file.

```typescript
import { readInfo } from '@nanalogue/node';

const reads = await readInfo({ bamPath: 'tests/data/examples/example_1.bam' });
console.log(reads[0]);
// Output (first read):
// {
//   read_id: '5d10eb9a-aae1-4db8-8ec6-7ebb34d32575',
//   sequence_length: 8,
//   contig: 'dummyI',
//   reference_start: 9,
//   reference_end: 17,
//   alignment_length: 8,
//   alignment_type: 'primary_forward',
//   mod_count: 'T+T:0;(probabilities >= 0.5020, PHRED base qual >= 0)'
// }
```

### bamMods

Extract detailed modification data for each read.

```typescript
import { bamMods } from '@nanalogue/node';

const mods = await bamMods({ bamPath: 'tests/data/examples/example_1.bam' });
console.log(mods[0]);
// Output (first read):
// {
//   alignment_type: 'primary_forward',
//   alignment: { start: 9, end: 17, contig: 'dummyI', contig_id: 0 },
//   mod_table: [{
//     base: 'T',
//     is_strand_plus: true,
//     mod_code: 'T',
//     data: [[0, 9, 4], [3, 12, 7], [4, 13, 9], [7, 16, 6]]  // [seq_pos, ref_pos, prob]
//   }],
//   read_id: '5d10eb9a-aae1-4db8-8ec6-7ebb34d32575',
//   seq_len: 8
// }
```

### windowReads

Compute windowed modification densities across reads.

```typescript
import { windowReads } from '@nanalogue/node';

const tsv = await windowReads({
  bamPath: 'tests/data/examples/example_1.bam',
  win: 2,
  step: 1
});
console.log(tsv.split('\n').slice(0, 4).join('\n'));
// Output (first 3 data rows):
// #contig	ref_win_start	ref_win_end	read_id	win_val	strand	base	mod_strand	mod_type	win_start	win_end	basecall_qual
// dummyI	9	13	5d10eb9a-aae1-4db8-8ec6-7ebb34d32575	0	+	T	+	T	0	4	255
// dummyI	12	14	5d10eb9a-aae1-4db8-8ec6-7ebb34d32575	0	+	T	+	T	3	5	255
// (basecall_qual is 255 as base quality scores are unavailable in this example file)
```

Supports `winOp: 'grad_density'` for gradient mode.

### seqTable

Extract sequences and qualities for a genomic region.

```typescript
import { seqTable } from '@nanalogue/node';

const tsv = await seqTable({
  bamPath: 'tests/data/examples/example_pynanalogue_1.bam',
  region: 'contig_00000:0-10'  // region is required
});
console.log(tsv);
// Output:
// read_id	sequence	qualities
// 1...	ACGTACGTAC	30.30.30.30.30.30.30.30.30.30
// 0...	AZGTAZGTAZ	20.20.20.20.20.20.20.20.20.20
// Sequence uses: . for deletion, lowercase for insertion, Z for modification
```

### simulateModBam

Generate synthetic BAM files with defined modification patterns (useful for testing).

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

## TypeScript Support

Full TypeScript definitions are included. The package uses discriminated unions
to enforce constraints at compile time (e.g., `fullRegion` can only be set when
`region` is specified).

```typescript
import type { ReadOptions, BamModRecord, ReadInfoRecord } from '@nanalogue/node';
```

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
| `threads` | Number of threads for BAM reading |
| `tag` | Filter by modification type |
| `modStrand` | Filter by modification strand ("bc" or "bc_comp") |
| `minModQual` | Minimum modification quality threshold |
| `rejectModQualNonInclusive` | Reject mods where low < prob < high |
| `trimReadEndsMod` | Trim modification info from read ends |
| `baseQualFilterMod` | Base quality filter for modifications |
| `modRegion` | Genomic region for modification filtering |

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
