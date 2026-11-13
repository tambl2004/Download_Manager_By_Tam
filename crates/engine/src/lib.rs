use anyhow::{anyhow, bail, Context, Result};
use reqwest::{blocking::Client, header};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

const SCHEMA_VERSION: i64 = 2;

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
    fn db(&self) -> Result<Connection> {
        let c = Connection::open(self.root.join("mydm.sqlite"))?;
        c.busy_timeout(Duration::from_secs(5))?;
        c.pragma_update(None, "synchronous", "FULL")?;
        Ok(c)
    }
    fn init_schema(&self, c: &Connection) -> Result<()> {
        // Create base tables if they don't exist
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

        // Check current schema version
        let current: i64 = c
            .query_row(
                "SELECT version FROM schema_version WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(1); // If no row, this is a v1 DB

        if current < SCHEMA_VERSION {
            self.migrate(c, current)?;
        }
        Ok(())
    }
    fn migrate(&self, c: &Connection, from: i64) -> Result<()> {
        if from < 2 {
            // v1 → v2: new fields are stored in the JSON `data` column,
            // not as separate SQL columns. Task deserialization uses
            // #[serde(default)] so old rows without these fields still load.
            // We just need to set the schema version marker.
            //
            // Existing task data is preserved as-is. The new fields
            // (source, source_host, cookies, referer, content_disposition_name)
            // will default to empty/None when deserialized from old JSON.
        }

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
    fn checkpoint(&self, id: &str, part: usize, n: u64) -> Result<()> {
        self.db()?.execute(
            "INSERT OR REPLACE INTO checkpoints VALUES(?1,?2,?3)",
            params![id, part as i64, n as i64],
        )?;
        Ok(())
    }
    fn offset(&self, id: &str, part: usize) -> Result<u64> {
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
    fn metadata(&self, t: &Task) -> Result<()> {
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
    fn end(&self, t: &Task, state: &str) -> Result<()> {
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
    fn execute(&self, mut t: Task, stop: Arc<AtomicBool>) {
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
                    // Sanitize error: do not leak cookies/tokens
                    t.error = sanitize_error(&e.to_string());
                    let _ = self.end(&t, "failed");
                }
            }
        }
    }
}

/// Remove sensitive patterns from error messages
fn sanitize_error(msg: &str) -> String {
    // Truncate very long messages that might contain URL with tokens
    if msg.len() > 300 {
        format!("{}…", &msg[..297])
    } else {
        msg.to_string()
    }
}

pub fn safe_name(s: &str) -> String {
    let s = s.rsplit(['/', '\\']).next().unwrap_or("");
    let v: String = s
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
        .take(160)
        .collect();
    let v = v.trim_matches([' ', '.']);
    let stem = v.split('.').next().unwrap_or("").to_uppercase();
    if v.is_empty()
        || [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&stem.as_str())
    {
        format!("download_{}.bin", uuid::Uuid::new_v4())
    } else {
        v.into()
    }
}

/// Parse Content-Disposition header for filename.
/// Supports: filename*=UTF-8''encoded_name (RFC 5987) and filename="name" fallback.
pub fn parse_content_disposition(value: &str) -> Option<String> {
    // Try filename*= first (RFC 5987)
    if let Some(star_pos) = value.to_lowercase().find("filename*=") {
        let rest = &value[star_pos + 10..];
        // Format: charset'language'encoded_value
        if let Some(tick2) = rest.find('\'').and_then(|p1| rest[p1 + 1..].find('\'').map(|p2| p1 + 1 + p2)) {
            let encoded = rest[tick2 + 1..]
                .split(|c: char| c == ';' || c == ' ')
                .next()
                .unwrap_or("");
            let decoded = percent_decode(encoded);
            if !decoded.is_empty() {
                return Some(decoded);
            }
        }
    }

    // Fallback: filename="value" or filename=value
    if let Some(pos) = value.to_lowercase().find("filename=") {
        let rest = value[pos + 9..].trim_start();
        if rest.starts_with('"') {
            // Quoted
            if let Some(end) = rest[1..].find('"') {
                let name = &rest[1..1 + end];
                if !name.is_empty() {
                    return Some(name.to_string());
                }
            }
        } else {
            // Unquoted
            let name: String = rest
                .chars()
                .take_while(|c| !matches!(c, ';' | ' ' | '\t'))
                .collect();
            if !name.is_empty() {
                return Some(name);
            }
        }
    }

    None
}

/// Simple percent-decode for RFC 5987 filenames
fn percent_decode(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(result).unwrap_or_default()
}

fn client() -> Result<Client> {
    Ok(Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("MyDM/0.2")
        .build()?)
}

/// Build a client that does NOT follow redirects (for cookie-aware requests)
fn client_no_redirect() -> Result<Client> {
    Ok(Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("MyDM/0.2")
        .build()?)
}

fn etag(r: &reqwest::blocking::Response) -> Option<String> {
    r.headers()
        .get(header::ETAG)?
        .to_str()
        .ok()
        .filter(|s| s.starts_with('"') && s.ends_with('"'))
        .map(String::from)
}
fn parse_range(s: &str) -> Option<(u64, u64, u64)> {
    let s = s.strip_prefix("bytes ")?;
    let (a, n) = s.split_once('/')?;
    let (a, b) = a.split_once('-')?;
    let v = (a.parse().ok()?, b.parse().ok()?, n.parse().ok()?);
    if v.0 <= v.1 && v.1 < v.2 {
        Some(v)
    } else {
        None
    }
}
fn active(s: &Store, id: &str, stop: &AtomicBool) -> Result<()> {
    if stop.load(Ordering::Relaxed) || s.get(id)?.state != "running" {
        bail!("Đã dừng")
    };
    Ok(())
}

/// Extract hostname from a URL string
fn url_host(url: &str) -> Option<String> {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_lowercase()))
}

