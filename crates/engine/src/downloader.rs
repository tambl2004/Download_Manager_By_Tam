use anyhow::{anyhow, bail, Result};
use reqwest::{blocking::Client, header};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use crate::models::Task;
use crate::store::Store;
use crate::util::{is_same_origin, parse_content_disposition, safe_name, url_host};

pub fn client() -> Result<Client> {
    Ok(Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("MyDM/0.2")
        .build()?)
}

/// Build a client that does NOT follow redirects (for cookie-aware requests)
pub fn client_no_redirect() -> Result<Client> {
    Ok(Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("MyDM/0.2")
        .build()?)
}

pub fn etag(r: &reqwest::blocking::Response) -> Option<String> {
    r.headers()
        .get(header::ETAG)?
        .to_str()
        .ok()
        .filter(|s| s.starts_with('"') && s.ends_with('"'))
        .map(String::from)
}

pub fn parse_range(s: &str) -> Option<(u64, u64, u64)> {
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

pub fn active(s: &Store, id: &str, stop: &AtomicBool) -> Result<()> {
    if stop.load(Ordering::Relaxed) || s.get(id)?.state != "running" {
        bail!("Đã dừng")
    };
    Ok(())
}

/// Follow redirects manually, stripping credentials on cross-origin
pub fn follow_redirects(
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
pub fn build_part_request(
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

pub fn download(s: &Store, t: &mut Task, stop: &Arc<AtomicBool>) -> Result<()> {
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
    t.cookies = None;
    s.end(t, "completed")?;
    let _ = fs::remove_dir_all(dir);

    Ok(())
}
