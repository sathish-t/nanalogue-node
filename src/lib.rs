//! Node.js bindings for Nanalogue (NAPI-RS)
//!
//! This crate provides TypeScript/JavaScript bindings for the nanalogue
//! library, enabling single-molecule BAM/Mod-BAM analysis in Node.js
//! and Electron applications.

use nanalogue_core::{
    BamPreFilt as _, BamRcRecords, F32Bw0and1, GenomicRegion, InputBam, InputBamBuilder, InputMods,
    InputModsBuilder, InputWindowingBuilder, OptionalTag, OrdPair, PathOrURLOrStdin,
    SeqDisplayOptions, SimulationConfig, ThresholdState, analysis, nanalogue_indexed_bam_reader,
    nanalogue_indexed_bam_reader_from_url, peek as rust_peek, read_info as rust_read_info,
    reads_table as rust_reads_table, simulate_mod_bam as rust_simulate_mod_bam,
    window_reads as rust_window_reads,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rust_htslib::bam::FetchDefinition;
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::str::FromStr as _;
use url::Url;

/// Result from `peek()` containing BAM file metadata.
#[napi(object)]
#[non_exhaustive]
#[derive(Debug, Default)]
pub struct PeekResult {
    /// Map of contig names to their lengths.
    pub contigs: HashMap<String, i64>,
    /// List of detected modifications, each as `[base, strand, mod_code]`.
    pub modifications: Vec<Vec<String>>,
}

/// Options for the `peek()` function.
#[napi(object)]
#[non_exhaustive]
#[derive(Debug, Default)]
pub struct PeekOptions {
    /// Path to the BAM file (local path or URL).
    pub bam_path: String,
    /// If true, treat `bam_path` as a URL. Otherwise treat as file path.
    pub treat_as_url: Option<bool>,
}

/// Peek at BAM file metadata - returns contigs and detected modifications.
///
/// Reads the BAM header and examines the first few records to determine
/// the contigs present in the file and any DNA/RNA modifications detected.
///
/// # Errors
/// Returns an error if the BAM file cannot be read, parsed, or if the
/// path/URL is invalid.
#[napi]
pub async fn peek(options: PeekOptions) -> Result<PeekResult> {
    tokio::task::spawn_blocking(move || peek_sync(&options))
        .await
        .map_err(|e| Error::from_reason(format!("Task join error: {e}")))?
}

/// Synchronous implementation of peek that runs on a blocking thread.
fn peek_sync(options: &PeekOptions) -> Result<PeekResult> {
    // Handle treat_as_url: if true, parse as URL; otherwise treat as file path
    let path_or_url: PathOrURLOrStdin = if options.treat_as_url == Some(true) {
        let url = Url::parse(&options.bam_path)
            .map_err(|e| Error::from_reason(format!("Invalid URL: {e}")))?;
        PathOrURLOrStdin::URL(url)
    } else {
        PathOrURLOrStdin::Path(PathBuf::from(&options.bam_path))
    };

    let mut input_bam = InputBamBuilder::default()
        .bam_path(path_or_url)
        .build()
        .map_err(|e| Error::from_reason(format!("Failed to build InputBam: {e}")))?;

    let mut reader = load_bam(&input_bam)?;

    let bam_rc_records = BamRcRecords::new(
        &mut reader,
        &mut input_bam,
        &mut InputMods::<OptionalTag>::default(),
    )
    .map_err(|e| Error::from_reason(format!("Failed to read BAM records: {e}")))?;

    // Run peek and capture output
    let mut buffer = Vec::new();
    rust_peek::run(
        &mut buffer,
        &bam_rc_records.header,
        bam_rc_records.rc_records.take(100),
    )
    .map_err(|e| Error::from_reason(format!("Peek failed: {e}")))?;

    // Parse output
    let output_str =
        String::from_utf8(buffer).map_err(|e| Error::from_reason(format!("Invalid UTF-8: {e}")))?;

    let mut contigs = HashMap::new();
    let mut modifications = Vec::new();
    let mut in_contigs_section = true;

    for line in output_str.lines() {
        let trimmed = line.trim();
        match trimmed {
            "" | "None" => {}
            "contigs_and_lengths:" => in_contigs_section = true,
            "modifications:" => in_contigs_section = false,
            _ if in_contigs_section => {
                // Parse "contig_name\tlength"
                let parts: Vec<&str> = trimmed.split('\t').collect();
                let contig_name = parts
                    .first()
                    .ok_or_else(|| Error::from_reason("Missing contig name in peek output"))?;
                let length: i64 = parts
                    .get(1)
                    .ok_or_else(|| Error::from_reason("Missing contig length in peek output"))?
                    .parse()
                    .map_err(|e| {
                        Error::from_reason(format!("Failed to parse contig length: {e}"))
                    })?;
                let _: Option<i64> = contigs.insert((*contig_name).to_string(), length);
            }
            _ => {
                // Parse modification string like "G-7200" or "T+T"
                // Format: base + strand + mod_code (strand is always '+' or '-' at position 1)
                let mut chars = trimmed.chars();
                let base = chars
                    .next()
                    .ok_or_else(|| Error::from_reason("Empty modification string"))?;
                let strand = chars
                    .next()
                    .ok_or_else(|| Error::from_reason("Modification string missing strand"))?;
                let mod_code: String = chars.collect();
                if mod_code.is_empty() {
                    return Err(Error::from_reason("Modification string missing mod code"));
                }
                modifications.push(vec![base.to_string(), strand.to_string(), mod_code]);
            }
        }
    }

    Ok(PeekResult {
        contigs,
        modifications,
    })
}

/// Options for read operations including BAM filtering and modification parameters.
#[napi(object)]
#[non_exhaustive]
#[derive(Debug, Default, Clone)]
pub struct ReadOptions {
    /// Path to the BAM file (local path or URL).
    pub bam_path: String,
    /// If true, treat `bam_path` as a URL. Otherwise treat as file path.
    pub treat_as_url: Option<bool>,
    /// Minimum sequence length filter.
    pub min_seq_len: Option<u32>,
    /// Minimum alignment length filter.
    pub min_align_len: Option<i32>,
    /// Filter to a set of read IDs.
    pub read_id_set: Option<Vec<String>>,
    /// Number of threads for BAM reading.
    pub threads: Option<u8>,
    /// Include zero-length sequences (may cause crashes).
    pub include_zero_len: Option<bool>,
    /// Comma-separated read filter (e.g., `primary_forward,primary_reverse`).
    pub read_filter: Option<String>,
    /// Subsample fraction (0.0 to 1.0).
    pub sample_fraction: Option<f64>,
    /// Minimum mapping quality filter.
    pub mapq_filter: Option<u8>,
    /// Exclude reads with unavailable mapping quality.
    pub exclude_mapq_unavail: Option<bool>,
    /// Genomic region filter (e.g., "chr1:1000-2000").
    pub region: Option<String>,
    /// Only include reads fully spanning the region.
    pub full_region: Option<bool>,
    /// Filter to specific modification tag.
    pub tag: Option<String>,
    /// Filter by modification strand (`bc` or `bc_comp`).
    pub mod_strand: Option<String>,
    /// Minimum modification quality threshold.
    pub min_mod_qual: Option<u8>,
    /// Reject modification calls where low < probability < high.
    /// Array of [low, high] where both are 0-255.
    pub reject_mod_qual_non_inclusive: Option<Vec<u8>>,
    /// Trim modification info from read ends (bp).
    pub trim_read_ends_mod: Option<u32>,
    /// Base quality filter for modifications.
    pub base_qual_filter_mod: Option<u8>,
    /// Genomic region for modification filtering.
    pub mod_region: Option<String>,
}

/// Returns read information as JSON array.
///
/// Produces JSON with per-read information including alignment length,
/// sequence length, read ID, modification counts, etc.
///
/// # Errors
/// Returns an error if BAM reading fails, input options are invalid,
/// or JSON parsing fails.
#[napi]
pub async fn read_info(options: ReadOptions) -> Result<serde_json::Value> {
    tokio::task::spawn_blocking(move || read_info_sync(&options))
        .await
        .map_err(|e| Error::from_reason(format!("Task join error: {e}")))?
}

/// Synchronous implementation of `read_info` that runs on a blocking thread.
fn read_info_sync(options: &ReadOptions) -> Result<serde_json::Value> {
    let (mut bam, mut mods) = build_input_options(options)?;

    let mut reader = load_bam(&bam)?;
    let bam_rc_records = BamRcRecords::new(&mut reader, &mut bam, &mut mods)
        .map_err(|e| Error::from_reason(format!("Failed to read BAM records: {e}")))?;

    let mut buffer = Vec::new();
    rust_read_info::run(
        &mut buffer,
        bam_rc_records
            .rc_records
            .filter(|r| r.as_ref().map_or(true, |v| v.pre_filt(&bam))),
        mods,
        None,
    )
    .map_err(|e| Error::from_reason(format!("read_info failed: {e}")))?;

    let json_str =
        String::from_utf8(buffer).map_err(|e| Error::from_reason(format!("Invalid UTF-8: {e}")))?;
    serde_json::from_str(&json_str)
        .map_err(|e| Error::from_reason(format!("Failed to parse JSON: {e}")))
}

impl TryFrom<&ReadOptions> for InputBam {
    type Error = Error;

    fn try_from(options: &ReadOptions) -> Result<Self> {
        // Guard against include_zero_len=true which can cause crashes
        if options.include_zero_len == Some(true) {
            return Err(Error::from_reason(
                "include_zero_len=True is not yet supported due to potential crashes in the underlying library",
            ));
        }

        // Validate threads > 0
        if let Some(v) = options.threads
            && v == 0
        {
            return Err(Error::from_reason("threads must be a positive integer"));
        }

        // Validate sample_fraction in [0, 1]
        if let Some(v) = options.sample_fraction
            && !(0.0..=1.0).contains(&v)
        {
            return Err(Error::from_reason(
                "sample_fraction must be between 0 and 1",
            ));
        }

        // Handle treat_as_url: if true, parse as URL; otherwise treat as file path
        let path_or_url: PathOrURLOrStdin = if options.treat_as_url == Some(true) {
            let url = Url::parse(&options.bam_path)
                .map_err(|e| Error::from_reason(format!("Invalid URL: {e}")))?;
            PathOrURLOrStdin::URL(url)
        } else {
            PathOrURLOrStdin::Path(PathBuf::from(&options.bam_path))
        };

        let mut builder = InputBamBuilder::default();
        let _: &mut InputBamBuilder = builder.bam_path(path_or_url);

        if let Some(v) = options.min_seq_len {
            let _: &mut InputBamBuilder = builder.min_seq_len(u64::from(v));
        }
        if let Some(v) = options.min_align_len {
            let _: &mut InputBamBuilder = builder.min_align_len(i64::from(v));
        }
        if let Some(v) = options.read_id_set.as_ref() {
            let set: HashSet<String> = v.iter().cloned().collect();
            let _: &mut InputBamBuilder = builder.read_id_set(set);
        }
        if let Some(v) = options.threads
            && let Some(nz) = NonZeroU32::new(u32::from(v))
        {
            let _: &mut InputBamBuilder = builder.threads(nz);
        }
        if let Some(v) = options.include_zero_len {
            let _: &mut InputBamBuilder = builder.include_zero_len(v);
        }
        if let Some(v) = options.read_filter.as_ref() {
            let _: &mut InputBamBuilder = builder.read_filter(v.clone());
        }
        if let Some(v) = options.sample_fraction {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "f64 to f32 truncation is acceptable for sample fraction"
            )]
            if let Ok(f) = F32Bw0and1::new(v as f32) {
                let _: &mut InputBamBuilder = builder.sample_fraction(f);
            }
        }
        if let Some(v) = options.mapq_filter {
            let _: &mut InputBamBuilder = builder.mapq_filter(v);
        }
        if let Some(v) = options.exclude_mapq_unavail {
            let _: &mut InputBamBuilder = builder.exclude_mapq_unavail(v);
        }
        if let Some(v) = options.region.as_ref() {
            let _: &mut InputBamBuilder = builder.region(v.clone());
        }
        if let Some(v) = options.full_region {
            let _: &mut InputBamBuilder = builder.full_region(v);
        }

        builder
            .build()
            .map_err(|e| Error::from_reason(format!("Failed to build InputBam: {e}")))
    }
}