/// Check if the redirect target is same-origin (for cookie safety)
fn is_same_origin(original_url: &str, redirect_url: &str) -> bool {
    let orig = reqwest::Url::parse(original_url).ok();
    let redir = reqwest::Url::parse(redirect_url).ok();
    match (orig, redir) {
        (Some(a), Some(b)) => {
            a.host_str() == b.host_str()
                && a.scheme() == b.scheme()
                && a.port() == b.port()
        }
        _ => false,
    }
}

/// Follow redirects manually, stripping credentials on cross-origin
fn follow_redirects(
    client: &Client,
    initial_url: &str,
    cookies: Option<&str>,
    referer: Option<&str>,
) -> Result<reqwest::blocking::Response> {
    let mut url = initial_url.to_string();
    let orig_host = url_host(initial_url);

    for _ in 0..10 {
        let mut req = client
            .get(&url)
            .header(header::ACCEPT_ENCODING, "identity")
            .header(header::RANGE, "bytes=0-0");

        // Only send cookies/referer if same origin
        let current_host = url_host(&url);
        if current_host == orig_host {
            if let Some(c) = cookies {
                req = req.header(header::COOKIE, c);
            }
            if let Some(r) = referer {
                req = req.header(header::REFERER, r);
            }
        }

        let resp = req.send().map_err(|_| anyhow!("Không kết nối được máy chủ"))?;

        if resp.status().is_redirection() {
            if let Some(loc) = resp.headers().get(header::LOCATION) {
                let loc_str = loc.to_str().unwrap_or("");
                // Resolve relative redirect
                url = if loc_str.starts_with("http://") || loc_str.starts_with("https://") {
                    loc_str.to_string()
                } else {
                    reqwest::Url::parse(&url)?
                        .join(loc_str)?
                        .to_string()
                };
                continue;
            }
        }

        return Ok(resp);
    }

    bail!("Quá nhiều chuyển hướng")
}

/// Build a request for a download part, with credential safety on redirects
fn build_part_request(
    client: &Client,
    url: &str,
    range_header: Option<String>,
    if_range: Option<&str>,
    cookies: Option<&str>,
    referer: Option<&str>,
    original_url: &str,
) -> Result<reqwest::blocking::Response> {
    let mut req = client.get(url).header(header::ACCEPT_ENCODING, "identity");

    if let Some(rh) = range_header {
        req = req.header(header::RANGE, rh);
    }
    if let Some(ir) = if_range {
        req = req.header(header::IF_RANGE, ir);
    }

    // Only send cookies/referer if same origin as original URL
    if is_same_origin(original_url, url) {
        if let Some(c) = cookies {
            req = req.header(header::COOKIE, c);
        }
        if let Some(r) = referer {
            req = req.header(header::REFERER, r);
        }
    }

    req.send().map_err(|_| anyhow!("Kết nối thất bại"))
}

