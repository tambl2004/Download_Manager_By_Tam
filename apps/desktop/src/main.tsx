import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./style.css";
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
};
type Config = {
    folder: string;
    parallel: number;
    connections: number;
    limit_kib: number;
};
const labels: Record<string, string> = {
    queued: "Đang chờ",
    held: "Chờ xác nhận Chrome",
    running: "Đang tải",
    pausing: "Đang dừng",
    paused: "Tạm dừng",
    completed: "Hoàn thành",
    failed: "Có lỗi",
    cancelled: "Đã hủy",
    cancelling: "Đang hủy",
};
const bytes = (n: number) =>
    n < 1024
        ? n + " B"
        : n < 1048576
            ? (n / 1024).toFixed(1) + " KB"
            : n < 1073741824
                ? (n / 1048576).toFixed(1) + " MB"
                : (n / 1073741824).toFixed(2) + " GB";
function App() {
    const [tasks, setTasks] = useState<Task[]>([]),
        [filter, F] = useState("all"),
        [search, S] = useState(""),
        [url, U] = useState(""),
        [name, N] = useState(""),
        [message, M] = useState(""),
        [config, C] = useState<Config | null>(null),
        [show, Q] = useState(false),
        [rates, R] = useState<Record<string, number>>({});
    const last = useRef<{ time: number; data: Task[] }>({
        time: Date.now(),
        data: [],
    });
    const refresh = async () => {
        try {
            const list = await invoke<Task[]>("list");
            const now = Date.now(),
                dt = (now - last.current.time) / 1000;
            R(
                Object.fromEntries(
                    list.map((t) => [
                        t.id,
                        t.state === "running"
                            ? Math.max(
                                0,
                                (t.done -
                                    (last.current.data.find((x) => x.id === t.id)?.done ??
                                        t.done)) /
                                dt,
                            )
                            : 0,
                    ]),
                ),
            );
            last.current = { time: now, data: list };
            setTasks(list);
        } catch (e) {
            M(String(e));
        }
    };
    useEffect(() => {
        let active = true;
        const tick = async () => {
            await refresh();
            if (active) timer = setTimeout(tick, 800);
        };
        let timer: ReturnType<typeof setTimeout>;
        void tick();
        invoke<Config>("settings")
            .then(C)
            .catch((e) => M(String(e)));
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, []);
    const act = async (id: string, action: string) => {
        if (
            ["delete", "restart"].includes(action) &&
            !confirm(
                action === "delete"
                    ? "Xóa lịch sử và phần tải dở? File đã hoàn tất được giữ lại."
                    : "Xóa phần tải dở và tải lại từ đầu?",
            )
        )
            return;
        try {
            await invoke("action", { id, action });
            await refresh();
        } catch (e) {
            M(String(e));
        }
    };
    return (
        <main>
            <aside>
                <h1>↓ MyDM</h1>
                <p>Trình quản lý tải cá nhân</p>
                {[
                    ["all", "Tất cả"],
                    ["running", "Đang tải"],
                    ["queued", "Hàng đợi"],
                    ["paused", "Tạm dừng"],
                    ["completed", "Hoàn thành"],
                    ["failed", "Có lỗi"],
                ].map(([v, l]) => (
                    <button
                        className={filter === v ? "selected" : ""}
                        onClick={() => F(v)}
                        key={v}
                    >
                        {l}
                        <span>
                            {tasks.filter((t) => v === "all" || t.state === v).length}
                        </span>
                    </button>
                ))}
                <small>
                    Windows · Rust
                    <br />
                    Phiên bản thử nghiệm 0.1
                </small>
            </aside>
            <section>
                <header>
                    <div>
                        <h2>Tải xuống</h2>
                        <p>
                            {tasks.length} tác vụ ·{" "}
                            {tasks.filter((t) => t.state === "running").length} đang hoạt động
                        </p>
                    </div>
                    <button onClick={() => Q(!show)}>⚙ Cài đặt</button>
                </header>
                {message && (
                    <div className="error" role="alert">
                        {message}
                        <button onClick={() => M("")}>Đóng</button>
                    </div>
                )}
                {show && config && (
                    <div className="settings">
                        <label>
                            Thư mục lưu mặc định
                            <input
                                value={config.folder}
                                onChange={(e) => C({ ...config, folder: e.target.value })}
                            />
                        </label>
                        {[
                            ["parallel", "Số tệp đồng thời", 1, 6],
                            ["connections", "Kết nối mỗi tệp", 1, 8],
                            [
                                "limit_kib",
                                "Giới hạn KB/s mỗi tệp (0 = không giới hạn)",
                                0,
                                1000000,
                            ],
                        ].map(([key, text, min, max]) => (
                            <label key={key}>
                                {text}
                                <input
                                    type="number"
                                    min={min}
                                    max={max}
                                    value={config[key as keyof Config]}
                                    onChange={(e) =>
                                        C({ ...config, [key]: Number(e.target.value) })
                                    }
                                />
                            </label>
                        ))}
                        <button
                            onClick={async () => {
                                try {
                                    await invoke("save_settings", { value: config });
                                    M("Đã lưu. Kết nối và tốc độ áp dụng cho tác vụ mới.");
                                    Q(false);
                                } catch (e) {
                                    M(String(e));
                                }
                            }}
                        >
                            Lưu cấu hình
                        </button>
                    </div>
                )}
                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                            await invoke("add", { url: url.trim(), name: name.trim() });
                            U("");
                            N("");
                            await refresh();
                        } catch (e) {
                            M(String(e));
                        }
                    }}
                >
                    <input
                        aria-label="URL"
                        placeholder="Dán URL https://…"
                        required
                        value={url}
                        onChange={(e) => U(e.target.value)}
                    />
                    <input
                        aria-label="Tên tệp"
                        placeholder="Tên tệp (tùy chọn)"
                        value={name}
                        onChange={(e) => N(e.target.value)}
                    />
                    <button className="primary">+ Thêm tải xuống</button>
                </form>
                <div className="toolbar">
                    <input
                        placeholder="Tìm tên tệp…"
                        value={search}
                        onChange={(e) => S(e.target.value)}
                    />
                    <button
                        onClick={() =>
                            tasks
                                .filter((t) => ["running", "queued", "held"].includes(t.state))
                                .forEach((t) => void act(t.id, "pause"))
                        }
                    >
                        Dừng tất cả
                    </button>
                    <button
                        onClick={() =>
                            tasks
                                .filter((t) => t.state === "paused")
                                .forEach((t) => void act(t.id, "resume"))
                        }
                    >
                        Tiếp tục
                    </button>
                </div>
                <div className="list">
                    {tasks
                        .filter(
                            (t) =>
                                (filter === "all" || t.state === filter) &&
                                t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
                        )
                        .map((t) => (
                            <article key={t.id}>
                                <div className="row">
                                    <strong>{t.name}</strong>
                                    <b className={t.state}>{labels[t.state]}</b>
                                </div>
                                <progress
                                    value={t.total ? t.done : undefined}
                                    max={t.total ?? 1}
                                />
                                <div className="row">
                                    <span>
                                        {bytes(t.done)} / {t.total ? bytes(t.total) : "Chưa rõ"} ·{" "}
                                        {t.ranges.length || 1} phần
                                    </span>
                                    <span>
                                        {rates[t.id] > 0 ? bytes(rates[t.id]) + "/s" : ""}
                                        {rates[t.id] > 0 && t.total
                                            ? " · Còn ~" +
                                            Math.ceil((t.total - t.done) / rates[t.id]) +
                                            " giây"
                                            : ""}
                                    </span>
                                </div>
                                {t.error && t.state === "failed" && (
                                    <p className="error">{t.error}</p>
                                )}
                                <div className="actions">
                                    {["paused", "failed", "held"].includes(t.state) && (
                                        <button onClick={() => act(t.id, "resume")}>
                                            Tiếp tục
                                        </button>
                                    )}
                                    {["running", "queued", "held"].includes(t.state) && (
                                        <button onClick={() => act(t.id, "pause")}>Tạm dừng</button>
                                    )}
                                    {!["completed", "cancelled", "cancelling"].includes(
                                        t.state,
                                    ) && <button onClick={() => act(t.id, "cancel")}>Hủy</button>}
                                    {["failed", "paused", "cancelled"].includes(t.state) && (
                                        <button onClick={() => act(t.id, "restart")}>
                                            Tải lại từ đầu
                                        </button>
                                    )}
                                    <button
                                        onClick={() =>
                                            invoke("open_folder", { id: t.id }).catch((e) =>
                                                M(String(e)),
                                            )
                                        }
                                    >
                                        Mở thư mục
                                    </button>
                                    {!["running", "pausing", "cancelling"].includes(t.state) && (
                                        <button onClick={() => act(t.id, "delete")}>
                                            Xóa lịch sử
                                        </button>
                                    )}
                                </div>
                            </article>
                        ))}
                    {tasks.length === 0 && (
                        <div className="empty">
                            <h2>Sẵn sàng tải xuống</h2>
                            <p>Dán một link ở trên hoặc gửi từ tiện ích MyDM trên Chrome.</p>
                        </div>
                    )}
                </div>
                <footer>
                    Giữ cửa sổ mở để tải. Bắt link Chrome: xem README.md trong bộ mã
                    nguồn.
                </footer>
            </section>
        </main>
    );
}
createRoot(document.getElementById("root")!).render(<App />);