impl TryFrom<&ReadOptions> for InputMods<OptionalTag> {
    type Error = Error;

    fn try_from(options: &ReadOptions) -> Result<Self> {
        let mut builder = InputModsBuilder::<OptionalTag>::default();

        if let Some(v) = options.mod_strand.as_ref() {
            let _: &mut InputModsBuilder<OptionalTag> = builder.mod_strand(v.clone());
        }

        // Handle mod_prob_filter: combines min_mod_qual and reject_mod_qual_non_inclusive
        let min_mod_qual = options.min_mod_qual.unwrap_or(0);
        let threshold_state = match options.reject_mod_qual_non_inclusive.as_deref() {
            Some(&[low, high]) => {
                match high.checked_sub(low) {
                    None => {
                        // high < low is invalid
                        return Err(Error::from_reason(
                            "for rejectModQualNonInclusive, please set low < high",
                        ));
                    }
                    Some(0 | 1) => {
                        // If difference is 0 or 1, no meaningful rejection range, just use GtEq
                        ThresholdState::GtEq(min_mod_qual)
                    }
                    _ => {
                        // Create Both variant with rejection range (low+1, high-1) to make it non-inclusive
                        #[expect(
                            clippy::arithmetic_side_effects,
                            reason = "we check low < high - 1 so no chance of overflow"
                        )]
                        let ord_pair =
                            OrdPair::<u8>::try_from((low + 1, high - 1)).map_err(|e| {
                                Error::from_reason(format!(
                                    "Invalid rejectModQualNonInclusive range: {e}"
                                ))
                            })?;
                        ThresholdState::Both((min_mod_qual, ord_pair))
                    }
                }
            }
            Some(_) => {
                return Err(Error::from_reason(
                    "rejectModQualNonInclusive must be an array of exactly 2 numbers [low, high]",
                ));
            }
            None => ThresholdState::GtEq(min_mod_qual),
        };
        let _: &mut InputModsBuilder<OptionalTag> = builder.mod_prob_filter(threshold_state);

        if let Some(v) = options.trim_read_ends_mod {
            let _: &mut InputModsBuilder<OptionalTag> = builder.trim_read_ends_mod(v as usize);
        }
        if let Some(v) = options.base_qual_filter_mod {
            let _: &mut InputModsBuilder<OptionalTag> = builder.base_qual_filter_mod(v);
        }
        if let Some(v) = options.tag.as_ref()
            && let Ok(tag) = OptionalTag::from_str(v)
        {
            let _: &mut InputModsBuilder<OptionalTag> = builder.tag(tag);
        }
        if let Some(v) = options.mod_region.as_ref() {
            let _: &mut InputModsBuilder<OptionalTag> = builder.mod_region(v.clone());
        }

        builder
            .build()
            .map_err(|e| Error::from_reason(format!("Failed to build InputMods: {e}")))
    }
}

