const HOST = "com.mydm.host";

function native(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST, message, (result) => {
      const e = chrome.runtime.lastError;
      if (e) reject(new Error(e.message));
      else if (!result?.ok) reject(new Error(result?.error || "Host từ chối"));
      else resolve(result);
    });
  });
}

async function status(text) {
  await chrome.storage.local.set({ status: text, statusTime: Date.now() });
}

/**
 * Get cookies for a URL if the user has granted cookie permission for that site.
 * Returns cookie header string or null.
 */
async function getCookiesForUrl(url) {
  try {
    // Check if we have cookies permission
    const hasCookies = await chrome.permissions.contains({
      permissions: ["cookies"],
    });
    if (!hasCookies) return null;

    const settings = await chrome.storage.local.get(["sessionSites"]);
    const sessionSites = settings.sessionSites || [];
    if (sessionSites.length === 0) return null;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return null;
    }

    // Check if this hostname is in the session sites list
    const hostname = parsedUrl.hostname.toLowerCase();
    const matchesSite = sessionSites.some((site) => {
      const s = site.toLowerCase().trim();
      return hostname === s || hostname.endsWith("." + s);
    });
    if (!matchesSite) return null;

    // Check we have host permission for this URL
    const hasHost = await chrome.permissions.contains({
      origins: [parsedUrl.origin + "/*"],
    });
    if (!hasHost) return null;

    // Get cookies
    const cookies = await chrome.cookies.getAll({ url });
    if (!cookies || cookies.length === 0) return null;

    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return null;
  }
}

/**
 * Get referer for a download if applicable.
 * For downloads initiated from a tab, use the tab URL as referer.
 */
async function getRefererForDownload(item) {
  try {
    if (item.referrer) return item.referrer;
    // For onCreated items, try to get from the active tab
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length > 0 && tabs[0].url) {
      const tabUrl = new URL(tabs[0].url);
      if (["http:", "https:"].includes(tabUrl.protocol)) {
        return tabs[0].url;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ── Context menu setup ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mydm",
    title: "Tải link bằng MyDM",
    contexts: ["link"],
    targetUrlPatterns: ["http://*/*", "https://*/*"],
  });
});

// ── Mode 1: Manual context menu ──
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "mydm") return;
  try {
    const url = info.linkUrl;
    const cookies = await getCookiesForUrl(url);
    const referer =
      tab?.url && ["http:", "https:"].includes(new URL(tab.url).protocol)
        ? tab.url
        : null;

    await native({
      op: "add",
      url,
      id: crypto.randomUUID(),
      hold: false,
      cookies: cookies || undefined,
      referer: referer || undefined,
      source: "chrome",
    });
    await status("Đã thêm. Mở ứng dụng MyDM để tải.");
  } catch (e) {
    await status(String(e));
  }
});

// ── Mode 2 & 3: onCreated handler ──
chrome.downloads.onCreated.addListener(async (item) => {
  const settings = await chrome.storage.local.get([
    "mode",
    "allowDomains",
    "blockDomains",
    "allowSubdomains",
  ]);

  // mode: "off" | "ask" | "auto" (default "off")
  const mode = settings.mode || "off";
  if (mode === "off") return;

  if (item.incognito || item.state !== "in_progress" || item.danger !== "safe")
    return;

  let url;
  try {
    url = new URL(item.finalUrl || item.url);
  } catch {
    return;
  }
  if (!["http:", "https:"].includes(url.protocol)) return;

  const hostname = url.hostname.toLowerCase();

  // Check block list first
  const blockDomains = parseDomainList(settings.blockDomains || "");
  if (matchesDomain(hostname, blockDomains, !!settings.allowSubdomains)) return;

  // Check allow list
  const allowDomains = parseDomainList(settings.allowDomains || "");

  // In auto mode, only process if hostname is in allow list (or allow list is empty = allow all)
  if (mode === "auto" && allowDomains.length > 0) {
    if (!matchesDomain(hostname, allowDomains, !!settings.allowSubdomains))
      return;
  }

  // Mode "ask": we cannot truly show a popup from service worker,
  // but we can use the "held" state to let user confirm in MyDM.
  // For "auto" mode with matching domain, proceed directly.
  const shouldHold = mode === "ask";
  const id = crypto.randomUUID();
  let prepared = false,
    cancelled = false;

  try {
    const cookies = await getCookiesForUrl(url.href);
    const referer = await getRefererForDownload(item);

    // Durable HELD/QUEUED task first. Never cancel Chrome before host confirms.
    await native({
      op: "add",
      id,
      url: url.href,
      name: item.filename?.split(/[\\/]/).pop() || "",
      hold: shouldHold || true, // always hold initially for safety
      cookies: cookies || undefined,
      referer: referer || undefined,
      source: "chrome",
    });
    prepared = true;

    const [current] = await chrome.downloads.search({ id: item.id });
    if (!current || current.state !== "in_progress") {
      await native({ op: "cancel", id });
      return;
    }

    if (mode === "ask") {
      // In "ask" mode, keep task as held. User decides in MyDM.
      // Don't cancel Chrome yet — user might choose to keep Chrome.
      await status(
        "Tải đã được ghi nhận. Mở MyDM để xác nhận hoặc hủy. Chrome vẫn đang tải."
      );
      return;
    }

    // Auto mode: cancel Chrome, release MyDM task
    await chrome.downloads.cancel(item.id);
    cancelled = true;

    const [after] = await chrome.downloads.search({ id: item.id });
    if (!after || after.state === "complete") {
      await native({ op: "cancel", id });
      await status("Chrome đã hoàn tất. MyDM không tải thêm.");
      return;
    }

    await native({ op: "resume", id });
    await status("Đã chuyển lượt tải sang MyDM. Giữ ứng dụng MyDM mở.");
  } catch (e) {
    if (prepared && !cancelled) {
      try {
        await native({ op: "cancel", id });
      } catch {}
    }
    await status(
      cancelled
        ? "Chrome đã dừng. Mở MyDM, tìm tác vụ Chờ xác nhận rồi bấm Tiếp tục."
        : `Chưa chuyển tải. Chrome được giữ nguyên. ${String(e)}`
    );
  }
});

