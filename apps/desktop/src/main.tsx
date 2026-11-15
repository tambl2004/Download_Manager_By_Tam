import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { Icon, addCollection } from "@iconify/react";
import fluentColorIcons from "@iconify-json/fluent-color/icons.json";
import "./style.css";

// Nạp dữ liệu Fluent UI System Color Icons hoàn toàn offline
addCollection({
    ...(fluentColorIcons as any),
    aliases: {
        ...((fluentColorIcons as any).aliases || {}),
        "folder-24": { parent: "document-folder-24" },
        "settings-24": { parent: "settings-24" },
    },
});

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

const FILE_ICONS: Record<FileCategory, { icon?: string; img?: string }> = {
    archive: { img: "/icons/Archive_Folder.png" },
    document: { img: "/icons/Document.png" },
    music: { img: "/icons/Music.png" },
    video: { img: "/icons/Video.png" },
    program: { img: "/icons/Services.png" },
    image: { img: "/icons/Image_File.png" },
    other: { img: "/icons/File.png" },
};

function getFileCategory(name: string): FileCategory {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return EXT_MAP[ext] ?? "other";
}

/* ── Sidebar items ── */
type SidebarFilter =
    | "all"
    | "cat:archive" | "cat:document" | "cat:music" | "cat:program" | "cat:video"
    | "unfinished"
    | "unfinished:archive" | "unfinished:document" | "unfinished:music" | "unfinished:program" | "unfinished:video"
    | "completed"
    | "completed:archive" | "completed:document" | "completed:music" | "completed:program" | "completed:video"
    | "grabber"
    | "queue"
    | "queue:main"
    | "queue:sync";

const SUB_CATEGORIES = [
    { key: "archive" as const, label: "Dữ liệu nén", img: "/icons/Archive_Folder.png" },
    { key: "document" as const, label: "Tài liệu", img: "/icons/Document.png" },
    { key: "music" as const, label: "Âm nhạc", img: "/icons/Music.png" },
    { key: "program" as const, label: "Chương trình", img: "/icons/Services.png" },
    { key: "video" as const, label: "Video", img: "/icons/Video.png" },
];

