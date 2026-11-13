use serde_json::{json, Value};
use std::io::{self, Read, Write};
fn handle(v: Value) -> anyhow::Result<Value> {
    let s = mydm_engine::Store::user()?;
    match v["op"].as_str().unwrap_or("") {
        "ping" => Ok(json!({"ok":true,"version":1})),
        "add" => {
            let t = s.add(
                v["url"].as_str().unwrap_or(""),
                v["name"].as_str().unwrap_or(""),
                v["id"].as_str(),
                v["hold"].as_bool().unwrap_or(true),
            )?;
            Ok(json!({"ok":true,"id":t.id,"state":t.state}))
        }
        "resume" | "cancel" => {
            s.action(
                v["id"].as_str().unwrap_or(""),
                v["op"].as_str().unwrap_or(""),
            )?;
            Ok(json!({"ok":true}))
        }
        _ => anyhow::bail!("Unknown operation"),
    }
}
fn main() {
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    loop {
        let mut size = [0u8; 4];
        if input.read_exact(&mut size).is_err() {
            break;
        }
        let n = u32::from_le_bytes(size) as usize;
        if n == 0 || n > 65536 {
            break;
        }
        let mut bytes = vec![0; n];
        if input.read_exact(&mut bytes).is_err() {
            break;
        }
        let result = serde_json::from_slice(&bytes)
            .map_err(anyhow::Error::from)
            .and_then(handle);
        let value = match result {
            Ok(v) => v,
            Err(_) => {
                json!({"ok":false,"error":"Không tiếp nhận được tác vụ. Kiểm tra URL, trạng thái và quyền ghi dữ liệu."})
            }
        };
        let Ok(data) = serde_json::to_vec(&value) else {
            break;
        };
        if output
            .write_all(&(data.len() as u32).to_le_bytes())
            .and_then(|_| output.write_all(&data))
            .and_then(|_| output.flush())
            .is_err()
        {
            break;
        }
    }
}