/// Builds `InputBam` and `InputMods` from the given options.
fn build_input_options(options: &ReadOptions) -> Result<(InputBam, InputMods<OptionalTag>)> {
    let bam = InputBam::try_from(options)?;
    let mods = InputMods::try_from(options)?;
    Ok((bam, mods))
}

/// Loads BAM data from a local file or URL; fetches only the region if specified.
#[expect(
    clippy::pattern_type_mismatch,
    reason = "matching on &Option<T> requires either ref patterns or & patterns; this is idiomatic"
)]
fn load_bam(bam: &InputBam) -> Result<rust_htslib::bam::IndexedReader> {
    match (&bam.region, &bam.bam_path) {
        (Some(v), PathOrURLOrStdin::Path(w)) => {
            let fetch_def: FetchDefinition = v
                .try_into()
                .map_err(|e: nanalogue_core::Error| Error::from_reason(e.to_string()))?;
            nanalogue_indexed_bam_reader(w, fetch_def)
                .map_err(|e| Error::from_reason(format!("Failed to open BAM: {e}")))
        }
        (None, PathOrURLOrStdin::Path(w)) => nanalogue_indexed_bam_reader(w, FetchDefinition::All)
            .map_err(|e| Error::from_reason(format!("Failed to open BAM: {e}"))),
        (Some(v), PathOrURLOrStdin::URL(w)) => {
            let fetch_def: FetchDefinition = v
                .try_into()
                .map_err(|e: nanalogue_core::Error| Error::from_reason(e.to_string()))?;
            nanalogue_indexed_bam_reader_from_url(w, fetch_def)
                .map_err(|e| Error::from_reason(format!("Failed to open BAM: {e}")))
        }
        (None, PathOrURLOrStdin::URL(w)) => {
            nanalogue_indexed_bam_reader_from_url(w, FetchDefinition::All)
                .map_err(|e| Error::from_reason(format!("Failed to open BAM: {e}")))
        }
        _ => Err(Error::from_reason("Stdin not supported")),
    }
}

