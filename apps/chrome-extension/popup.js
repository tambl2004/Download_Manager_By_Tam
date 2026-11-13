const status = document.getElementById("status");
const modeRadios = document.querySelectorAll('input[name="mode"]');
const allowDomains = document.getElementById("allowDomains");
const blockDomains = document.getElementById("blockDomains");
const allowSubdomains = document.getElementById("allowSubdomains");
const sessionSites = document.getElementById("sessionSites");
const cookieStatus = document.getElementById("cookieStatus");
const diagDiv = document.getElementById("diagnostics");
const diagHost = document.getElementById("diag-host");
const diagVersion = document.getElementById("diag-version");

// Load saved settings
chrome.storage.local
  .get([
    "mode",
    "allowDomains",
    "blockDomains",
    "allowSubdomains",
    "sessionSites",
    "status",
  ])
  .then((s) => {
    const mode = s.mode || "off";
    modeRadios.forEach((r) => {
      r.checked = r.value === mode;
    });
    allowDomains.value = s.allowDomains || "";
    blockDomains.value = s.blockDomains || "";
    allowSubdomains.checked = !!s.allowSubdomains;
    sessionSites.value = s.sessionSites?.join("\n") || "";
    status.textContent = s.status || "Chưa kiểm tra kết nối.";

    // Check cookie permission status
    updateCookieStatus();
  });

// Save button
document.getElementById("save").onclick = async () => {
  const mode = [...modeRadios].find((r) => r.checked)?.value || "off";
  const sessions = sessionSites.value
    .split(/[\n,]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  await chrome.storage.local.set({
    mode,
    allowDomains: allowDomains.value,
    blockDomains: blockDomains.value,
    allowSubdomains: allowSubdomains.checked,
    sessionSites: sessions,
    // Keep backward compat fields
    automatic: mode === "auto",
    domains: allowDomains.value,
  });

  status.textContent =
    "Đã lưu. Tên miền phải khớp chính xác (trừ khi bật tên miền phụ).";
  status.className = "main-status success";
};

// Ping / diagnostics
document.getElementById("ping").onclick = async () => {
  diagDiv.style.display = "block";
  diagHost.textContent = "Đang kiểm tra…";
  diagHost.className = "diag-status checking";
  diagVersion.textContent = "…";

  try {
    const r = await chrome.runtime.sendMessage({ op: "ping" });
    if (r?.ok) {
      diagHost.textContent = "✓ Hoạt động";
      diagHost.className = "diag-status ok";
      diagVersion.textContent = `v${r.hostVersion || "?"}`;
      status.textContent =
        "Native host hoạt động. Mở MyDM để xử lý hàng đợi.";
      status.className = "main-status success";

      if (r.hostVersion && r.hostVersion < 2) {
        status.textContent +=
          " ⚠ Phiên bản host cũ (v1). Cập nhật mydm-native-host.exe để dùng phiên đăng nhập.";
        status.className = "main-status warning";
      }
    } else {
      diagHost.textContent = "✕ Lỗi: " + (r?.error || "Không phản hồi");
      diagHost.className = "diag-status error";
      status.textContent = r?.error || "Không có phản hồi";
      status.className = "main-status error";
    }
  } catch (e) {
    diagHost.textContent = "✕ " + String(e);
    diagHost.className = "diag-status error";
    status.textContent = String(e);
    status.className = "main-status error";

    // Provide actionable guidance
    if (String(e).includes("not found") || String(e).includes("Specified native messaging host")) {
      status.textContent +=
        "\n→ Kiểm tra: ID extension đúng chưa? Đã chạy install-host.ps1? Đường dẫn EXE còn đúng?";
    }
  }
};

// Grant cookies permission
document.getElementById("grantCookies").onclick = async () => {
  const sites = sessionSites.value
    .split(/[\n,]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (sites.length === 0) {
    cookieStatus.textContent =
      "Nhập ít nhất một tên miền trước khi cấp quyền.";
    cookieStatus.className = "status-text warning";
    return;
  }

  const origins = sites.flatMap((s) => [
    `https://${s}/*`,
    `http://${s}/*`,
  ]);

  try {
    const r = await chrome.runtime.sendMessage({
      op: "requestCookiePermission",
      origins,
    });
    if (r?.ok) {
      cookieStatus.textContent = `Đã cấp quyền cookie cho: ${sites.join(", ")}`;
      cookieStatus.className = "status-text success";
    } else {
      cookieStatus.textContent = "Người dùng từ chối hoặc lỗi quyền.";
      cookieStatus.className = "status-text error";
    }
  } catch (e) {
    cookieStatus.textContent = String(e);
    cookieStatus.className = "status-text error";
  }
  updateCookieStatus();
};

// Revoke cookies permission
document.getElementById("revokeCookies").onclick = async () => {
  const sites = sessionSites.value
    .split(/[\n,]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  const origins = sites.flatMap((s) => [
    `https://${s}/*`,
    `http://${s}/*`,
  ]);

  try {
    const r = await chrome.runtime.sendMessage({
      op: "revokeSitePermission",
      origins,
    });
    if (r?.ok) {
      cookieStatus.textContent = "Đã thu hồi quyền.";
      cookieStatus.className = "status-text success";
    } else {
      cookieStatus.textContent = "Không thu hồi được.";
      cookieStatus.className = "status-text error";
    }
  } catch (e) {
    cookieStatus.textContent = String(e);
    cookieStatus.className = "status-text error";
  }
  updateCookieStatus();
};

async function updateCookieStatus() {
  try {
    const r = await chrome.runtime.sendMessage({ op: "checkPermissions" });
    if (r?.ok) {
      const grantBtn = document.getElementById("grantCookies");
      const revokeBtn = document.getElementById("revokeCookies");
      if (r.hasCookies) {
        grantBtn.style.display = "none";
        revokeBtn.style.display = "inline-block";
        if (!cookieStatus.textContent) {
          cookieStatus.textContent = "Quyền cookie: đã cấp.";
          cookieStatus.className = "status-text success";
        }
      } else {
        grantBtn.style.display = "inline-block";
        revokeBtn.style.display = "none";
        if (!cookieStatus.textContent) {
          cookieStatus.textContent = "Quyền cookie: chưa cấp.";
          cookieStatus.className = "status-text";
        }
      }
    }
  } catch {
    // ignore
  }
}
