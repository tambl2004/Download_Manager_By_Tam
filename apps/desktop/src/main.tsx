import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./style.css";

/* ── Types ── */
type Task = {
    id: string;
    url: string;
    name: string;
    folder: string;
    state: string;
    error: string;
    total: number | null;
    done: number;
    created: number;
    ranges: [number, number][];
    source: string;
    source_host: string;
    content_disposition_name: string | null;
};
type Config = {
    folder: string;
    parallel: number;
    connections: number;
    limit_kib: number;
};

/* ── Helpers ── */
const stateLabels: Record<string, string> = {
    queued: "Đang chờ",
    held: "Chờ xác nhận",
    running: "Đang tải",
    pausing: "Đang dừng…",
    paused: "Tạm dừng",
    completed: "Hoàn thành",
    failed: "Có lỗi",
    cancelled: "Đã hủy",
    cancelling: "Đang hủy…",
};

const bytes = (n: number): string =>
    n < 1024
        ? n + " B"
        : n < 1048576
            ? (n / 1024).toFixed(1) + " KB"
            : n < 1073741824
                ? (n / 1048576).toFixed(2) + " MB"
                : (n / 1073741824).toFixed(2) + " GB";

const formatDate = (ts: number): string => {
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)} giây`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phút ${Math.ceil(seconds % 60)} giây`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h} giờ ${m} phút`;
};

/* File type detection */
type FileCategory = "archive" | "document" | "music" | "video" | "program" | "image" | "other";
const EXT_MAP: Record<string, FileCategory> = {
    zip: "archive", rar: "archive", "7z": "archive", gz: "archive", tar: "archive", bz2: "archive", xz: "archive",
    pdf: "document", doc: "document", docx: "document", xls: "document", xlsx: "document",
    ppt: "document", pptx: "document", txt: "document", csv: "document", rtf: "document",
    mp3: "music", wav: "music", flac: "music", aac: "music", ogg: "music", wma: "music", m4a: "music",
    mp4: "video", mkv: "video", avi: "video", mov: "video", wmv: "video", flv: "video", webm: "video", m4v: "video",
    exe: "program", msi: "program", dmg: "program", deb: "program", rpm: "program", apk: "program", appx: "program",
    jpg: "image", jpeg: "image", png: "image", gif: "image", bmp: "image", svg: "image", webp: "image", ico: "image",
};

const FILE_ICONS: Record<FileCategory, string> = {
    archive: "📦", document: "📄", music: "🎵", video: "🎬",
    program: "⚙️", image: "🖼️", other: "📎",
};

function getFileCategory(name: string): FileCategory {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return EXT_MAP[ext] ?? "other";
}

/* ── Sidebar items ── */
type SidebarFilter =
    | "all"
    | "cat:archive" | "cat:document" | "cat:music" | "cat:program" | "cat:video" | "cat:image" | "cat:other"
    | "running" | "queued" | "paused" | "completed" | "failed" | "held";

const CATEGORY_TREE: { key: SidebarFilter; label: string; icon: string; isChild?: boolean }[] = [
    { key: "all", label: "Tất cả", icon: "📁" },
    { key: "cat:archive", label: "Dữ liệu nén", icon: "📦", isChild: true },
    { key: "cat:document", label: "Tài liệu", icon: "📄", isChild: true },
    { key: "cat:music", label: "Âm nhạc", icon: "🎵", isChild: true },
    { key: "cat:program", label: "Chương trình", icon: "⚙️", isChild: true },
    { key: "cat:video", label: "Video", icon: "🎬", isChild: true },
    { key: "cat:image", label: "Hình ảnh", icon: "🖼️", isChild: true },
];

const STATUS_TREE: { key: SidebarFilter; label: string; icon: string }[] = [
    { key: "running", label: "Đang tải", icon: "🔽" },
    { key: "completed", label: "Đã tải xong", icon: "✅" },
    { key: "queued", label: "Hàng đợi", icon: "📋" },
    { key: "paused", label: "Tạm dừng", icon: "⏸️" },
    { key: "held", label: "Chờ xác nhận", icon: "⏳" },
    { key: "failed", label: "Có lỗi", icon: "❌" },
];

/* ── Main App ── */
function App() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [filter, setFilter] = useState<SidebarFilter>("all");
    const [search, setSearch] = useState("");
    const [config, setConfig] = useState<Config | null>(null);
    const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [rates, setRates] = useState<Record<string, number>>({});
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);

    // Add dialog state
    const [addUrl, setAddUrl] = useState("");
    const [addName, setAddName] = useState("");

    const last = useRef<{ time: number; data: Task[] }>({ time: Date.now(), data: [] });

    const refresh = useCallback(async () => {
        try {
            const list = await invoke<Task[]>("list");
            const now = Date.now();
            const dt = (now - last.current.time) / 1000;
            if (dt > 0) {
                setRates(
                    Object.fromEntries(
                        list.map((t) => [
                            t.id,
                            t.state === "running"
                                ? Math.max(0, (t.done - (last.current.data.find((x) => x.id === t.id)?.done ?? t.done)) / dt)
                                : 0,
                        ])
                    )
                );
            }
            last.current = { time: now, data: list };
            setTasks(list);
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
        }
    }, []);

    useEffect(() => {
        let active = true;
        const tick = async () => {
            await refresh();
            if (active) timer = setTimeout(tick, 800);
        };
        let timer: ReturnType<typeof setTimeout>;
        void tick();
        invoke<Config>("settings")
            .then(setConfig)
            .catch((e) => setMessage({ text: String(e), type: "error" }));
        return () => { active = false; clearTimeout(timer); };
    }, [refresh]);

    // Close context menu on click outside
    useEffect(() => {
        const handler = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener("click", handler);
            return () => document.removeEventListener("click", handler);
        }
    }, [contextMenu]);

    const act = async (id: string, action: string) => {
        if (
            ["delete", "restart"].includes(action) &&
            !confirm(
                action === "delete"
                    ? "Xóa lịch sử và phần tải dở? File đã hoàn tất được giữ lại."
                    : "Xóa phần tải dở và tải lại từ đầu?"
            )
        )
            return;
        try {
            await invoke("action", { id, action });
            await refresh();
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
        }
    };

    const handleAdd = async () => {
        const trimUrl = addUrl.trim();
        const trimName = addName.trim();
        if (!trimUrl) return;
        try {
            await invoke("add", { url: trimUrl, name: trimName });
            setAddUrl("");
            setAddName("");
            setShowAddDialog(false);
            await refresh();
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
        }
    };

    const handleSaveSettings = async () => {
        if (!config) return;
        try {
            await invoke("save_settings", { value: config });
            setMessage({ text: "Đã lưu cấu hình. Kết nối và tốc độ áp dụng cho tác vụ mới.", type: "success" });
            setShowSettings(false);
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
        }
    };

    /* Filter tasks */
    const filteredTasks = tasks.filter((t) => {
        const matchSearch = t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase());
        if (!matchSearch) return false;
        if (filter === "all") return true;
        if (filter.startsWith("cat:")) {
            const cat = filter.slice(4) as FileCategory;
            return getFileCategory(t.name) === cat;
        }
        return t.state === filter;
    });

    const selectedTask = tasks.find((t) => t.id === selectedId);

    /* Count helpers */
    const countForFilter = (f: SidebarFilter): number => {
        if (f === "all") return tasks.length;
        if (f.startsWith("cat:")) {
            const cat = f.slice(4) as FileCategory;
            return tasks.filter((t) => getFileCategory(t.name) === cat).length;
        }
        return tasks.filter((t) => t.state === f).length;
    };

    const totalSpeed = Object.values(rates).reduce((a, b) => a + b, 0);
    const activeCount = tasks.filter((t) => t.state === "running").length;

    /* Source label */
    const sourceLabel = (t: Task) => {
        if (t.source === "chrome") return "Chrome";
        if (t.source === "manual") return "Thủ công";
        return "—";
    };

    return (
        <div className="app" onClick={() => setContextMenu(null)}>
            {/* ── Menu bar ── */}
            <div className="menubar">
                <button>Công việc</button>
                <button>Tệp tin</button>
                <button>Tải xuống</button>
                <button onClick={() => setShowSidebar(!showSidebar)}>Hiển thị</button>
                <button>Trợ giúp</button>
            </div>

            {/* ── Toolbar ── */}
            <div className="toolbar">
                <button className="toolbar-btn" onClick={() => setShowAddDialog(true)} title="Thêm URL mới">
                    <span className="icon">➕</span>
                    Thêm URL
                </button>

                <button
                    className={`toolbar-btn ${!selectedTask || !["paused", "failed", "held"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "resume")}
                    title="Tiếp tục tải"
                >
                    <span className="icon">▶️</span>
                    Tải tiếp
                </button>

                <button
                    className={`toolbar-btn ${!selectedTask || !["running", "queued", "held"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "pause")}
                    title="Tạm dừng"
                >
                    <span className="icon">⏸️</span>
                    Dừng
                </button>

                <button
                    className={`toolbar-btn ${tasks.filter(t => ["running", "queued", "held"].includes(t.state)).length === 0 ? "disabled" : ""}`}
                    onClick={() => tasks.filter(t => ["running", "queued", "held"].includes(t.state)).forEach(t => void act(t.id, "pause"))}
                    title="Dừng tất cả"
                >
                    <span className="icon">⏹️</span>
                    Dừng tất cả
                </button>

                <div className="toolbar-sep" />

                <button
                    className={`toolbar-btn ${!selectedTask || ["running", "pausing", "cancelling"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "delete")}
                    title="Xóa lịch sử"
                >
                    <span className="icon">🗑️</span>
                    Xóa
                </button>

                <button
                    className={`toolbar-btn ${!selectedTask || !["failed", "paused", "cancelled"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "restart")}
                    title="Tải lại từ đầu"
                >
                    <span className="icon">🔄</span>
                    Tải lại
                </button>

                <div className="toolbar-sep" />

                <button className="toolbar-btn" onClick={() => setShowSettings(true)} title="Tùy chọn">
                    <span className="icon">⚙️</span>
                    Tùy chọn
                </button>

                <button
                    className={`toolbar-btn ${tasks.filter(t => t.state === "paused").length === 0 ? "disabled" : ""}`}
                    onClick={() => tasks.filter(t => t.state === "paused").forEach(t => void act(t.id, "resume"))}
                    title="Tiếp tục tất cả đang tạm dừng"
                >
                    <span className="icon">⏩</span>
                    Bắt đầu …
                </button>

                <div className="toolbar-sep" />

                <button
                    className={`toolbar-btn ${!selectedTask ? "disabled" : ""}`}
                    onClick={() => selectedTask && invoke("open_folder", { id: selectedTask.id }).catch(e => setMessage({ text: String(e), type: "error" }))}
                    title="Mở thư mục chứa tệp"
                >
                    <span className="icon">📂</span>
                    Mở thư mục
                </button>

                {/* Search box */}
                <div className="search-box">
                    <input
                        placeholder="Tìm tên tệp…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Tìm kiếm"
                    />
                </div>
            </div>

            {/* ── Message bar ── */}
            {message && (
                <div className={`message-bar ${message.type}`} role="alert">
                    <span>{message.text}</span>
                    <button onClick={() => setMessage(null)} aria-label="Đóng thông báo">✕</button>
                </div>
            )}

            {/* ── Main content ── */}
            <div className="main">
                {/* Sidebar */}
                {showSidebar && (
                    <div className="sidebar">
                        <div className="sidebar-header">
                            <span>Thể loại</span>
                            <button className="sidebar-close" onClick={() => setShowSidebar(false)} title="Đóng bảng thể loại">✕</button>
                        </div>
                        {CATEGORY_TREE.map((item) => (
                            <div
                                key={item.key}
                                className={`tree-item ${filter === item.key ? "selected" : ""} ${item.isChild ? "tree-child" : ""}`}
                                onClick={() => setFilter(item.key)}
                            >
                                <span className="tree-icon">{item.icon}</span>
                                <span className="tree-label">{item.label}</span>
                                <span className="tree-count">{countForFilter(item.key)}</span>
                            </div>
                        ))}
                        <div className="tree-section">
                            {STATUS_TREE.map((item) => (
                                <div
                                    key={item.key}
                                    className={`tree-item ${filter === item.key ? "selected" : ""}`}
                                    onClick={() => setFilter(item.key)}
                                >
                                    <span className="tree-icon">{item.icon}</span>
                                    <span className="tree-label">{item.label}</span>
                                    <span className="tree-count">{countForFilter(item.key)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Table content */}
                <div className="content">
                    <div className="table-wrapper">
                        {filteredTasks.length > 0 ? (
                            <table className="dl-table">
                                <thead>
                                    <tr>
                                        <th className="col-icon"></th>
                                        <th className="col-name">Tên tệp</th>
                                        <th className="col-size">Kích thước</th>
                                        <th className="col-progress">Tiến trình</th>
                                        <th className="col-status">Trạng thái</th>
                                        <th className="col-speed">Tốc độ</th>
                                        <th className="col-eta">Còn lại</th>
                                        <th className="col-source">Nguồn</th>
                                        <th className="col-date">Ngày tải</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTasks.map((t) => {
                                        const cat = getFileCategory(t.name);
                                        const pct = t.total && t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : (t.state === "completed" ? 100 : 0);
                                        const speed = rates[t.id] ?? 0;
                                        const eta = speed > 0 && t.total ? (t.total - t.done) / speed : 0;
                                        return (
                                            <tr
                                                key={t.id}
                                                className={`row-data ${selectedId === t.id ? "selected" : ""}`}
                                                onClick={() => setSelectedId(t.id)}
                                                onDoubleClick={() => invoke("open_folder", { id: t.id }).catch(e => setMessage({ text: String(e), type: "error" }))}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setSelectedId(t.id);
                                                    setContextMenu({ x: e.clientX, y: e.clientY, taskId: t.id });
                                                }}
                                            >
                                                <td className="col-icon">
                                                    <span className={`file-icon ${cat}`}>{FILE_ICONS[cat]}</span>
                                                </td>
                                                <td className="col-name" title={t.name}>{t.name}</td>
                                                <td className="col-size">{t.total ? bytes(t.total) : "—"}</td>
                                                <td className="col-progress">
                                                    <div className="progress-cell">
                                                        <div className="progress-bar">
                                                            <div
                                                                className={`progress-fill ${t.state}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="progress-text">{t.total ? `${pct}%` : "—"}</span>
                                                    </div>
                                                </td>
                                                <td className="col-status">
                                                    <span className={`status-text ${t.state}`}>{stateLabels[t.state] ?? t.state}</span>
                                                </td>
                                                <td className="col-speed">{speed > 0 ? bytes(speed) + "/s" : ""}</td>
                                                <td className="col-eta">{eta > 0 ? formatETA(eta) : ""}</td>
                                                <td className="col-source" title={t.source_host || ""}>
                                                    <span className={`source-badge ${t.source || "manual"}`}>
                                                        {t.source === "chrome" ? "🌐" : "📥"} {sourceLabel(t)}
                                                    </span>
                                                </td>
                                                <td className="col-date">{formatDate(t.created)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">📥</div>
                                {tasks.length === 0 ? (
                                    <>
                                        <p><strong>Sẵn sàng tải xuống</strong></p>
                                        <p>Nhấn <strong>Thêm URL</strong> hoặc gửi link từ tiện ích MyDM trên Chrome.</p>
                                    </>
                                ) : (
                                    <p>Không tìm thấy kết quả phù hợp.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Detail panel for selected task */}
                    {selectedTask && (
                        <div className="detail-panel">
                            <dl className="detail-grid">
                                <dt>Tên tệp:</dt>
                                <dd>{selectedTask.name}</dd>
                                {selectedTask.content_disposition_name && selectedTask.content_disposition_name !== selectedTask.name && (
                                    <>
                                        <dt>Tên gốc (server):</dt>
                                        <dd>{selectedTask.content_disposition_name}</dd>
                                    </>
                                )}
                                <dt>Trạng thái:</dt>
                                <dd className={`status-text ${selectedTask.state}`}>
                                    {stateLabels[selectedTask.state]}
                                    {selectedTask.state === "held" && " — Bấm Tiếp tục để bắt đầu tải hoặc Hủy để từ chối."}
                                </dd>
                                <dt>Kích thước:</dt>
                                <dd>{selectedTask.total ? bytes(selectedTask.total) : "Chưa rõ"}</dd>
                                <dt>Đã tải được:</dt>
                                <dd>{bytes(selectedTask.done)} {selectedTask.total ? `(${Math.round((selectedTask.done / selectedTask.total) * 100)}%)` : ""}</dd>
                                <dt>Tốc độ:</dt>
                                <dd>{(rates[selectedTask.id] ?? 0) > 0 ? bytes(rates[selectedTask.id]) + "/s" : "—"}</dd>
                                <dt>Số kết nối:</dt>
                                <dd>{selectedTask.ranges.length || 1} phần</dd>
                                <dt>Nguồn:</dt>
                                <dd>
                                    {sourceLabel(selectedTask)}
                                    {selectedTask.source_host && ` — ${selectedTask.source_host}`}
                                </dd>
                                <dt>Thư mục:</dt>
                                <dd>{selectedTask.folder}</dd>
                                {selectedTask.error && selectedTask.state === "failed" && (
                                    <>
                                        <dt>Lỗi:</dt>
                                        <dd style={{ color: "var(--danger)" }}>{selectedTask.error}</dd>
                                    </>
                                )}
                            </dl>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Status bar ── */}
            <div className="statusbar">
                <div className="statusbar-left">
                    <span>{filteredTasks.length} tệp{filter !== "all" ? ` (lọc từ ${tasks.length})` : ""}</span>
                    <span>{activeCount} đang tải</span>
                </div>
                <div className="statusbar-right">
                    {totalSpeed > 0 && <span>Tổng tốc độ: {bytes(totalSpeed)}/s</span>}
                    <span>MyDM 0.2</span>
                </div>
            </div>

            {/* ── Context menu ── */}
            {contextMenu && (() => {
                const t = tasks.find(t => t.id === contextMenu.taskId);
                if (!t) return null;
                return (
                    <div
                        className="context-menu"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className={`context-menu-item ${!["paused", "failed", "held"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "resume"); setContextMenu(null); }}
                        >
                            ▶️ Tiếp tục
                        </div>
                        <div
                            className={`context-menu-item ${!["running", "queued", "held"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "pause"); setContextMenu(null); }}
                        >
                            ⏸️ Tạm dừng
                        </div>
                        <div
                            className={`context-menu-item ${!["running", "queued", "held", "paused", "failed"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "cancel"); setContextMenu(null); }}
                        >
                            ⏹️ Hủy bỏ
                        </div>
                        <div className="context-menu-sep" />
                        <div
                            className={`context-menu-item ${!["failed", "paused", "cancelled"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "restart"); setContextMenu(null); }}
                        >
                            🔄 Tải lại từ đầu
                        </div>
                        <div className="context-menu-sep" />
                        <div
                            className="context-menu-item"
                            onClick={() => {
                                invoke("open_folder", { id: t.id }).catch(e => setMessage({ text: String(e), type: "error" }));
                                setContextMenu(null);
                            }}
                        >
                            📂 Mở thư mục
                        </div>
                        <div className="context-menu-sep" />
                        <div
                            className={`context-menu-item ${["running", "pausing", "cancelling"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "delete"); setContextMenu(null); }}
                        >
                            🗑️ Xóa lịch sử
                        </div>
                    </div>
                );
            })()}

            {/* ── Add URL Dialog ── */}
            {showAddDialog && (
                <div className="modal-overlay" onClick={() => setShowAddDialog(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span>Thêm tải xuống mới</span>
                            <button className="modal-close" onClick={() => setShowAddDialog(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>URL tải xuống</label>
                                <input
                                    autoFocus
                                    placeholder="https://example.com/file.zip"
                                    value={addUrl}
                                    onChange={(e) => setAddUrl(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Tên tệp (tùy chọn — để trống sẽ lấy từ server)</label>
                                <input
                                    placeholder="Để trống sẽ lấy tên từ Content-Disposition hoặc URL"
                                    value={addName}
                                    onChange={(e) => setAddName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                                />
                            </div>
                            {config && (
                                <div className="form-group">
                                    <label>Lưu vào thư mục</label>
                                    <input value={config.folder} disabled style={{ background: "#f5f5f5" }} />
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn" onClick={() => setShowAddDialog(false)}>Hủy</button>
                            <button className="btn btn-primary" onClick={handleAdd}>Bắt đầu tải xuống</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Settings Dialog ── */}
            {showSettings && config && (
                <div className="modal-overlay" onClick={() => setShowSettings(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span>Tùy chọn</span>
                            <button className="modal-close" onClick={() => setShowSettings(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="settings-grid">
                                <label>Thư mục lưu:</label>
                                <input
                                    value={config.folder}
                                    onChange={(e) => setConfig({ ...config, folder: e.target.value })}
                                />
                                <label>Tệp đồng thời:</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={6}
                                    value={config.parallel}
                                    onChange={(e) => setConfig({ ...config, parallel: Number(e.target.value) })}
                                />
                                <label>Kết nối/tệp:</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={8}
                                    value={config.connections}
                                    onChange={(e) => setConfig({ ...config, connections: Number(e.target.value) })}
                                />
                                <label>Giới hạn KiB/s:</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={1000000}
                                    value={config.limit_kib}
                                    onChange={(e) => setConfig({ ...config, limit_kib: Number(e.target.value) })}
                                />
                            </div>
                            <p style={{ fontSize: "11px", color: "#888", marginTop: "8px" }}>
                                0 = không giới hạn tốc độ. Cấu hình áp dụng cho tác vụ mới.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn" onClick={() => setShowSettings(false)}>Hủy</button>
                            <button className="btn btn-primary" onClick={handleSaveSettings}>Lưu cấu hình</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<App />);