/// Options for BAM simulation.
#[napi(object)]
#[non_exhaustive]
#[derive(Debug, Default)]
pub struct SimulateOptions {
    /// JSON configuration string for the simulation.
    pub json_config: String,
    /// Output path for the generated BAM file.
    pub bam_path: String,
    /// Output path for the generated FASTA reference file.
    pub fasta_path: String,
}

/// Simulates a BAM file with modifications based on JSON configuration.
///
/// Creates both a BAM file and a corresponding FASTA reference file.
///
/// # Errors
/// Returns an error if JSON parsing fails or file I/O operations fail.
#[napi]
pub async fn simulate_mod_bam(options: SimulateOptions) -> Result<()> {
    tokio::task::spawn_blocking(move || simulate_mod_bam_sync(&options))
        .await
        .map_err(|e| Error::from_reason(format!("Task join error: {e}")))?
}

/// Synchronous implementation of `simulate_mod_bam`.
fn simulate_mod_bam_sync(options: &SimulateOptions) -> Result<()> {
    // Parse JSON config
    let config: SimulationConfig = serde_json::from_str(&options.json_config)
        .map_err(|e| Error::from_reason(format!("Invalid JSON config: {e}")))?;

    // Run simulation
    rust_simulate_mod_bam::run(config, &options.bam_path, &options.fasta_path)
        .map_err(|e| Error::from_reason(format!("Simulation failed: {e}")))?;

    Ok(())
}

