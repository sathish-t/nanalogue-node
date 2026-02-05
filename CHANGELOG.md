# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-02-05

### Fixed
- Main package no longer bundles .node binaries (53MB → minimal JS/TS only)

### Changed
- README examples show concrete outputs; publish workflow runs tests before publishing

### Added
- `tests/readme-examples.test.ts` to verify README code examples

## [0.1.1] - 2026-02-04

### Fixed
- Invalid `tag` values now error instead of being silently ignored
- `seqTable` validates `fullRegion` and `modRegion` constraints (errors if explicitly set to incompatible values)
- `peek` parsing hardened with strand character validation (expects '+' or '-')
- Musl builds use pypa musllinux containers with proper toolchain (perl, gcc linker, zlib/bzip2/xz static libs)
- Glibc builds now use manylinux_2_28 containers (glibc 2.28+) for broader Linux compatibility

### Changed
- `winOp` type narrowed to `'density' | 'grad_density'` union
- `MappedReadInfo.alignment_type` type narrowed to proper union of valid alignment types
- `rejectModQualNonInclusive` documentation clarified: errors if low > high, no rejection if range <= 1
- CI test matrix updated: Node 22 across all platforms, Node 24 on Linux (x64 + ARM)
- Publish workflow uses Docker containers for all Linux builds (glibc and musl)
- Bump vitest from 2.1.9 to 4.0.18
- Bump @biomejs/biome from 2.3.13 to 2.3.14
- Bump @napi-rs/cli from 2.18.4 to 3.5.1

### Added
- Tests for invalid tag validation across all functions
- Tests for `fullRegion` without `region` error handling
- Tests for `seqTable` constraint validation

### Infrastructure
- Bump actions/checkout from v4 to v6
- Bump actions/setup-node from v4 to v6
- Bump actions/upload-artifact from v4 to v6
- Bump actions/download-artifact from v4 to v7

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
- GitHub Actions CI/CD:
  - CI workflow with lint, typecheck, and cross-platform test matrix (Ubuntu/macOS, x64/ARM64, Node 20/22)
  - Nightly CI to catch upstream breakage
  - Automated npm publishing via OIDC trusted publishing on GitHub Release
  - Dependabot for cargo, npm, and github-actions dependency updates
