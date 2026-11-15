pub mod models;
pub mod util;
pub mod downloader;
pub mod store;

pub use models::*;
pub use util::*;
pub use downloader::*;
pub use store::*;

use anyhow::Result;
use std::fs;

pub fn snapshot(s: &Store) -> Result<Vec<Task>> {
    let mut ts = s.list()?;
    for t in &mut ts {
        if t.state != "completed" {
            t.done = (0..t.ranges.len())
                .map(|i| {
                    fs::metadata(s.root.join("parts").join(&t.id).join(format!("{i}.part")))
                        .map(|m| m.len())
                        .unwrap_or(0)
                })
                .sum();
        }
        // Never expose cookies to UI
        t.cookies = None;
    }
    Ok(ts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    #[test]
    fn path_safety() {
        assert_eq!(safe_name("../../test.exe"), "test.exe");
        assert!(!safe_name("CON.txt").starts_with("CON"));
        assert_eq!(safe_name("a:b?.zip"), "ab.zip");
    }

    #[test]
    fn content_range() {
        assert_eq!(parse_range("bytes 0-9/10"), Some((0, 9, 10)));
        assert!(parse_range("bytes 1-10/10").is_none());
    }

    #[test]
    fn persistence_and_dedup() -> Result<()> {
        let d = tempfile::tempdir()?;
        let s = Store::open(d.path().into())?;
        let id = uuid::Uuid::new_v4().to_string();
        let t = s.add("https://example.org/a", "", Some(&id), true, None, None, "chrome")?;
        s.add("https://example.org/a", "", Some(&id), true, None, None, "chrome")?;
        assert_eq!(s.list()?.len(), 1);
        assert_eq!(t.state, "held");
        s.action(&id, "resume")?;
        assert_eq!(s.get(&id)?.state, "queued");
        assert!(s.add("file:///c:/test", "", None, false, None, None, "manual").is_err());
        Ok(())
    }

    #[test]
    fn content_disposition_parsing() {
        assert_eq!(
            parse_content_disposition("attachment; filename=\"report.pdf\""),
            Some("report.pdf".into())
        );
        assert_eq!(
            parse_content_disposition("attachment; filename*=UTF-8''my%20file.zip"),
            Some("my file.zip".into())
        );
        assert_eq!(
            parse_content_disposition("attachment; filename=\"fallback.txt\"; filename*=UTF-8''real%20name.txt"),
            Some("real name.txt".into())
        );
        assert_eq!(
            parse_content_disposition("attachment; filename=simple.exe"),
            Some("simple.exe".into())
        );
        assert_eq!(parse_content_disposition("inline"), None);
    }

    #[test]
    fn schema_migration_from_v1() -> Result<()> {
        let d = tempfile::tempdir()?;
        let db_path = d.path().join("mydm.sqlite");
        {
            let c = Connection::open(&db_path)?;
            c.execute_batch(
                "PRAGMA journal_mode=WAL;\
                 CREATE TABLE tasks(id TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL);\
                 CREATE TABLE settings(id INTEGER PRIMARY KEY, data TEXT NOT NULL);\
                 CREATE TABLE checkpoints(task TEXT, part INTEGER, offset INTEGER NOT NULL, PRIMARY KEY(task, part));"
            )?;
            let old_task = serde_json::json!({
                "id": "test-123",
                "url": "https://example.com/file.zip",
                "name": "file.zip",
                "folder": "C:\\Downloads",
                "state": "completed",
                "error": "",
                "total": 1024,
                "done": 1024,
                "etag": null,
                "ranges": [],
                "connections": 4,
                "limit_kib": 0,
                "created": 1700000000
            });
            c.execute(
                "INSERT INTO tasks VALUES(?1, ?2, ?3)",
                params!["test-123", "completed", old_task.to_string()],
            )?;
        }

        fs::create_dir_all(d.path().join("parts"))?;
        let s = Store { root: d.path().to_path_buf() };
        let c = s.db()?;
        s.init_schema(&c)?;

        let tasks = s.list()?;
        assert_eq!(tasks.len(), 1);
        let t = &tasks[0];
        assert_eq!(t.id, "test-123");
        assert_eq!(t.name, "file.zip");
        assert_eq!(t.state, "completed");
        assert_eq!(t.source, "");
        assert_eq!(t.source_host, "");
        assert!(t.cookies.is_none());
        assert!(t.referer.is_none());
        assert!(t.content_disposition_name.is_none());

        let ver: i64 = c.query_row(
            "SELECT version FROM schema_version WHERE id=1",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(ver, 2);
        Ok(())
    }

    #[test]
    fn new_task_fields() -> Result<()> {
        let d = tempfile::tempdir()?;
        let s = Store::open(d.path().into())?;
        let t = s.add(
            "https://cdn.example.com/big.zip",
            "",
            None,
            false,
            Some("session=abc123"),
            Some("https://example.com/page"),
            "chrome",
        )?;
        assert_eq!(t.source, "chrome");
        assert_eq!(t.source_host, "cdn.example.com");
        let raw = s.get(&t.id)?;
        assert!(raw.cookies.is_some());
        assert_eq!(raw.referer.as_deref(), Some("https://example.com/page"));
        Ok(())
    }

    #[test]
    fn sanitize_error_truncation() {
        let long = "x".repeat(500);
        let result = sanitize_error(&long);
        assert!(result.len() < 310);
        assert!(result.ends_with('…'));

        let short = "Short error".to_string();
        assert_eq!(sanitize_error(&short), "Short error");
    }

    #[test]
    fn snapshot_hides_cookies() -> Result<()> {
        let d = tempfile::tempdir()?;
        let s = Store::open(d.path().into())?;
        let t = s.add(
            "https://example.com/secret.zip",
            "",
            None,
            true,
            Some("token=secret"),
            None,
            "chrome",
        )?;
        let snaps = snapshot(&s)?;
        let found = snaps.iter().find(|x| x.id == t.id).unwrap();
        assert!(found.cookies.is_none(), "Cookies must not be exposed in snapshot");
        Ok(())
    }
}