/// Returns detailed modification data for reads as JSON.
///
/// This is the non-polars alternative to `polars_bam_mods`.
///
/// # Errors
/// Returns an error if BAM reading fails or JSON parsing fails.
#[napi]
pub async fn bam_mods(options: ReadOptions) -> Result<serde_json::Value> {
    tokio::task::spawn_blocking(move || bam_mods_sync(&options))
        .await
        .map_err(|e| Error::from_reason(format!("Task join error: {e}")))?
}

/// Synchronous implementation of `bam_mods`.
fn bam_mods_sync(options: &ReadOptions) -> Result<serde_json::Value> {
    let (mut bam, mut mods) = build_input_options(options)?;

    let mut reader = load_bam(&bam)?;
    let bam_rc_records = BamRcRecords::new(&mut reader, &mut bam, &mut mods)
        .map_err(|e| Error::from_reason(format!("Failed to read BAM records: {e}")))?;

    let mut buffer = Vec::new();
    // Use detailed mode (Some(false) = compact JSON, Some(true) = pretty JSON)
    rust_read_info::run(
        &mut buffer,
        bam_rc_records
            .rc_records
            .filter(|r| r.as_ref().map_or(true, |v| v.pre_filt(&bam))),
        mods,
        Some(false), // detailed=true, pretty=false
    )
    .map_err(|e| Error::from_reason(format!("bam_mods failed: {e}")))?;

    let json_str =
        String::from_utf8(buffer).map_err(|e| Error::from_reason(format!("Invalid UTF-8: {e}")))?;
    serde_json::from_str(&json_str)
        .map_err(|e| Error::from_reason(format!("Failed to parse JSON: {e}")))
}