// ── Helper: parse domain list ──
function parseDomainList(str) {
  return str
    .split(/[,\s\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

// ── Helper: match domain with optional subdomain support ──
function matchesDomain(hostname, domainList, allowSubdomains) {
  return domainList.some((d) => {
    if (hostname === d) return true;
    if (allowSubdomains && hostname.endsWith("." + d)) return true;
    return false;
  });
}

// ── Message handler for popup and content script ──
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.op === "downloadMedia") {
    (async () => {
      try {
        const stream = message.stream || {};
        const url = stream.url;
        if (!url) return sendResponse({ ok: false, error: "Thiếu URL" });
        const cookies = await getCookiesForUrl(url);
        const referer = stream.referer || null;
        const res = await native({
          op: "add",
          url,
          name: stream.name || "",
          id: crypto.randomUUID(),
          hold: true,
          cookies: cookies || undefined,
          referer: referer || undefined,
          source: "chrome",
          category: stream.category || "Video",
          total: stream.size || undefined,
        });
        await status("Đã gửi yêu cầu tải video đến MyDM.");
        sendResponse({ ok: true, id: res.id });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (message.op === "ping") {
    native({ op: "ping" })
      .then((r) =>
        sendResponse({
          ok: true,
          hostVersion: r.version || 1,
          diagnostics: {
            hostConnected: true,
          },
        })
      )
      .catch((e) =>
        sendResponse({
          ok: false,
          error: String(e),
          diagnostics: {
            hostConnected: false,
          },
        })
      );
    return true;
  }

  if (message.op === "requestCookiePermission") {
    const origins = message.origins || [];
    chrome.permissions
      .request({
        permissions: ["cookies"],
        origins,
      })
      .then((granted) => sendResponse({ ok: granted }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.op === "revokeSitePermission") {
    const origins = message.origins || [];
    chrome.permissions
      .remove({ origins })
      .then((removed) => sendResponse({ ok: removed }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.op === "checkPermissions") {
    (async () => {
      try {
        const hasCookies = await chrome.permissions.contains({
          permissions: ["cookies"],
        });
        sendResponse({ ok: true, hasCookies });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});

// ── Media Sniffing Engine via webRequest (v0.3) ──
let isSniffingEnabled = true;
chrome.storage?.local?.get?.(["mode", "automatic", "enabled"], (res) => {
  if (res) {
    isSniffingEnabled = res.mode !== "off" && res.automatic !== false && res.enabled !== false;
  }
});
chrome.storage?.onChanged?.addListener?.((changes, area) => {
  if (area === "local" && (changes.mode || changes.automatic || changes.enabled)) {
    chrome.storage?.local?.get?.(["mode", "automatic", "enabled"], (res) => {
      if (res) {
        isSniffingEnabled = res.mode !== "off" && res.automatic !== false && res.enabled !== false;
      }
    });
  }
});

if (chrome.webRequest?.onResponseStarted?.addListener) {
  try {
    chrome.webRequest.onResponseStarted.addListener(
      (details) => {
        if (!isSniffingEnabled) return;
        if (!details.tabId || details.tabId < 0) return;
        const url = details.url;
        if (!url || !url.startsWith("http")) return;

        let contentType = "";
        let contentLength = 0;
        for (const h of details.responseHeaders || []) {
          const name = h.name.toLowerCase();
          if (name === "content-type") contentType = h.value.toLowerCase();
          if (name === "content-length") contentLength = parseInt(h.value, 10) || 0;
        }

        const isMedia =
          contentType.startsWith("video/") ||
          contentType.startsWith("audio/") ||
          contentType.includes("application/vnd.apple.mpegurl") ||
          contentType.includes("application/x-mpegurl") ||
          contentType.includes("application/dash+xml") ||
          /\.(mp4|mkv|webm|m4v|flv|ts|m3u8|mp3|m4a|aac)(\?.*)?$/i.test(url);

        if (isMedia) {
          chrome.tabs.sendMessage(details.tabId, {
            type: "MEDIA_DETECTED",
            stream: {
              url,
              mimeType: contentType,
              size: contentLength || undefined,
            },
          }).catch(() => {
            // Tab content script might not be loaded yet
          });
        }
      },
      { urls: ["<all_urls>"] },
      ["responseHeaders"]
    );
  } catch {
    // ignore
  }
}

