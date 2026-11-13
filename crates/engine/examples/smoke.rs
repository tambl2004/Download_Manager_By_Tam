use mydm_engine::{snapshot, Settings, Store};
use std::{
    path::PathBuf,
    sync::atomic::Ordering,
    thread,
    time::{Duration, Instant},
};
fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let root = PathBuf::from(&args[1]);
    let s = Store::open(root.clone())?;
    s.save_settings(Settings {
        folder: root.join("files").to_string_lossy().into(),
        parallel: 2,
        connections: 4,
        limit_kib: 0,
    })?;
    let t = s.add(&args[2], "result.bin", None, false, None, None, "manual")?;
    let stop = s.start()?;
    let start = Instant::now();
    let mut paused = false;
    loop {
        let v = snapshot(&s)?
            .into_iter()
            .find(|v| v.id == t.id)
            .ok_or_else(|| anyhow::anyhow!("missing"))?;
        if args.get(3).map(|x| x == "pause").unwrap_or(false)
            && !paused
            && v.done > 128 * 1024
            && v.state == "running"
        {
            s.action(&t.id, "pause")?;
            while s.get(&t.id)?.state == "pausing" {
                thread::sleep(Duration::from_millis(20));
            }
            s.action(&t.id, "resume")?;
            paused = true;
        }
        if v.state == "completed" {
            println!("{}", serde_json::to_string(&v)?);
            stop.store(true, Ordering::Relaxed);
            return Ok(());
        }
        if v.state == "failed" {
            anyhow::bail!("{}", v.error)
        }
        if start.elapsed() > Duration::from_secs(50) {
            anyhow::bail!("timeout")
        };
        thread::sleep(Duration::from_millis(20));
    }
}