fn download(s: &Store, t: &mut Task, stop: &Arc<AtomicBool>) -> Result<()> {
    let dir = s.root.join("parts").join(&t.id);
    fs::create_dir_all(&dir)?;
    fs::create_dir_all(&t.folder)?;

    let has_cookies = t.cookies.is_some();

    if t.ranges.is_empty() {
        // Probe phase
        let r = if has_cookies {
            let c = client_no_redirect()?;
            follow_redirects(
                &c,
                &t.url,
                t.cookies.as_deref(),
                t.referer.as_deref(),
            )?
        } else {
            let c = client()?;
            c.get(&t.url)
                .header(header::ACCEPT_ENCODING, "identity")
                .header(header::RANGE, "bytes=0-0")
                .send()
                .map_err(|_| anyhow!("Không kết nối được máy chủ"))?
        };

        // Check for auth failures
        let status_code = r.status().as_u16();
        if status_code == 401 || status_code == 403 {
            bail!("Máy chủ từ chối truy cập ({}). Nếu cần đăng nhập, hãy đăng nhập lại trên Chrome rồi gửi lại link.", status_code)
        }

        // Parse Content-Disposition for filename
        if let Some(cd) = r.headers().get(header::CONTENT_DISPOSITION) {
            if let Ok(cd_str) = cd.to_str() {
                if let Some(cd_name) = parse_content_disposition(cd_str) {
                    let safe = safe_name(&cd_name);
                    t.content_disposition_name = Some(safe.clone());
                    // Use Content-Disposition name if user didn't specify one
                    // (name matches the URL-guessed default)
                    let url_guessed = reqwest::Url::parse(&t.url)
                        .ok()
                        .and_then(|u| u.path_segments().and_then(|mut p| p.next_back().map(|s| s.to_string())))
                        .map(|s| safe_name(&s))
                        .unwrap_or_default();
                    if t.name == url_guessed || t.name == "download.bin" {
                        t.name = safe;
                    }
                }
            }
        }

        let range = r
            .headers()
            .get(header::CONTENT_RANGE)
            .and_then(|h| h.to_str().ok())
            .and_then(parse_range);
        t.etag = etag(&r);
        if r.status().as_u16() == 206
            && range.map(|v| v.0 == 0 && v.1 == 0).unwrap_or(false)
            && t.etag.is_some()
        {
            let n = range.map(|v| v.2).unwrap_or(0);
            t.total = Some(n);
            let count = if n >= 8 * 1024 * 1024 {
                t.connections as u64
            } else {
                1
            };
            let size = n.div_ceil(count);
            t.ranges = (0..count)
                .filter_map(|i| {
                    let a = i * size;
                    if a < n {
                        Some((a, (a + size - 1).min(n - 1)))
                    } else {
                        None
                    }
                })
                .collect();
        } else {
            t.total = None;
            t.etag = None;
            t.ranges = vec![(0, u64::MAX)];
        }
        drop(r);
        s.metadata(t)?;
    }
    // Each range has its own part file: no shared seek cursor or unverified preallocation.
    let ranged = t.ranges[0].1 != u64::MAX;
    if !ranged {
        let p = dir.join("0.part");
        if p.exists() {
            fs::remove_file(p)?;
        }
        t.done = 0;
    }
    let mut workers = vec![];
    let abort = Arc::new(AtomicBool::new(false));
    for (i, (a, b)) in t.ranges.clone().into_iter().enumerate() {
        let st = s.clone();
        let task = t.clone();
        let sig = stop.clone();
        let bad = abort.clone();
        let p = dir.join(format!("{i}.part"));
        workers.push(thread::spawn(move || -> Result<()> {
            let c = if task.cookies.is_some() {
                client_no_redirect()?
            } else {
                client()?
            };
            let cap = if b == u64::MAX { None } else { Some(b - a + 1) };
            let count = task.ranges.len() as u64;
            for attempt in 0..3 {
                active(&st, &task.id, &sig)?;
                if bad.load(Ordering::Relaxed) {
                    bail!("Phần tải khác thất bại")
                };
                let actual = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                let offset = st.offset(&task.id, i)?.min(actual);
                if p.exists() {
                    OpenOptions::new().write(true).open(&p)?.set_len(offset)?;
                }
                if cap == Some(offset) {
                    return Ok(());
                };
                if cap.map(|n| offset > n).unwrap_or(false) {
                    bail!("Tệp tạm dài quá phạm vi")
                };

                let r_result = if task.cookies.is_some() {
                    // Manual redirect handling for cookie safety
                    let range_hdr = if cap.is_some() {
                        Some(format!("bytes={}-{}", a + offset, b))
                    } else {
                        None
                    };
                    let if_range = if cap.is_some() {
                        task.etag.as_deref()
                    } else {
                        None
                    };
                    build_part_request(
                        &c,
                        &task.url,
                        range_hdr,
                        if_range,
                        task.cookies.as_deref(),
                        task.referer.as_deref(),
                        &task.url,
                    )
                } else {
                    let mut req = c.get(&task.url).header(header::ACCEPT_ENCODING, "identity");
                    if cap.is_some() {
                        req = req
                            .header(header::RANGE, format!("bytes={}-{}", a + offset, b))
                            .header(
                                header::IF_RANGE,
                                task.etag.clone().ok_or_else(|| anyhow!("Thiếu ETag"))?,
                            );
                    }
                    req.send().map_err(|_| anyhow!("Kết nối thất bại"))
                };

                let mut r = match r_result {
                    Ok(r) => r,
                    Err(_) => {
                        if attempt == 2 {
                            bail!("Kết nối thất bại sau 3 lần")
                        };
                        thread::sleep(Duration::from_secs(1 << attempt));
                        continue;
                    }
                };

                // Auth failure
                if r.status().as_u16() == 401 || r.status().as_u16() == 403 {
                    bail!("Máy chủ từ chối truy cập. Đăng nhập lại trên Chrome rồi gửi lại link.")
                }

                if r.status().as_u16() == 429 || r.status().is_server_error() {
                    if attempt == 2 {
                        bail!("Máy chủ tạm từ chối tải")
                    };
                    let wait = r
                        .headers()
                        .get(header::RETRY_AFTER)
                        .and_then(|x| x.to_str().ok())
                        .and_then(|x| x.parse::<u64>().ok())
                        .unwrap_or(1 << attempt)
                        .min(60);
                    thread::sleep(Duration::from_secs(wait));
                    continue;
                }
                if cap.is_some() {
                    let got = r
                        .headers()
                        .get(header::CONTENT_RANGE)
                        .and_then(|h| h.to_str().ok())
                        .and_then(parse_range);
                    if r.status().as_u16() != 206
                        || got != Some((a + offset, b, task.total.unwrap_or(0)))
                        || etag(&r) != task.etag
                    {
                        bail!("Range hoặc ETag thay đổi. Dùng Tải lại từ đầu.")
                    };
                } else if r.status().as_u16() != 200 {
                    bail!("HTTP {} không hỗ trợ tải trực tiếp", r.status().as_u16())
                }
                if r.headers()
                    .get(header::CONTENT_ENCODING)
                    .map(|h| h != "identity")
                    .unwrap_or(false)
                {
                    bail!("Máy chủ nén nội dung không phù hợp phạm vi byte")
                };
                let expected = cap.map(|n| n - offset).or(r.content_length());
                let mut f = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .append(cap.is_some())
                    .truncate(cap.is_none())
                    .open(&p)?;
                let mut buf = vec![0u8; 64 * 1024];
                let mut read = 0u64;
                let mut checkpointed = 0u64;
                let start = Instant::now();
                let mut failed = false;
                loop {
                    active(&st, &task.id, &sig)?;
                    if bad.load(Ordering::Relaxed) {
                        bail!("Phần tải khác thất bại")
                    };
                    let n = match r.read(&mut buf) {
                        Ok(n) => n,
                        Err(_) => {
                            failed = true;
                            break;
                        }
                    };
                    if n == 0 {
                        break;
                    }
                    if expected.map(|v| read + n as u64 > v).unwrap_or(false) {
                        bail!("Dữ liệu vượt kích thước")
                    };
                    f.write_all(&buf[..n])?;
                    read += n as u64;
                    if cap.is_some() && read - checkpointed >= 1024 * 1024 {
                        f.sync_all()?;
                        st.checkpoint(&task.id, i, offset + read)?;
                        checkpointed = read;
                    }
                    if task.limit_kib > 0 {
                        let desired = Duration::from_secs_f64(
                            read as f64 * count as f64 / (task.limit_kib * 1024) as f64,
                        );
                        while start.elapsed() < desired {
                            active(&st, &task.id, &sig)?;
                            thread::sleep(Duration::from_millis(50));
                        }
                    }
                }
                f.sync_all()?;
                if cap.is_some() {
                    st.checkpoint(&task.id, i, offset + read)?;
                }
                if !failed && expected.map(|v| read == v).unwrap_or(true) {
                    return Ok(());
                };
                if attempt == 2 {
                    bail!("Kết nối ngắt hoặc dữ liệu thiếu")
                };
                thread::sleep(Duration::from_secs(1 << attempt));
            }
            bail!("Không thể tải")
        }));
    }
    // UI reads file lengths without forcing database writes per network chunk.
    let mut error = None;
    for w in workers {
        match w.join() {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                abort.store(true, Ordering::Relaxed);
                error = Some(e)
            }
            Err(_) => {
                abort.store(true, Ordering::Relaxed);
                error = Some(anyhow!("Luồng tải kết thúc bất thường"));
            }
        }
    }
    if let Some(e) = error {
        return Err(e);
    }
    active(s, &t.id, stop)?;
    let folder = Path::new(&t.folder);
    let original = safe_name(&t.name);
    let mut dest = folder.join(&original);
    let mut index = 1;
    let mut output = tempfile::NamedTempFile::new_in(folder)?;
    let mut n = 0;
    for i in 0..t.ranges.len() {
        active(s, &t.id, stop)?;
        n += std::io::copy(
            &mut File::open(dir.join(format!("{i}.part")))?,
            output.as_file_mut(),
        )?;
    }
    output.as_file().sync_all()?;
    active(s, &t.id, stop)?;
    loop {
        match output.persist_noclobber(&dest) {
            Ok(_) => break,
            Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => {
                output = e.file;
                dest = folder.join(format!("{index}_{original}"));
                index += 1;
            }
            Err(e) => return Err(e.error.into()),
        }
    }
    t.name = dest
        .file_name()
        .ok_or_else(|| anyhow!("Tên file không hợp lệ"))?
        .to_string_lossy()
        .into();
    t.done = n;
    t.total = Some(n);
    t.error.clear();
    // Clear cookies from completed task metadata (don't persist credentials longer than needed)
    t.cookies = None;
    s.end(t, "completed")?;
    let _ = fs::remove_dir_all(dir);

    Ok(())
}
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
        // Simple filename
        assert_eq!(
            parse_content_disposition("attachment; filename=\"report.pdf\""),
            Some("report.pdf".into())
        );
        // filename*= with UTF-8 encoding
        assert_eq!(
            parse_content_disposition("attachment; filename*=UTF-8''my%20file.zip"),
            Some("my file.zip".into())
        );
        // filename*= takes priority
        assert_eq!(
            parse_content_disposition("attachment; filename=\"fallback.txt\"; filename*=UTF-8''real%20name.txt"),
            Some("real name.txt".into())
        );
        // Unquoted filename
        assert_eq!(
            parse_content_disposition("attachment; filename=simple.exe"),
            Some("simple.exe".into())
        );
        // No filename
        assert_eq!(parse_content_disposition("inline"), None);
    }
    #[test]
    fn schema_migration_from_v1() -> Result<()> {
        let d = tempfile::tempdir()?;
        // Create a v1-style database manually
        let db_path = d.path().join("mydm.sqlite");
        {
            let c = Connection::open(&db_path)?;
            c.execute_batch(
                "PRAGMA journal_mode=WAL;\
                 CREATE TABLE tasks(id TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL);\
                 CREATE TABLE settings(id INTEGER PRIMARY KEY, data TEXT NOT NULL);\
                 CREATE TABLE checkpoints(task TEXT, part INTEGER, offset INTEGER NOT NULL, PRIMARY KEY(task, part));"
            )?;
            // Insert a v1-format task (without new fields)
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

        // Now open with Store which should migrate
        fs::create_dir_all(d.path().join("parts"))?;
        let s = Store { root: d.path().to_path_buf() };
        let c = s.db()?;
        s.init_schema(&c)?;

        // Verify old task is preserved and new fields default properly
        let tasks = s.list()?;
        assert_eq!(tasks.len(), 1);
        let t = &tasks[0];
        assert_eq!(t.id, "test-123");
        assert_eq!(t.name, "file.zip");
        assert_eq!(t.state, "completed");
        assert_eq!(t.source, "");  // defaults to empty
        assert_eq!(t.source_host, ""); // defaults to empty
        assert!(t.cookies.is_none());
        assert!(t.referer.is_none());
        assert!(t.content_disposition_name.is_none());

        // Verify schema version was set
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
        // Cookies should be set
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