/// Options for windowed modification analysis.
#[napi(object)]
#[non_exhaustive]
#[derive(Debug, Default)]
pub struct WindowOptions {
    /// Path to the BAM file (local path or URL).
    pub bam_path: String,
    /// If true, treat `bam_path` as a URL. Otherwise treat as file path.
    pub treat_as_url: Option<bool>,
    /// Window size in number of bases.
    pub win: i32,
    /// Step size for sliding the window.
    pub step: i32,
    /// Type of windowing operation: `density` or `grad_density`.
    pub win_op: Option<String>,
    // BAM filtering options (duplicated from ReadOptions due to NAPI-RS limitation)
    /// Minimum sequence length filter.
    pub min_seq_len: Option<u32>,
    /// Minimum alignment length filter.
    pub min_align_len: Option<i32>,
    /// Filter to a set of read IDs.
    pub read_id_set: Option<Vec<String>>,
    /// Number of threads for BAM reading.
    pub threads: Option<u8>,
    /// Include zero-length sequences (may cause crashes).
    pub include_zero_len: Option<bool>,
    /// Comma-separated read filter.
    pub read_filter: Option<String>,
    /// Subsample fraction (0.0 to 1.0).
    pub sample_fraction: Option<f64>,
    /// Minimum mapping quality filter.
    pub mapq_filter: Option<u8>,
    /// Exclude reads with unavailable mapping quality.
    pub exclude_mapq_unavail: Option<bool>,
    /// Genomic region filter.
    pub region: Option<String>,
    /// Only include reads fully spanning the region.
    pub full_region: Option<bool>,
    // Mod options
    /// Filter to specific modification tag.
    pub tag: Option<String>,
    /// Filter by modification strand.
    pub mod_strand: Option<String>,
    /// Minimum modification quality threshold.
    pub min_mod_qual: Option<u8>,
    /// Reject modification calls where low < probability < high.
    /// Array of [low, high] where both are 0-255.
    pub reject_mod_qual_non_inclusive: Option<Vec<u8>>,
    /// Trim modification info from read ends (bp).
    pub trim_read_ends_mod: Option<u32>,
    /// Base quality filter for modifications.
    pub base_qual_filter_mod: Option<u8>,
    /// Genomic region for modification filtering.
    pub mod_region: Option<String>,
}

