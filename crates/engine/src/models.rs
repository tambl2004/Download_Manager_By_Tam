use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const SCHEMA_VERSION: i64 = 2;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Task {
    pub id: String,
    pub url: String,
    pub name: String,
    pub folder: String,
    pub state: String,
    pub error: String,
    pub total: Option<u64>,
    pub done: u64,
    pub etag: Option<String>,
    pub ranges: Vec<(u64, u64)>,
    pub connections: u32,
    pub limit_kib: u64,
    pub created: u64,
    // v0.2 fields
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub source_host: String,
    #[serde(default)]
    pub cookies: Option<String>,
    #[serde(default)]
    pub referer: Option<String>,
    #[serde(default)]
    pub content_disposition_name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Settings {
    pub folder: String,
    pub parallel: usize,
    pub connections: u32,
    pub limit_kib: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            folder: dirs::download_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("MyDM")
                .to_string_lossy()
                .into(),
            parallel: 2,
            connections: 4,
            limit_kib: 0,
        }
    }
}
