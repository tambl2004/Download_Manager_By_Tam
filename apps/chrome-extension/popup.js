const statusEl = document.getElementById("status");
const masterToggle = document.getElementById("masterToggle");
const hostIndicator = document.getElementById("hostIndicator");
const hostStatusText = document.getElementById("hostStatusText");
const diagVersion = document.getElementById("diag-version");
const pingBtn = document.getElementById("ping");
const modeRadios = document.querySelectorAll('input[name="mode"]');
const blockDomains = document.getElementById("blockDomains");
const sessionSites = document.getElementById("sessionSites");
const cookieStatus = document.getElementById("cookieStatus");
const saveBtn = document.getElementById("save");

// Check Native Host connection
async function checkHostConnection() {
    hostIndicator.className = "status-dot yellow";
    hostStatusText.textContent = "Đang kiểm tra...";
    try {
        const r = await chrome.runtime.sendMessage({ op: "ping" });
        if (r?.ok) {
            hostIndicator.className = "status-dot green";
            hostStatusText.textContent = "✓ Đã kết nối với MyDM Desktop";
            diagVersion.textContent = `v${r.hostVersion || 2}`;
        } else {
            hostIndicator.className = "status-dot red";
            hostStatusText.textContent = "✕ Host không phản hồi";
            diagVersion.textContent = "—";
        }
    } catch (e) {
        hostIndicator.className = "status-dot red";
        hostStatusText.textContent = "✕ Chưa kết nối Native Host";
        diagVersion.textContent = "—";
    }
}

// Load settings
chrome.storage.local
    .get(["mode", "blockDomains", "sessionSites", "enabled"])
    .then((s) => {
        const isEnabled = s.enabled !== undefined ? !!s.enabled : s.mode !== "off";
        const mode = s.mode || (isEnabled ? "auto" : "off");
        masterToggle.checked = isEnabled;

        modeRadios.forEach((r) => {
            r.checked = r.value === mode;
        });

        blockDomains.value = s.blockDomains || "";
        sessionSites.value = s.sessionSites?.join("\n") || "";

        checkHostConnection();
    });

function broadcastEnabled(isEnabled) {
    try {
        chrome.tabs.query({}, (tabs) => {
            for (const t of tabs) {
                if (t.id) {
                    chrome.tabs.sendMessage(t.id, {
                        type: "MYDM_TOGGLE_ENABLED",
                        enabled: isEnabled,
                    }).catch(() => {});
                }
            }
        });
    } catch {}
}

// Master toggle switch
masterToggle.addEventListener("change", async () => {
    const isEnabled = masterToggle.checked;
    const newMode = isEnabled ? "auto" : "off";
    modeRadios.forEach((r) => {
        r.checked = r.value === newMode;
    });

    await chrome.storage.local.set({ mode: newMode, automatic: isEnabled, enabled: isEnabled });
    statusEl.textContent = isEnabled
        ? "Đã bật tự động bắt link và video."
        : "Đã tắt. Chỉ bắt link bằng chuột phải.";
    statusEl.className = "main-status success";
    broadcastEnabled(isEnabled);
});

// Mode radios
modeRadios.forEach((r) => {
    r.addEventListener("change", async () => {
        const mode = r.value;
        const isEnabled = mode !== "off";
        masterToggle.checked = isEnabled;
        await chrome.storage.local.set({ mode, automatic: isEnabled, enabled: isEnabled });
        statusEl.textContent = isEnabled
            ? "Đã lưu chế độ."
            : "Đã tắt. Chỉ bắt link bằng chuột phải.";
        statusEl.className = "main-status success";
        broadcastEnabled(isEnabled);
    });
});

// Ping button
pingBtn.addEventListener("click", (e) => {
    e.preventDefault();
    checkHostConnection();
});

// Save advanced settings
if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
        const mode = [...modeRadios].find((r) => r.checked)?.value || "auto";
        masterToggle.checked = mode !== "off";

        const sessions = sessionSites.value
            .split(/[\n,]+/)
            .map((v) => v.trim().toLowerCase())
            .filter(Boolean);

        await chrome.storage.local.set({
            mode,
            blockDomains: blockDomains.value,
            sessionSites: sessions,
            automatic: mode === "auto",
        });

        statusEl.textContent = "Đã lưu cài đặt.";
        statusEl.className = "main-status success";
    });
}

// Cookie permissions
document.getElementById("grantCookies")?.addEventListener("click", async () => {
    try {
        const granted = await chrome.permissions.request({ permissions: ["cookies"] });
        if (granted) {
            cookieStatus.textContent = "✓ Đã cấp quyền cookie.";
            cookieStatus.style.color = "#107c10";
        }
    } catch (e) {
        cookieStatus.textContent = "✕ " + String(e);
        cookieStatus.style.color = "#d13438";
    }
});

document.getElementById("revokeCookies")?.addEventListener("click", async () => {
    try {
        const removed = await chrome.permissions.remove({ permissions: ["cookies"] });
        if (removed) {
            cookieStatus.textContent = "✓ Đã thu hồi quyền cookie.";
            cookieStatus.style.color = "#107c10";
        }
    } catch (e) {
        cookieStatus.textContent = "✕ " + String(e);
        cookieStatus.style.color = "#d13438";
    }
});
