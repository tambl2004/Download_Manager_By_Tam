/// Remove sensitive patterns from error messages
pub fn sanitize_error(msg: &str) -> String {
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
        if let Some(tick2) = rest
            .find('\'')
            .and_then(|p1| rest[p1 + 1..].find('\'').map(|p2| p1 + 1 + p2))
        {
            let encoded = rest[tick2 + 1..]
                .split([';', ' '])
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
        if let Some(stripped) = rest.strip_prefix('"') {
            // Quoted
            if let Some(end) = stripped.find('"') {
                let name = &stripped[..end];
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
pub fn percent_decode(input: &str) -> String {
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

/// Extract hostname from a URL string
pub fn url_host(url: &str) -> Option<String> {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_lowercase()))
}

/// Check if the redirect target is same-origin (for cookie safety)
pub fn is_same_origin(original_url: &str, redirect_url: &str) -> bool {
    let orig = reqwest::Url::parse(original_url).ok();
    let redir = reqwest::Url::parse(redirect_url).ok();
    match (orig, redir) {
        (Some(a), Some(b)) => {
            a.host_str() == b.host_str() && a.scheme() == b.scheme() && a.port() == b.port()
        }
        _ => false,
    }
}
