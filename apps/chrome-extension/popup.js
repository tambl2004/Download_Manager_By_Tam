const status = document.getElementById("status"),
  auto = document.getElementById("automatic"),
  domains = document.getElementById("domains");
chrome.storage.local.get(["automatic", "domains", "status"]).then((s) => {
  auto.checked = !!s.automatic;
  domains.value = s.domains || "";
  status.textContent = s.status || "Chưa kiểm tra kết nối";
});
document.getElementById("save").onclick = async () => {
  await chrome.storage.local.set({
    automatic: auto.checked,
    domains: domains.value,
  });
  status.textContent =
    "Đã lưu. Tên miền phải khớp chính xác, không gồm https:// hoặc đường dẫn.";
};
document.getElementById("ping").onclick = async () => {
  try {
    const r = await chrome.runtime.sendMessage({ op: "ping" });
    status.textContent = r?.ok
      ? "Native host hoạt động. Mở MyDM để xử lý hàng đợi."
      : r?.error || "Không có phản hồi";
  } catch (e) {
    status.textContent = String(e);
  }
};
