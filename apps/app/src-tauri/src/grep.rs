use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use grep::matcher::Matcher;
use grep::regex::RegexMatcherBuilder;
use grep::searcher::{BinaryDetection, SearcherBuilder, Sink, SinkMatch};
use ignore::{WalkBuilder, WalkState};
use serde::{Deserialize, Serialize};

const TOTAL_HITS_LIMIT: usize = 500;
const PER_FILE_LIMIT: usize = 50;
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
    ".turbo",
    ".gradle",
    ".idea",
    ".vscode",
];

#[derive(Serialize, Clone)]
pub struct GrepHit {
    pub path: String,
    pub line_number: u64,
    pub line: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Deserialize, Default)]
pub struct GrepOptions {
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub regex: bool,
}

struct CollectSink<'a> {
    path: String,
    matcher: &'a grep::regex::RegexMatcher,
    hits: Arc<Mutex<Vec<GrepHit>>>,
    total: Arc<AtomicUsize>,
    file_count: usize,
}

impl<'a> Sink for CollectSink<'a> {
    type Error = std::io::Error;

    fn matched(
        &mut self,
        _searcher: &grep::searcher::Searcher,
        mat: &SinkMatch<'_>,
    ) -> Result<bool, Self::Error> {
        if self.file_count >= PER_FILE_LIMIT {
            return Ok(false);
        }
        if self.total.load(Ordering::Relaxed) >= TOTAL_HITS_LIMIT {
            return Ok(false);
        }

        let bytes = mat.bytes();
        let line = String::from_utf8_lossy(bytes).trim_end().to_string();
        let line_number = mat.line_number().unwrap_or(0);

        let (start, end) = self
            .matcher
            .find(bytes)
            .ok()
            .flatten()
            .map(|m| (m.start(), m.end()))
            .unwrap_or((0, 0));

        let truncated_line = if line.len() > 400 {
            format!("{}…", &line[..400.min(line.len())])
        } else {
            line
        };

        if let Ok(mut hits) = self.hits.lock() {
            hits.push(GrepHit {
                path: self.path.clone(),
                line_number,
                line: truncated_line,
                match_start: start,
                match_end: end,
            });
        }
        self.file_count += 1;
        self.total.fetch_add(1, Ordering::Relaxed);
        Ok(true)
    }
}

#[tauri::command]
pub fn grep_content(
    root: String,
    query: String,
    options: Option<GrepOptions>,
) -> Result<Vec<GrepHit>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }
    let opts = options.unwrap_or_default();
    let pattern = if opts.regex {
        query.to_string()
    } else {
        regex_escape(query)
    };

    let matcher = RegexMatcherBuilder::new()
        .case_smart(!opts.case_sensitive)
        .case_insensitive(!opts.case_sensitive)
        .build(&pattern)
        .map_err(|e| e.to_string())?;

    let hits: Arc<Mutex<Vec<GrepHit>>> = Arc::new(Mutex::new(Vec::with_capacity(256)));
    let total = Arc::new(AtomicUsize::new(0));

    let threads = std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4);

    WalkBuilder::new(&root)
        .hidden(false)
        .git_ignore(false)
        .ignore(false)
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            match entry.file_name().to_str() {
                Some(name) => !SKIP_DIRS.contains(&name),
                None => true,
            }
        })
        .threads(threads)
        .build_parallel()
        .run(|| {
            let matcher = matcher.clone();
            let hits = hits.clone();
            let total = total.clone();
            Box::new(move |entry| {
                if total.load(Ordering::Relaxed) >= TOTAL_HITS_LIMIT {
                    return WalkState::Quit;
                }
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => return WalkState::Continue,
                };
                let ft = match entry.file_type() {
                    Some(t) => t,
                    None => return WalkState::Continue,
                };
                if !ft.is_file() {
                    return WalkState::Continue;
                }
                let path = entry.path();
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > MAX_FILE_BYTES {
                        return WalkState::Continue;
                    }
                }

                let mut searcher = SearcherBuilder::new()
                    .binary_detection(BinaryDetection::quit(b'\x00'))
                    .line_number(true)
                    .build();

                let sink = CollectSink {
                    path: path.to_string_lossy().into_owned(),
                    matcher: &matcher,
                    hits: hits.clone(),
                    total: total.clone(),
                    file_count: 0,
                };

                let _ = searcher.search_path(&matcher, path, sink);

                WalkState::Continue
            })
        });

    let result = Arc::try_unwrap(hits)
        .ok()
        .and_then(|m| m.into_inner().ok())
        .unwrap_or_default();
    Ok(result)
}

fn regex_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if "\\.+*?()|[]{}^$".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
