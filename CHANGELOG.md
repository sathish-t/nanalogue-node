# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-04

### Added
- Initial release of nanalogue-node
- Node.js bindings for Nanalogue using NAPI-RS
- Support for Node.js 22+
- Full TypeScript type definitions with discriminated unions
- Core functions:
  - `peek()` - Extract BAM file metadata (contigs and modifications)
  - `readInfo()` - Get read information with alignment details and modification counts
  - `bamMods()` - Extract detailed modification data per read
  - `windowReads()` - Compute windowed modification densities with density/gradient modes
  - `seqTable()` - Extract sequences and qualities for genomic regions
  - `simulateModBam()` - Generate synthetic BAM files for testing
- Comprehensive filtering options matching pynanalogue:
  - `treatAsUrl` - Explicit URL handling
  - `rejectModQualNonInclusive` - Reject modifications in probability range
  - Region filtering with `region`, `fullRegion`, `modRegion`
  - Read filtering with `readFilter`, `readIdSet`, `minSeqLen`, `minAlignLen`
  - Quality filtering with `mapqFilter`, `minModQual`, `baseQualFilterMod`
  - Subsampling with `sampleFraction`
  - Modification filtering with `tag`, `modStrand`, `trimReadEndsMod`
- Input validation with clear error messages for `threads` and `sampleFraction`
- Comprehensive test suite with 174 tests
