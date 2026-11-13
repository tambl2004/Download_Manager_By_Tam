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
  await chrome.storage.local.set({ status: text });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mydm",
    title: "Tải link bằng MyDM",
    contexts: ["link"],
    targetUrlPatterns: ["http://*/*", "https://*/*"],
  });
});
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "mydm") return;
  try {
    await native({
      op: "add",
      url: info.linkUrl,
      id: crypto.randomUUID(),
      hold: false,
    });
    await status("Đã thêm. Mở ứng dụng MyDM để tải.");
  } catch (e) {
    await status(String(e));
  }
});
chrome.downloads.onCreated.addListener(async (item) => {
  const settings = await chrome.storage.local.get(["automatic", "domains"]);
  if (
    !settings.automatic ||
    item.incognito ||
    item.state !== "in_progress" ||
    item.danger !== "safe"
  )
    return;
  let url;
  try {
    url = new URL(item.finalUrl || item.url);
  } catch {
    return;
  }
  if (!["http:", "https:"].includes(url.protocol)) return;
  const domains = (settings.domains || "")
    .split(/[,\s]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!domains.includes(url.hostname.toLowerCase())) return;
  const id = crypto.randomUUID();
  let prepared = false,
    cancelled = false;
  try {
    // Durable HELD task first. Never start a duplicate before Chrome cancellation succeeds.
    await native({
      op: "add",
      id,
      url: url.href,
      name: item.filename?.split(/[\\/]/).pop() || "",
      hold: true,
    });
    prepared = true;
    const [current] = await chrome.downloads.search({ id: item.id });
    if (!current || current.state !== "in_progress") {
      await native({ op: "cancel", id });
      return;
    }
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
        ? "Chrome đã dừng. Mở MyDM, tìm tác vụ Chờ xác nhận Chrome rồi bấm Tiếp tục."
        : `Chưa chuyển tải. Chrome được giữ nguyên nếu chưa hủy. ${String(e)}`,
    );
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.op === "ping") {
    native({ op: "ping" })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});