/* ── Main App ── */
function App() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [filter, setFilter] = useState<SidebarFilter>("all");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        all: true,
        unfinished: false,
        completed: false,
        queue: false,
    });
    const toggleExpand = (key: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
    };
    const [config, setConfig] = useState<Config | null>(null);
    const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [rates, setRates] = useState<Record<string, number>>({});
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [showToolbar, setShowToolbar] = useState(true);
    const [showStatusbar, setShowStatusbar] = useState(true);
    const [activeMenu, setActiveMenu] = useState<"job" | "file" | "download" | "view" | null>(null);
    const [speedLimiterEnabled, setSpeedLimiterEnabled] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Close menubar dropdown menu on click outside or Escape
    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".menubar")) {
                setActiveMenu(null);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setActiveMenu(null);
            }
        };
        window.addEventListener("click", handleGlobalClick);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("click", handleGlobalClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

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

    const exportUrls = (format: "ef2" | "txt") => {
        const urls = tasks.map(t => t.url).filter(Boolean);
        if (urls.length === 0) {
            setMessage({ text: "Không có liên kết nào để xuất", type: "error" });
            return;
        }
        let content = "";
        if (format === "ef2") {
            content = tasks.map(t => `<${t.url}>\r\nfile: ${t.name}\r\n`).join("\r\n");
        } else {
            content = urls.join("\r\n");
        }
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = format === "ef2" ? "mydm_export.ef2" : "mydm_export.txt";
        a.click();
        URL.revokeObjectURL(url);
        setMessage({
            text: format === "ef2" ? "Đã xuất ra tệp tin kết xuất IDM (.ef2)" : "Đã xuất ra tệp văn bản (.txt)",
            type: "success"
        });
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            const urls: string[] = [];
            for (const line of lines) {
                const m = line.match(/<([^>]+)>/) || line.match(/^(https?:\/\/[^\s]+)/i);
                if (m) urls.push(m[1]);
            }
            if (urls.length > 0) {
                setAddUrl(urls[0]);
                setShowAddDialog(true);
                setMessage({ text: `Đã đọc ${urls.length} liên kết từ tệp`, type: "success" });
            } else {
                setMessage({ text: "Không tìm thấy liên kết hợp lệ trong tệp", type: "error" });
            }
        } catch (err) {
            setMessage({ text: String(err), type: "error" });
        }
        e.target.value = "";
    };

    /* Filter tasks */
    const filteredTasks = tasks.filter((t) => {
        if (filter === "all") return true;
        if (filter.startsWith("cat:")) {
            return getFileCategory(t.name) === filter.slice(4);
        }
        if (filter === "unfinished") {
            return t.state !== "completed";
        }
        if (filter.startsWith("unfinished:")) {
            return t.state !== "completed" && getFileCategory(t.name) === filter.slice(11);
        }
        if (filter === "completed") {
            return t.state === "completed";
        }
        if (filter.startsWith("completed:")) {
            return t.state === "completed" && getFileCategory(t.name) === filter.slice(10);
        }
        if (filter === "grabber") {
            return t.source === "grabber";
        }
        if (filter === "queue") {
            return t.state === "queued" || t.state === "held";
        }
        if (filter === "queue:main") {
            return t.state === "queued";
        }
        if (filter === "queue:sync") {
            return t.state === "held";
        }
        return true;
    });

    const selectedTask = tasks.find((t) => t.id === selectedId);

    /* Count helpers */
    const countForFilter = (f: SidebarFilter): number => {
        if (f === "all") return tasks.length;
        if (f.startsWith("cat:")) {
            return tasks.filter((t) => getFileCategory(t.name) === f.slice(4)).length;
        }
        if (f === "unfinished") {
            return tasks.filter((t) => t.state !== "completed").length;
        }
        if (f.startsWith("unfinished:")) {
            return tasks.filter((t) => t.state !== "completed" && getFileCategory(t.name) === f.slice(11)).length;
        }
        if (f === "completed") {
            return tasks.filter((t) => t.state === "completed").length;
        }
        if (f.startsWith("completed:")) {
            return tasks.filter((t) => t.state === "completed" && getFileCategory(t.name) === f.slice(10)).length;
        }
        if (f === "grabber") {
            return tasks.filter((t) => t.source === "grabber").length;
        }
        if (f === "queue") {
            return tasks.filter((t) => t.state === "queued" || t.state === "held").length;
        }
        if (f === "queue:main") {
            return tasks.filter((t) => t.state === "queued").length;
        }
        if (f === "queue:sync") {
            return tasks.filter((t) => t.state === "held").length;
        }
        return 0;
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
            {/* Hidden file input for importing task lists */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportFile}
                accept=".txt,.ef2"
                style={{ display: "none" }}
            />
            {/* ── Menu bar (Clean white, classic Win32 IDM) ── */}
            <div className="menubar">
                <div className="menubar-items">
                    {/* Menu: Công việc */}
                    <div className="menubar-menu-wrapper">
                        <button
                            className={`menubar-menu-btn ${activeMenu === "job" ? "active" : ""}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(activeMenu === "job" ? null : "job");
                            }}
                            onMouseEnter={() => {
                                if (activeMenu !== null) setActiveMenu("job");
                            }}
                        >
                            Công việc
                        </button>
                        {activeMenu === "job" && (
                            <div className="menubar-dropdown">
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setShowAddDialog(true);
                                        setActiveMenu(null);
                                    }}
                                >
                                    Thêm tải xuống
                                </div>
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setShowAddDialog(true);
                                        setActiveMenu(null);
                                    }}
                                >
                                    Tải xuống hàng loạt
                                </div>
                                <div
                                    className="menubar-menu-item"
                                    onClick={async () => {
                                        setActiveMenu(null);
                                        try {
                                            const text = await navigator.clipboard.readText();
                                            if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
                                                setAddUrl(text);
                                                setShowAddDialog(true);
                                            } else {
                                                setShowAddDialog(true);
                                            }
                                        } catch {
                                            setShowAddDialog(true);
                                        }
                                    }}
                                >
                                    Tải hàng loạt liên kết trong clipboard
                                </div>
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setFilter("grabber");
                                        setActiveMenu(null);
                                    }}
                                >
                                    Chạy Grabber
                                </div>
                                <div className="menubar-menu-divider" />
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setMessage({ text: "Hộp thả liên kết đang được bật", type: "success" });
                                        setActiveMenu(null);
                                    }}
                                >
                                    Hiện hộp thả liên kết
                                </div>
                                <div className="menubar-menu-divider" />
                                <div className="menubar-menu-item menubar-has-sub">
                                    <span>Xuất dữ liệu</span>
                                    <span className="menu-arrow">▸</span>
                                    <div className="menubar-submenu">
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                exportUrls("ef2");
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Ra tệp tin kết xuất IDM
                                        </div>
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                exportUrls("txt");
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Ra tệp văn bản
                                        </div>
                                    </div>
                                </div>
                                <div className="menubar-menu-item menubar-has-sub">
                                    <span>Nhập dữ liệu</span>
                                    <span className="menu-arrow">▸</span>
                                    <div className="menubar-submenu">
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                fileInputRef.current?.click();
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Từ tệp tin kết xuất IDM
                                        </div>
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                fileInputRef.current?.click();
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Từ tệp văn bản
                                        </div>
                                    </div>
                                </div>
                                <div className="menubar-menu-divider" />
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setActiveMenu(null);
                                        window.close();
                                    }}
                                >
                                    Thoát
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Menu: Tệp tin */}
                    <div className="menubar-menu-wrapper">
                        <button
                            className={`menubar-menu-btn ${activeMenu === "file" ? "active" : ""}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(activeMenu === "file" ? null : "file");
                            }}
                            onMouseEnter={() => {
                                if (activeMenu !== null) setActiveMenu("file");
                            }}
                        >
                            Tệp tin
                        </button>
                        {activeMenu === "file" && (
                            <div className="menubar-dropdown">
                                <div
                                    className={`menubar-menu-item ${!selectedTask || !["running", "queued", "held"].includes(selectedTask.state) ? "disabled" : ""}`}
                                    onClick={() => {
                                        if (selectedTask) act(selectedTask.id, "pause");
                                        setActiveMenu(null);
                                    }}
                                >
                                    Dừng tải
                                </div>
                                <div
                                    className={`menubar-menu-item ${!selectedTask ? "disabled" : ""}`}
                                    onClick={() => {
                                        if (selectedTask) act(selectedTask.id, "delete");
                                        setActiveMenu(null);
                                    }}
                                >
                                    Xóa
                                </div>
                                <div
                                    className={`menubar-menu-item ${!selectedTask || !["paused", "failed", "held"].includes(selectedTask.state) ? "disabled" : ""}`}
                                    onClick={() => {
                                        if (selectedTask) act(selectedTask.id, "resume");
                                        setActiveMenu(null);
                                    }}
                                >
                                    Tải xuống ngay
                                </div>
                                <div
                                    className={`menubar-menu-item ${!selectedTask || !["failed", "paused", "cancelled", "completed"].includes(selectedTask.state) ? "disabled" : ""}`}
                                    onClick={() => {
                                        if (selectedTask) act(selectedTask.id, "restart");
                                        setActiveMenu(null);
                                    }}
                                >
                                    Tải lại
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Menu: Tải xuống */}
                    <div className="menubar-menu-wrapper">
                        <button
                            className={`menubar-menu-btn ${activeMenu === "download" ? "active" : ""}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(activeMenu === "download" ? null : "download");
                            }}
                            onMouseEnter={() => {
                                if (activeMenu !== null) setActiveMenu("download");
                            }}
                        >
                            Tải xuống
                        </button>
                        {activeMenu === "download" && (
                            <div className="menubar-dropdown">
                                <div
                                    className={`menubar-menu-item ${tasks.filter(t => ["running", "queued", "held"].includes(t.state)).length === 0 ? "disabled" : ""}`}
                                    onClick={() => {
                                        tasks.filter(t => ["running", "queued", "held"].includes(t.state)).forEach(t => void act(t.id, "pause"));
                                        setActiveMenu(null);
                                    }}
                                >
                                    Tạm dừng tất cả
                                </div>
                                <div
                                    className={`menubar-menu-item ${tasks.filter(t => ["running", "queued", "held"].includes(t.state)).length === 0 ? "disabled" : ""}`}
                                    onClick={() => {
                                        tasks.filter(t => ["running", "queued", "held"].includes(t.state)).forEach(t => void act(t.id, "pause"));
                                        setActiveMenu(null);
                                    }}
                                >
                                    Dừng tất cả
                                </div>
                                <div className="menubar-menu-divider" />
                                <div
                                    className={`menubar-menu-item ${tasks.filter(t => t.state === "completed").length === 0 ? "disabled" : ""}`}
                                    onClick={() => {
                                        tasks.filter(t => t.state === "completed").forEach(t => void act(t.id, "delete"));
                                        setActiveMenu(null);
                                    }}
                                >
                                    Xóa tất cả các mục tải xong
                                </div>
                                <div className="menubar-menu-divider" />
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setMessage({ text: "Tìm kiếm tệp tải xuống", type: "success" });
                                        setActiveMenu(null);
                                    }}
                                >
                                    Tìm kiếm (Ctrl-F)
                                </div>
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setActiveMenu(null);
                                    }}
                                >
                                    Tìm tiếp (F3)
                                </div>
                                <div className="menubar-menu-divider" />
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setMessage({ text: "Lập lịch tải tự động", type: "success" });
                                        setActiveMenu(null);
                                    }}
                                >
                                    Lập lịch
                                </div>
                                <div className="menubar-menu-item menubar-has-sub">
                                    <span>Bắt đầu danh sách chờ tải</span>
                                    <span className="menu-arrow">▸</span>
                                    <div className="menubar-submenu">
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                tasks.filter(t => t.state === "paused" || t.state === "queued").forEach(t => void act(t.id, "resume"));
                                                setMessage({ text: "Đã bắt đầu Danh sách chờ tải chính", type: "success" });
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Bắt đầu Danh sách chờ tải chính
                                        </div>
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                tasks.filter(t => t.state === "held").forEach(t => void act(t.id, "resume"));
                                                setMessage({ text: "Đã bắt đầu Đồng bộ danh sách chờ tải", type: "success" });
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Bắt đầu Đồng bộ danh sách chờ tải
                                        </div>
                                    </div>
                                </div>
                                <div className="menubar-menu-item menubar-has-sub">
                                    <span>Dừng danh sách chờ tải</span>
                                    <span className="menu-arrow">▸</span>
                                    <div className="menubar-submenu">
                                        <div
                                            className={`menubar-menu-item ${tasks.filter(t => t.state === "running").length === 0 ? "disabled" : ""}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                tasks.filter(t => t.state === "running").forEach(t => void act(t.id, "pause"));
                                                setMessage({ text: "Đã dừng Danh sách chờ tải chính", type: "success" });
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Dừng Danh sách chờ tải chính
                                        </div>
                                        <div
                                            className={`menubar-menu-item ${tasks.filter(t => t.state === "running" && t.source === "chrome").length === 0 ? "disabled" : ""}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                tasks.filter(t => t.state === "running" && t.source === "chrome").forEach(t => void act(t.id, "pause"));
                                                setMessage({ text: "Đã dừng Đồng bộ danh sách chờ tải", type: "success" });
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Dừng Đồng bộ danh sách chờ tải
                                        </div>
                                    </div>
                                </div>
                                <div className="menubar-menu-divider" />
                                <div className="menubar-menu-item menubar-has-sub">
                                    <span>Tính năng hạn chế tốc độ</span>
                                    <span className="menu-arrow">▸</span>
                                    <div className="menubar-submenu">
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSpeedLimiterEnabled(true);
                                                setMessage({ text: "Đã bật tính năng hạn chế tốc độ", type: "success" });
                                                setActiveMenu(null);
                                            }}
                                        >
                                            {speedLimiterEnabled && <span className="menu-bullet">•</span>}
                                            <span>Bật</span>
                                        </div>
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSpeedLimiterEnabled(false);
                                                setMessage({ text: "Đã tắt tính năng hạn chế tốc độ", type: "success" });
                                                setActiveMenu(null);
                                            }}
                                        >
                                            {!speedLimiterEnabled && <span className="menu-bullet">•</span>}
                                            <span>Tắt</span>
                                        </div>
                                        <div className="menubar-menu-divider" />
                                        <div
                                            className="menubar-menu-item"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowSettings(true);
                                                setActiveMenu(null);
                                            }}
                                        >
                                            Thiết lập...
                                        </div>
                                    </div>
                                </div>
                                <div className="menubar-menu-divider" />
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setShowSettings(true);
                                        setActiveMenu(null);
                                    }}
                                >
                                    Tùy chọn
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Menu: Hiển thị */}
                    <div className="menubar-menu-wrapper">
                        <button
                            className={`menubar-menu-btn ${activeMenu === "view" ? "active" : ""}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(activeMenu === "view" ? null : "view");
                            }}
                            onMouseEnter={() => {
                                if (activeMenu !== null) setActiveMenu("view");
                            }}
                        >
                            Hiển thị
                        </button>
                        {activeMenu === "view" && (
                            <div className="menubar-dropdown">
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setShowSidebar(prev => !prev);
                                        setActiveMenu(null);
                                    }}
                                >
                                    {showSidebar && <span className="menu-check">✓</span>}
                                    <span>Cây thể loại</span>
                                </div>
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setShowToolbar(prev => !prev);
                                        setActiveMenu(null);
                                    }}
                                >
                                    {showToolbar && <span className="menu-check">✓</span>}
                                    <span>Thanh công cụ</span>
                                </div>
                                <div
                                    className="menubar-menu-item"
                                    onClick={() => {
                                        setShowStatusbar(prev => !prev);
                                        setActiveMenu(null);
                                    }}
                                >
                                    {showStatusbar && <span className="menu-check">✓</span>}
                                    <span>Thanh trạng thái</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Toolbar ── */}
            {showToolbar && (
            <div className="toolbar">
                <button className="toolbar-btn" onClick={() => setShowAddDialog(true)} title="Thêm URL mới">
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Plus.png" alt="add" />
                    </span>
                    Thêm URL
                </button>

                <button
                    className={`toolbar-btn ${!selectedTask || !["paused", "failed", "held"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "resume")}
                    title="Tiếp tục tải"
                >
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Download.png" alt="download" />
                    </span>
                    Tải tiếp
                </button>

                <button
                    className={`toolbar-btn ${!selectedTask || !["running", "queued", "held"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "pause")}
                    title="Tạm dừng"
                >
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Stop.png" alt="pause" />
                    </span>
                    Dừng
                </button>

                <button
                    className={`toolbar-btn ${tasks.filter(t => ["running", "queued", "held"].includes(t.state)).length === 0 ? "disabled" : ""}`}
                    onClick={() => tasks.filter(t => ["running", "queued", "held"].includes(t.state)).forEach(t => void act(t.id, "pause"))}
                    title="Dừng tất cả"
                >
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Cancel.png" alt="stop all" />
                    </span>
                    Dừng tất cả
                </button>

                <div className="toolbar-sep" />

                <button
                    className={`toolbar-btn ${!selectedTask || ["running", "pausing", "cancelling"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "delete")}
                    title="Xóa lịch sử"
                >
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Trash_Can.png" alt="delete" />
                    </span>
                    Xóa
                </button>

                <button
                    className={`toolbar-btn ${!selectedTask || !["failed", "paused", "cancelled"].includes(selectedTask.state) ? "disabled" : ""}`}
                    onClick={() => selectedTask && act(selectedTask.id, "restart")}
                    title="Tải lại từ đầu"
                >
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Restart.png" alt="restart" />
                    </span>
                    Tải lại
                </button>

                <div className="toolbar-sep" />

                <button className="toolbar-btn" onClick={() => setShowSettings(true)} title="Tùy chọn">
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Settings.png" alt="settings" />
                    </span>
                    Tùy chọn
                </button>

                <button
                    className={`toolbar-btn ${tasks.filter(t => t.state === "paused").length === 0 ? "disabled" : ""}`}
                    onClick={() => tasks.filter(t => t.state === "paused").forEach(t => void act(t.id, "resume"))}
                    title="Tiếp tục tất cả đang tạm dừng"
                >
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Synchronize.png" alt="start all" />
                    </span>
                    Bắt đầu …
                </button>

                <div className="toolbar-sep" />

                <button
                    className={`toolbar-btn ${!selectedTask ? "disabled" : ""}`}
                    onClick={() => selectedTask && invoke("open_folder", { id: selectedTask.id }).catch(e => setMessage({ text: String(e), type: "error" }))}
                    title="Mở thư mục chứa tệp"
                >
                    <span className="icon">
                        <img width="80" height="80" src="/icons/Opened_Folder.png" alt="open folder" />
                    </span>
                    Mở thư mục
                </button>
            </div>
            )}

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
                        <div className="tree-container">
                            {/* 1. Tất cả */}
                            <div className="tree-node is-first-root">
                                <div
                                    className={`tree-item ${filter === "all" ? "selected" : ""}`}
                                    onClick={() => setFilter("all")}
                                >
                                    <span
                                        className="tree-toggle"
                                        onClick={(e) => toggleExpand("all", e)}
                                        title={expanded.all ? "Thu gọn" : "Mở rộng"}
                                    >
                                        {expanded.all ? "−" : "+"}
                                    </span>
                                    <span className="tree-icon">
                                        <img src="/icons/Opened_Folder.png" alt="Tất cả" />
                                    </span>
                                    <span className="tree-label">Tất cả</span>
                                    <span className="tree-count">{countForFilter("all")}</span>
                                </div>

                                {expanded.all && (
                                    <div className="tree-sub-group">
                                        {SUB_CATEGORIES.map((sub, idx) => (
                                            <div
                                                key={sub.key}
                                                className={`tree-item tree-sub-row ${idx === SUB_CATEGORIES.length - 1 ? "is-last" : ""} ${filter === `cat:${sub.key}` ? "selected" : ""}`}
                                                onClick={() => setFilter(`cat:${sub.key}` as SidebarFilter)}
                                            >
                                                <span className="tree-icon">
                                                    <img src={sub.img} alt={sub.label} />
                                                </span>
                                                <span className="tree-label">{sub.label}</span>
                                                <span className="tree-count">{countForFilter(`cat:${sub.key}` as SidebarFilter)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 2. Chưa tải xong */}
                            <div className="tree-node">
                                <div
                                    className={`tree-item ${filter === "unfinished" ? "selected" : ""}`}
                                    onClick={() => setFilter("unfinished")}
                                >
                                    <span
                                        className="tree-toggle"
                                        onClick={(e) => toggleExpand("unfinished", e)}
                                        title={expanded.unfinished ? "Thu gọn" : "Mở rộng"}
                                    >
                                        {expanded.unfinished ? "−" : "+"}
                                    </span>
                                    <span className="tree-icon">
                                        <img src="/icons/Downloads_Folder.png" alt="Chưa tải xong" />
                                    </span>
                                    <span className="tree-label">Chưa tải xong</span>
                                    <span className="tree-count">{countForFilter("unfinished")}</span>
                                </div>

                                {expanded.unfinished && (
                                    <div className="tree-sub-group">
                                        {SUB_CATEGORIES.map((sub, idx) => (
                                            <div
                                                key={sub.key}
                                                className={`tree-item tree-sub-row ${idx === SUB_CATEGORIES.length - 1 ? "is-last" : ""} ${filter === `unfinished:${sub.key}` ? "selected" : ""}`}
                                                onClick={() => setFilter(`unfinished:${sub.key}` as SidebarFilter)}
                                            >
                                                <span className="tree-icon">
                                                    <img src={sub.img} alt={sub.label} />
                                                </span>
                                                <span className="tree-label">{sub.label}</span>
                                                <span className="tree-count">{countForFilter(`unfinished:${sub.key}` as SidebarFilter)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 3. Đã tải xong */}
                            <div className="tree-node">
                                <div
                                    className={`tree-item ${filter === "completed" ? "selected" : ""}`}
                                    onClick={() => setFilter("completed")}
                                >
                                    <span
                                        className="tree-toggle"
                                        onClick={(e) => toggleExpand("completed", e)}
                                        title={expanded.completed ? "Thu gọn" : "Mở rộng"}
                                    >
                                        {expanded.completed ? "−" : "+"}
                                    </span>
                                    <span className="tree-icon">
                                        <img src="/icons/Check_Mark.png" alt="Đã tải xong" />
                                    </span>
                                    <span className="tree-label">Đã tải xong</span>
                                    <span className="tree-count">{countForFilter("completed")}</span>
                                </div>

                                {expanded.completed && (
                                    <div className="tree-sub-group">
                                        {SUB_CATEGORIES.map((sub, idx) => (
                                            <div
                                                key={sub.key}
                                                className={`tree-item tree-sub-row ${idx === SUB_CATEGORIES.length - 1 ? "is-last" : ""} ${filter === `completed:${sub.key}` ? "selected" : ""}`}
                                                onClick={() => setFilter(`completed:${sub.key}` as SidebarFilter)}
                                            >
                                                <span className="tree-icon">
                                                    <img src={sub.img} alt={sub.label} />
                                                </span>
                                                <span className="tree-label">{sub.label}</span>
                                                <span className="tree-count">{countForFilter(`completed:${sub.key}` as SidebarFilter)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 4. Grabber Project */}
                            <div className="tree-node">
                                <div
                                    className={`tree-item tree-leaf-row ${filter === "grabber" ? "selected" : ""}`}
                                    onClick={() => setFilter("grabber")}
                                >
                                    <span className="tree-icon">
                                        <img src="/icons/Internet.png" alt="Grabber Project" />
                                    </span>
                                    <span className="tree-label">Grabber Project</span>
                                    <span className="tree-count">{countForFilter("grabber")}</span>
                                </div>
                            </div>

                            {/* 5. Danh sách chờ tải */}
                            <div className="tree-node is-last-root">
                                <div
                                    className={`tree-item ${filter === "queue" ? "selected" : ""}`}
                                    onClick={() => setFilter("queue")}
                                >
                                    <span
                                        className="tree-toggle"
                                        onClick={(e) => toggleExpand("queue", e)}
                                        title={expanded.queue ? "Thu gọn" : "Mở rộng"}
                                    >
                                        {expanded.queue ? "−" : "+"}
                                    </span>
                                    <span className="tree-icon">
                                        <img src="/icons/Opened_Folder.png" alt="Danh sách chờ tải" />
                                    </span>
                                    <span className="tree-label">Danh sách chờ tải</span>
                                    <span className="tree-count">{countForFilter("queue")}</span>
                                </div>

                                {expanded.queue && (
                                    <div className="tree-sub-group">
                                        <div
                                            className={`tree-item tree-sub-row ${filter === "queue:main" ? "selected" : ""}`}
                                            onClick={() => setFilter("queue:main")}
                                        >
                                            <span className="tree-icon">
                                                <img src="/icons/Opened_Folder.png" alt="Danh sách chờ tải chính" />
                                            </span>
                                            <span className="tree-label">Danh sách chờ tải chính</span>
                                            <span className="tree-count">{countForFilter("queue:main")}</span>
                                        </div>
                                        <div
                                            className={`tree-item tree-sub-row is-last ${filter === "queue:sync" ? "selected" : ""}`}
                                            onClick={() => setFilter("queue:sync")}
                                        >
                                            <span className="tree-icon">
                                                <img src="/icons/Downloads_Folder.png" alt="Đồng bộ danh sách chờ tải" />
                                            </span>
                                            <span className="tree-label">Đồng bộ danh sách chờ tải</span>
                                            <span className="tree-count">{countForFilter("queue:sync")}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Table content */}
                <div className="content">
                    <div className="table-wrapper">
                        <table className="dl-table">
                            <thead>
                                <tr>
                                    <th className="col-name">Tên tệp</th>
                                    <th className="col-queue">Kiểu chờ tải</th>
                                    <th className="col-size">Kích thước</th>
                                    <th className="col-status">Trạng thái</th>
                                    <th className="col-eta">Thời gian còn lại</th>
                                    <th className="col-speed">Tốc độ tải xuống</th>
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
                                            <td className="col-name" title={t.name}>
                                                <div className="file-name-cell">
                                                    <span className={`file-icon ${cat}`}>
                                                        {FILE_ICONS[cat].img ? (
                                                            <img src={FILE_ICONS[cat].img} alt="" />
                                                        ) : (
                                                            <Icon icon={FILE_ICONS[cat].icon!} width="18" height="18" />
                                                        )}
                                                    </span>
                                                    <span className="file-name-text">{t.name}</span>
                                                </div>
                                            </td>
                                            <td className="col-queue">
                                                {t.state === "queued" ? "Chính" : t.state === "held" ? "Đồng bộ" : "—"}
                                            </td>
                                            <td className="col-size">{t.total ? bytes(t.total) : "—"}</td>
                                            <td className="col-status">
                                                <span className={`status-text ${t.state}`}>
                                                    {t.state === "running" ? `Đang tải (${pct}%)` : (stateLabels[t.state] ?? t.state)}
                                                </span>
                                            </td>
                                            <td className="col-eta">
                                                {t.state === "completed" ? "00:00:00" : (speed > 0 && eta > 0 ? formatETA(eta) : "—")}
                                            </td>
                                            <td className="col-speed">{speed > 0 ? bytes(speed) + "/s" : "—"}</td>
                                            <td className="col-date">{formatDate(t.created)}</td>
                                        </tr>
                                    );
                                })}
                                {Array.from({ length: Math.max(0, 24 - filteredTasks.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="row-empty">
                                        <td>&nbsp;</td>
                                        <td></td>
                                        <td></td>
                                        <td></td>
                                        <td></td>
                                        <td></td>
                                        <td></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
            {showStatusbar && (
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
            )}

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
                            <img src="/icons/Download.png" alt="Tiếp tục" className="menu-icon" />
                            <span>Tiếp tục</span>
                        </div>
                        <div
                            className={`context-menu-item ${!["running", "queued", "held"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "pause"); setContextMenu(null); }}
                        >
                            <img src="/icons/Stop.png" alt="Tạm dừng" className="menu-icon" />
                            <span>Tạm dừng</span>
                        </div>
                        <div
                            className={`context-menu-item ${!["running", "queued", "held", "paused", "failed"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "cancel"); setContextMenu(null); }}
                        >
                            <img src="/icons/Cancel.png" alt="Hủy bỏ" className="menu-icon" />
                            <span>Hủy bỏ</span>
                        </div>
                        <div className="context-menu-sep" />
                        <div
                            className={`context-menu-item ${!["failed", "paused", "cancelled"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "restart"); setContextMenu(null); }}
                        >
                            <img src="/icons/Restart.png" alt="Tải lại từ đầu" className="menu-icon" />
                            <span>Tải lại từ đầu</span>
                        </div>
                        <div className="context-menu-sep" />
                        <div
                            className="context-menu-item"
                            onClick={() => {
                                invoke("open_folder", { id: t.id }).catch(e => setMessage({ text: String(e), type: "error" }));
                                setContextMenu(null);
                            }}
                        >
                            <img src="/icons/Opened_Folder.png" alt="Mở thư mục" className="menu-icon" />
                            <span>Mở thư mục</span>
                        </div>
                        <div className="context-menu-sep" />
                        <div
                            className={`context-menu-item ${["running", "pausing", "cancelling"].includes(t.state) ? "disabled" : ""}`}
                            onClick={() => { act(t.id, "delete"); setContextMenu(null); }}
                        >
                            <img src="/icons/Trash_Can.png" alt="Xóa lịch sử" className="menu-icon" />
                            <span>Xóa lịch sử</span>
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
