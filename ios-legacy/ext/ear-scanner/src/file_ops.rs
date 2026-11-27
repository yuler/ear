//! Streaming chunk assembly for large (> 8 MiB) mirrored media files.
//!
//! `nsh`'s JS `fs/promises.writeFile` caps single writes at 8 MiB. Mirrored videos
//! larger than 8 MiB are downloaded as 4 MiB `.part` chunks under `<videoDir>/chunks/`
//! and then streamed into a single `<videoDir>/media.<ext>` file here on a background
//! thread with constant memory (64 KiB buffer), atomic rename, and chunk cleanup.

use std::{
    fs::{self, File},
    io::{BufReader, BufWriter, Read, Write},
    path::{Path, PathBuf},
};

use nsh_core::prelude::*;

const COPY_BUF_BYTES: usize = 64 * 1024;

/// Outcome of `MediaFiles.assembleChunks`.
#[derive(Debug, Clone, PartialEq, JsObject)]
pub struct AssembleResult {
    pub ok: bool,
    pub path: String,
    pub size_bytes: f64,
    pub error: Option<String>,
}

impl AssembleResult {
    fn success(path: String, size_bytes: u64) -> Self {
        Self {
            ok: true,
            path,
            size_bytes: size_bytes as f64,
            error: None,
        }
    }

    fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            path: String::new(),
            size_bytes: 0.0,
            error: Some(msg.into()),
        }
    }
}

pub(crate) fn assemble_chunks_sync(
    chunks_dir: &Path,
    chunk_count: u32,
    output_path: &Path,
) -> Result<u64, String> {
    if chunk_count == 0 {
        return Err("chunkCount must be greater than 0".into());
    }
    if !chunks_dir.is_dir() {
        return Err(format!("chunks directory does not exist: {}", chunks_dir.display()));
    }
    let Some(parent) = output_path.parent() else {
        return Err(format!("invalid output path: {}", output_path.display()));
    };
    fs::create_dir_all(parent).map_err(|e| format!("failed to create output directory: {e}"))?;

    let tmp_path = tmp_path_for(output_path);
    let write_res = (|| -> Result<u64, String> {
        let out_file = File::create(&tmp_path)
            .map_err(|e| format!("failed to create temp media file: {e}"))?;
        let mut writer = BufWriter::with_capacity(COPY_BUF_BYTES, out_file);
        let mut buf = vec![0u8; COPY_BUF_BYTES];
        let mut total_written: u64 = 0;

        for idx in 0..chunk_count {
            let part_path = chunks_dir.join(format!("{idx:04}.part"));
            let part_file = File::open(&part_path)
                .map_err(|e| format!("missing or unreadable chunk {idx:04}.part: {e}"))?;
            let mut reader = BufReader::with_capacity(COPY_BUF_BYTES, part_file);
            loop {
                let n = reader
                    .read(&mut buf)
                    .map_err(|e| format!("failed reading chunk {idx:04}.part: {e}"))?;
                if n == 0 {
                    break;
                }
                writer
                    .write_all(&buf[..n])
                    .map_err(|e| format!("failed writing assembled media: {e}"))?;
                total_written += n as u64;
            }
        }

        writer
            .flush()
            .map_err(|e| format!("failed flushing assembled media: {e}"))?;
        Ok(total_written)
    })();

    let total_written = match write_res {
        Ok(n) => n,
        Err(e) => {
            let _ = fs::remove_file(&tmp_path);
            return Err(e);
        }
    };

    if let Err(e) = fs::rename(&tmp_path, output_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("failed finalizing assembled media: {e}"));
    }

    // Best-effort cleanup of the temporary chunk directory after atomic rename succeeds.
    for idx in 0..chunk_count {
        let _ = fs::remove_file(chunks_dir.join(format!("{idx:04}.part")));
    }
    let _ = fs::remove_dir(chunks_dir);

    Ok(total_written)
}

fn tmp_path_for(output_path: &Path) -> PathBuf {
    let mut os = output_path.as_os_str().to_os_string();
    os.push(".assembling.tmp");
    PathBuf::from(os)
}

/// Native file helper module for assembling chunked media files without hitting JS memory/write caps.
#[module]
pub struct MediaFiles;

#[module]
impl MediaFiles {
    /// Streams `0000.part .. (chunkCount-1).part` from `chunksDir` into `outputPath`,
    /// atomically renames the result, and removes the temporary chunks directory.
    pub async fn assemble_chunks(
        chunks_dir: String,
        chunk_count: u32,
        output_path: String,
    ) -> AssembleResult {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let out_for_ret = output_path.clone();
        std::thread::spawn(move || {
            let res = assemble_chunks_sync(
                Path::new(&chunks_dir),
                chunk_count,
                Path::new(&output_path),
            );
            let _ = tx.send(res);
        });
        match rx.await {
            Ok(Ok(bytes)) => AssembleResult::success(out_for_ret, bytes),
            Ok(Err(e)) => AssembleResult::err(e),
            Err(_) => AssembleResult::err("chunk assembly worker terminated unexpectedly"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("ear-file-ops-{name}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn assemble_chunks_merges_in_order_and_cleans_up_parts() {
        let root = unique_temp_dir("merge");
        let chunks = root.join("chunks");
        fs::create_dir_all(&chunks).unwrap();
        fs::write(chunks.join("0000.part"), b"hello ").unwrap();
        fs::write(chunks.join("0001.part"), b"offline ").unwrap();
        fs::write(chunks.join("0002.part"), b"world!").unwrap();

        let output = root.join("media.mp4");
        let total = assemble_chunks_sync(&chunks, 3, &output).unwrap();
        assert_eq!(total, 20);
        assert_eq!(fs::read(&output).unwrap(), b"hello offline world!");
        assert!(!chunks.exists());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn assemble_chunks_errors_and_leaves_no_partial_output_when_chunk_missing() {
        let root = unique_temp_dir("missing");
        let chunks = root.join("chunks");
        fs::create_dir_all(&chunks).unwrap();
        fs::write(chunks.join("0000.part"), b"part0").unwrap();

        let output = root.join("media.mp4");
        let err = assemble_chunks_sync(&chunks, 2, &output).unwrap_err();
        assert!(err.contains("0001.part"));
        assert!(!output.exists());
        assert!(!tmp_path_for(&output).exists());

        let _ = fs::remove_dir_all(&root);
    }
}
