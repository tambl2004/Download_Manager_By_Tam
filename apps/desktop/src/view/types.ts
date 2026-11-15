/* ── Types & Helpers for MyDM Desktop UI ── */

export type Task = {
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

export type Config = {
    folder: string;
    parallel: number;
    connections: number;
    limit_kib: number;
};

export type ActiveMenu = "job" | "file" | "download" | "view" | null;
export type ToolbarBtnSize = "large" | "small";
export type ToolbarTheme = "neon" | "3d";
export type TrayStyle = "3d" | "classic" | "none";

export type MessageState = {
    text: string;
    type: "error" | "success";
} | null;

export const stateLabels: Record<string, string> = {
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

export const bytes = (n: number): string =>
    n < 1024
        ? n + " B"
        : n < 1048576
            ? (n / 1024).toFixed(1) + " KB"
            : n < 1073741824
                ? (n / 1048576).toFixed(2) + " MB"
                : (n / 1073741824).toFixed(2) + " GB";

export const formatDate = (ts: number): string => {
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)} giây`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phút ${Math.ceil(seconds % 60)} giây`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h} giờ ${m} phút`;
};

/* File category detection */
export type FileCategory = "archive" | "document" | "music" | "video" | "program" | "image" | "other";

export const EXT_MAP: Record<string, FileCategory> = {
    zip: "archive", rar: "archive", "7z": "archive", gz: "archive", tar: "archive", bz2: "archive", xz: "archive",
    pdf: "document", doc: "document", docx: "document", xls: "document", xlsx: "document",
    ppt: "document", pptx: "document", txt: "document", csv: "document", rtf: "document",
    mp3: "music", wav: "music", flac: "music", aac: "music", ogg: "music", wma: "music", m4a: "music",
    mp4: "video", mkv: "video", avi: "video", mov: "video", wmv: "video", flv: "video", webm: "video", m4v: "video",
    exe: "program", msi: "program", dmg: "program", deb: "program", rpm: "program", apk: "program", appx: "program",
    jpg: "image", jpeg: "image", png: "image", gif: "image", bmp: "image", svg: "image", webp: "image", ico: "image",
};

export const FILE_ICONS: Record<FileCategory, { icon?: string; img?: string }> = {
    archive: { img: "/icons/Archive_Folder.png" },
    document: { img: "/icons/Document.png" },
    music: { img: "/icons/Music.png" },
    video: { img: "/icons/Video.png" },
    program: { img: "/icons/Services.png" },
    image: { img: "/icons/Image_File.png" },
    other: { img: "/icons/File.png" },
};

export function getFileCategory(name: string): FileCategory {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return EXT_MAP[ext] ?? "other";
}

/* ── Sidebar filter type ── */
export type SidebarFilter =
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

export const SUB_CATEGORIES = [
    { key: "archive" as const, label: "Dữ liệu nén", img: "/icons/Archive_Folder.png" },
    { key: "document" as const, label: "Tài liệu", img: "/icons/Document.png" },
    { key: "music" as const, label: "Âm nhạc", img: "/icons/Music.png" },
    { key: "program" as const, label: "Chương trình", img: "/icons/Services.png" },
    { key: "video" as const, label: "Video", img: "/icons/Video.png" },
];