impl From<&WindowOptions> for ReadOptions {
    fn from(opts: &WindowOptions) -> Self {
        Self {
            bam_path: opts.bam_path.clone(),
            treat_as_url: opts.treat_as_url,
            min_seq_len: opts.min_seq_len,
            min_align_len: opts.min_align_len,
            read_id_set: opts.read_id_set.clone(),
            threads: opts.threads,
            include_zero_len: opts.include_zero_len,
            read_filter: opts.read_filter.clone(),
            sample_fraction: opts.sample_fraction,
            mapq_filter: opts.mapq_filter,
            exclude_mapq_unavail: opts.exclude_mapq_unavail,
            region: opts.region.clone(),
            full_region: opts.full_region,
            tag: opts.tag.clone(),
            mod_strand: opts.mod_strand.clone(),
            min_mod_qual: opts.min_mod_qual,
            reject_mod_qual_non_inclusive: opts.reject_mod_qual_non_inclusive.clone(),
            trim_read_ends_mod: opts.trim_read_ends_mod,
            base_qual_filter_mod: opts.base_qual_filter_mod,
            mod_region: opts.mod_region.clone(),
        }
    }
}

/// Windows modification data along reads and returns TSV as string.
///
/// # Errors
/// Returns an error if window/step size is invalid, BAM reading fails,
/// or the windowing operation fails.
#[napi]
pub async fn window_reads(options: WindowOptions) -> Result<String> {
    tokio::task::spawn_blocking(move || window_reads_sync(&options))
        .await
        .map_err(|e| Error::from_reason(format!("Task join error: {e}")))?
}

/// Synchronous implementation of `window_reads`.
fn window_reads_sync(options: &WindowOptions) -> Result<String> {
    let read_opts: ReadOptions = options.into();
    let (mut bam, mut mods) = build_input_options(&read_opts)?;

    // Validate and build windowing options
    if options.win <= 0 {
        return Err(Error::from_reason("Window size must be > 0"));
    }
    if options.step <= 0 {
        return Err(Error::from_reason("Step size must be > 0"));
    }
    #[expect(clippy::cast_sign_loss, reason = "validated positive above")]
    let win = options.win as usize;
    #[expect(clippy::cast_sign_loss, reason = "validated positive above")]
    let step = options.step as usize;

    let window_options = InputWindowingBuilder::default()
        .win(win)
        .step(step)
        .build()
        .map_err(|e| Error::from_reason(format!("Failed to build windowing options: {e}")))?;

    let mut reader = load_bam(&bam)?;
    let bam_rc_records = BamRcRecords::new(&mut reader, &mut bam, &mut mods)
        .map_err(|e| Error::from_reason(format!("Failed to read BAM records: {e}")))?;

    let mut buffer = Vec::new();

    let win_op = options.win_op.as_deref().unwrap_or("density");
    match win_op {
        "density" => rust_window_reads::run(
            &mut buffer,
            bam_rc_records
                .rc_records
                .filter(|r| r.as_ref().map_or(true, |v| v.pre_filt(&bam))),
            window_options,
            &mods,
            |x| analysis::threshold_and_mean(x).map(Into::into),
        ),
        "grad_density" => rust_window_reads::run(
            &mut buffer,
            bam_rc_records
                .rc_records
                .filter(|r| r.as_ref().map_or(true, |v| v.pre_filt(&bam))),
            window_options,
            &mods,
            analysis::threshold_and_gradient,
        ),
        _ => {
            return Err(Error::from_reason(
                "win_op must be set to 'density' or 'grad_density'",
            ));
        }
    }
    .map_err(|e| Error::from_reason(format!("window_reads failed: {e}")))?;

    String::from_utf8(buffer).map_err(|e| Error::from_reason(format!("Invalid UTF-8: {e}")))
}

/// Returns sequence table with read info as TSV string.
///
/// Requires the `region` parameter to be set.
///
/// # Errors
/// Returns an error if region is missing, BAM reading fails, or
/// the table generation fails.
#[napi]
pub async fn seq_table(options: ReadOptions) -> Result<String> {
    tokio::task::spawn_blocking(move || seq_table_sync(&options))
        .await
        .map_err(|e| Error::from_reason(format!("Task join error: {e}")))?
}

