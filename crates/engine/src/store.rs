use anyhow::{anyhow, bail, Context, Result};
use rusqlite::{params, Connection};
use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use crate::downloader::download;
use crate::models::{Settings, Task, SCHEMA_VERSION};
use crate::util::{safe_name, sanitize_error};

#[derive(Clone)]
pub struct Store {
    pub root: PathBuf,
}

impl Store {
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(root.join("parts"))?;
        let s = Self { root };
        let c = s.db()?;
        s.init_schema(&c)?;
        Ok(s)
    }

    pub fn user() -> Result<Self> {
        Self::open(
            dirs::data_local_dir()
                .ok_or_else(|| anyhow!("Không tìm thấy thư mục dữ liệu"))?
                .join("MyDM"),
        )
    }

    pub fn db(&self) -> Result<Connection> {
        let c = Connection::open(self.root.join("mydm.sqlite"))?;
        c.busy_timeout(Duration::from_secs(5))?;
        c.pragma_update(None, "synchronous", "FULL")?;
        Ok(c)
    }

    pub fn init_schema(&self, c: &Connection) -> Result<()> {
        c.execute_batch(
            "PRAGMA journal_mode=WAL;\
             CREATE TABLE IF NOT EXISTS tasks(\
                 id TEXT PRIMARY KEY,\
                 state TEXT NOT NULL,\
                 data TEXT NOT NULL\
             );\
             CREATE TABLE IF NOT EXISTS settings(\
                 id INTEGER PRIMARY KEY,\
                 data TEXT NOT NULL\
             );\
             CREATE TABLE IF NOT EXISTS checkpoints(\
                 task TEXT,\
                 part INTEGER,\
                 offset INTEGER NOT NULL,\
                 PRIMARY KEY(task,part)\
             );\
             CREATE TABLE IF NOT EXISTS schema_version(\
                 id INTEGER PRIMARY KEY,\
                 version INTEGER NOT NULL\
             );",
        )?;

        let current: i64 = c
            .query_row(
                "SELECT version FROM schema_version WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(1);

        if current < SCHEMA_VERSION {
            self.migrate(c, current)?;
        }
        Ok(())
    }

    fn migrate(&self, c: &Connection, _from: i64) -> Result<()> {
        c.execute(
            "INSERT OR REPLACE INTO schema_version VALUES(1, ?1)",
            params![SCHEMA_VERSION],
        )?;
        Ok(())
    }

    pub fn settings(&self) -> Result<Settings> {
        let c = self.db()?;
        let mut q = c.prepare("SELECT data FROM settings WHERE id=1")?;
        let mut rows = q.query([])?;
        match rows.next()? {
            Some(r) => Ok(serde_json::from_str(&r.get::<_, String>(0)?)?),
            None => Ok(Settings::default()),
        }
    }

    pub fn save_settings(&self, s: Settings) -> Result<()> {
        if !(1..=6).contains(&s.parallel)
            || !(1..=8).contains(&s.connections)
            || s.limit_kib > 1_000_000
        {
            bail!("Giá trị cấu hình không hợp lệ")
        };
        if !Path::new(&s.folder).is_absolute() {
            bail!("Chọn đường dẫn tuyệt đối")
        };
        fs::create_dir_all(&s.folder)?;
        self.db()?.execute(
            "INSERT OR REPLACE INTO settings VALUES(1,?1)",
            [serde_json::to_string(&s)?],
        )?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add(
        &self,
        url: &str,
        name: &str,
        key: Option<&str>,
        hold: bool,
        cookies: Option<&str>,
        referer: Option<&str>,
        source: &str,
    ) -> Result<Task> {
        let u = reqwest::Url::parse(url)?;
        if !matches!(u.scheme(), "http" | "https")
            || !u.username().is_empty()
            || u.password().is_some()
        {
            bail!("Chỉ nhận URL HTTP/HTTPS không kèm mật khẩu")
        };
        if url.len() > 16384 {
            bail!("URL quá dài")
        };
        let id = match key {
            Some(k) => uuid::Uuid::parse_str(k)?.to_string(),
            None => uuid::Uuid::new_v4().to_string(),
        };
        if let Ok(t) = self.get(&id) {
            return Ok(t);
        }
        let s = self.settings()?;
        let guessed = u
            .path_segments()
            .and_then(|mut p| p.next_back())
            .unwrap_or("download.bin");
        let source_host = u.host_str().unwrap_or("").to_string();
        let t = Task {
            id: id.clone(),
            url: url.into(),
            name: safe_name(if name.is_empty() { guessed } else { name }),
            folder: s.folder,
            state: if hold { "held" } else { "queued" }.into(),
            error: String::new(),
            total: None,
            done: 0,
            etag: None,
            ranges: vec![],
            connections: s.connections,
            limit_kib: s.limit_kib,
            created: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_secs(),
            source: source.to_string(),
            source_host,
            cookies: cookies.map(|s| s.to_string()).filter(|s| !s.is_empty()),
            referer: referer.map(|s| s.to_string()).filter(|s| !s.is_empty()),
            content_disposition_name: None,
        };
        self.db()?.execute(
            "INSERT OR IGNORE INTO tasks VALUES(?1,?2,?3)",
            params![id, t.state, serde_json::to_string(&t)?],
        )?;
        self.get(&id)
    }

    pub fn list(&self) -> Result<Vec<Task>> {
        let c = self.db()?;
        let mut q = c.prepare("SELECT state,data FROM tasks ORDER BY rowid DESC")?;
        let rows = q.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut out = vec![];
        for row in rows {
            let (s, d) = row?;
            let mut t: Task = serde_json::from_str(&d)?;
            t.state = s;
            out.push(t)
        }
        Ok(out)
    }

    pub fn get(&self, id: &str) -> Result<Task> {
        self.list()?
            .into_iter()
            .find(|t| t.id == id)
            .ok_or_else(|| anyhow!("Không tìm thấy tác vụ"))
    }

    pub fn checkpoint(&self, id: &str, part: usize, n: u64) -> Result<()> {
        self.db()?.execute(
            "INSERT OR REPLACE INTO checkpoints VALUES(?1,?2,?3)",
            params![id, part as i64, n as i64],
        )?;
        Ok(())
    }

    pub fn offset(&self, id: &str, part: usize) -> Result<u64> {
        use rusqlite::OptionalExtension;
        Ok(self
            .db()?
            .query_row(
                "SELECT offset FROM checkpoints WHERE task=?1 AND part=?2",
                params![id, part as i64],
                |r| r.get::<_, i64>(0),
            )
            .optional()?
            .unwrap_or(0) as u64)
    }

    pub fn metadata(&self, t: &Task) -> Result<()> {
        self.db()?.execute(
            "UPDATE tasks SET data=?2 WHERE id=?1",
            params![t.id, serde_json::to_string(t)?],
        )?;
        Ok(())
    }

    pub fn action(&self, id: &str, action: &str) -> Result<()> {
        let c = self.db()?;
        match action {
            "pause" => {
                c.execute("UPDATE tasks SET state=CASE WHEN state='running' THEN 'pausing' ELSE 'paused' END WHERE id=?1 AND state IN ('queued','running','held')",[id])?;
            }
            "resume" => {
                c.execute("UPDATE tasks SET state='queued' WHERE id=?1 AND state IN ('paused','failed','held')",[id])?;
            }
            "cancel" => {
                c.execute("UPDATE tasks SET state=CASE WHEN state IN ('running','pausing') THEN 'cancelling' ELSE 'cancelled' END WHERE id=?1 AND state!='completed'",[id])?;
            }
            "restart" => {
                let mut t = self.get(id)?;
                if !matches!(t.state.as_str(), "failed" | "paused" | "cancelled") {
                    bail!("Dừng tác vụ trước khi tải lại")
                };
                let p = self.root.join("parts").join(id);
                if p.exists() {
                    fs::remove_dir_all(p)?
                };
                c.execute("DELETE FROM checkpoints WHERE task=?1", [id])?;
                t.total = None;
                t.etag = None;
                t.ranges.clear();
                t.done = 0;
                t.error.clear();
                self.metadata(&t)?;
                c.execute("UPDATE tasks SET state='queued' WHERE id=?1", [id])?;
            }
            "delete" => {
                let t = self.get(id)?;
                if matches!(t.state.as_str(), "running" | "pausing" | "cancelling") {
                    bail!("Chờ tác vụ dừng trước")
                };
                let p = self.root.join("parts").join(id);
                if p.exists() {
                    fs::remove_dir_all(p)?
                };
                c.execute("DELETE FROM tasks WHERE id=?1", [id])?;
            }
            _ => bail!("Lệnh không hợp lệ"),
        };
        Ok(())
    }

    pub fn end(&self, t: &Task, state: &str) -> Result<()> {
        self.metadata(t)?;
        self.db()?.execute(
            "UPDATE tasks SET state=?2 WHERE id=?1",
            params![t.id, state],
        )?;
        Ok(())
    }

    pub fn start(&self) -> Result<Arc<AtomicBool>> {
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.root.join("engine.lock"))?;
        fs2::FileExt::try_lock_exclusive(&lock).context("MyDM đang chạy trong cửa sổ khác")?;
        self.db()?.execute(
            "UPDATE tasks SET state='paused' WHERE state IN ('running','pausing','cancelling')",
            [],
        )?;
        let stop = Arc::new(AtomicBool::new(false));
        let signal = stop.clone();
        let s = self.clone();
        thread::spawn(move || {
            let _lock = lock;
            let mut handles: Vec<thread::JoinHandle<()>> = vec![];
            while !signal.load(Ordering::Relaxed) {
                handles.retain(|h| !h.is_finished());
                if let (Ok(tasks), Ok(config)) = (s.list(), s.settings()) {
                    for t in tasks
                        .into_iter()
                        .rev()
                        .filter(|t| t.state == "queued")
                        .take(config.parallel.saturating_sub(handles.len()))
                    {
                        let changed = s.db().and_then(|c| {
                            Ok(c.execute(
                                "UPDATE tasks SET state='running' WHERE id=?1 AND state='queued'",
                                [&t.id],
                            )?)
                        });
                        if !matches!(changed, Ok(1)) {
                            continue;
                        }
                        let ss = s.clone();
                        let sig = signal.clone();
                        handles.push(thread::spawn(move || {
                            ss.execute(t, sig);
                        }));
                    }
                }
                thread::sleep(Duration::from_millis(400));
            }
            for h in handles {
                let _ = h.join();
            }
        });
        Ok(stop)
    }

    pub fn execute(&self, mut t: Task, stop: Arc<AtomicBool>) {
        let result = download(self, &mut t, &stop);
        let state = match self.get(&t.id) {
            Ok(v) => v.state,
            Err(_) => return,
        };
        if state == "completed" {
            // Final file and database commit already succeeded.
        } else if state == "cancelling" {
            let _ = self.end(&t, "cancelled");
        } else if state == "pausing" || stop.load(Ordering::Relaxed) {
            let _ = self.end(&t, "paused");
        } else {
            match result {
                Ok(()) => {
                    let _ = self.end(&t, "completed");
                }
                Err(e) => {
                    t.error = sanitize_error(&e.to_string());
                    let _ = self.end(&t, "failed");
                }
            }
        }
    }
}