/// Synchronous implementation of `seq_table`.
fn seq_table_sync(options: &ReadOptions) -> Result<String> {
    // Region is required for seq_table
    let region_str = options.region.as_ref().ok_or_else(|| {
        Error::from_reason("region parameter is required for seq_table (cannot be empty)")
    })?;

    if region_str.is_empty() {
        return Err(Error::from_reason(
            "region parameter is required for seq_table (cannot be empty)",
        ));
    }

    // Create modified options with pynanalogue-compatible defaults:
    // - full_region hardcoded to true
    // - mod_region set to same as region
    let mut modified_options = options.clone();
    modified_options.full_region = Some(true);
    modified_options.mod_region = Some(region_str.clone());

    let (mut bam, mut mods) = build_input_options(&modified_options)?;

    let mut reader = load_bam(&bam)?;
    let bam_rc_records = BamRcRecords::new(&mut reader, &mut bam, &mut mods)
        .map_err(|e| Error::from_reason(format!("Failed to read BAM records: {e}")))?;

    // Parse region to GenomicRegion then convert to Bed3 for SeqDisplayOptions
    let genomic_region = GenomicRegion::from_str(region_str)
        .map_err(|e| Error::from_reason(format!("Invalid region: {e}")))?;
    let region_bed3 = genomic_region
        .try_to_bed3(&bam_rc_records.header)
        .map_err(|e| Error::from_reason(format!("Failed to convert region to bed3: {e}")))?;

    // Build sequence display options - use Region variant for proper clipping and Z/z markers
    let seq_display = SeqDisplayOptions::Region {
        show_base_qual: true,
        show_ins_lowercase: true,
        region: region_bed3,
        show_mod_z: true,
    };

    let mut buffer = Vec::new();

    rust_reads_table::run(
        &mut buffer,
        bam_rc_records
            .rc_records
            .filter(|r| r.as_ref().map_or(true, |v| v.pre_filt(&bam))),
        Some(mods),
        seq_display,
        "",
    )
    .map_err(|e| Error::from_reason(format!("seq_table failed: {e}")))?;

    let full_tsv =
        String::from_utf8(buffer).map_err(|e| Error::from_reason(format!("Invalid UTF-8: {e}")))?;

    // Filter TSV to only include read_id, sequence, qualities columns (pynanalogue compatibility)
    filter_seq_table_columns(&full_tsv)
}

/// Record struct for deserializing `seq_table` TSV rows.
/// Only the columns we need are extracted; other columns are ignored.
#[derive(Debug, serde::Deserialize)]
struct SeqTableRecord {
    /// The read identifier.
    read_id: String,
    /// Nucleotide sequence, with `.` for deletion, lower case for insertion, and base replaced by Z (or z) for modification.
    sequence: String,
    /// The quality scores as a string.
    qualities: String,
}

/// Filters TSV output to only include `read_id`, sequence, qualities columns.
/// This matches pynanalogue's `seq_table` behavior which only returns these 3 columns.
fn filter_seq_table_columns(tsv: &str) -> Result<String> {
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(b'\t')
        .has_headers(true)
        .comment(Some(b'#'))
        .from_reader(tsv.as_bytes());

    let mut wtr = csv::WriterBuilder::new()
        .delimiter(b'\t')
        .from_writer(Vec::new());

    // Write header
    let _: () = wtr
        .write_record(["read_id", "sequence", "qualities"])
        .map_err(|e| Error::from_reason(format!("Failed to write TSV header: {e}")))?;

    // Process each record
    for result in rdr.deserialize() {
        let record: SeqTableRecord =
            result.map_err(|e| Error::from_reason(format!("Failed to parse TSV row: {e}")))?;
        let _: () = wtr
            .write_record([&record.read_id, &record.sequence, &record.qualities])
            .map_err(|e| Error::from_reason(format!("Failed to write TSV row: {e}")))?;
    }

    let inner = wtr
        .into_inner()
        .map_err(|e| Error::from_reason(format!("Failed to flush TSV writer: {e}")))?;

    String::from_utf8(inner)
        .map_err(|e| Error::from_reason(format!("Invalid UTF-8 in output: {e}")))
}
