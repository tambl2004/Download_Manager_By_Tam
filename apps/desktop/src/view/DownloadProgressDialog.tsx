import React, { useState, useMemo } from "react";
import { Task, bytes, formatETA } from "./types";

interface DownloadProgressDialogProps {
    task: Task | undefined;
    rate: number;
    onClose: () => void;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onCancel: (id: string) => void;
}

export const DownloadProgressDialog: React.FC<DownloadProgressDialogProps> = ({
    task,
    rate,
    onClose,
    onPause,
    onResume,
    onCancel,
}) => {
    const [activeTab, setActiveTab] = useState<"status" | "speed" | "completion">("status");
    const [showDetails, setShowDetails] = useState<boolean>(true);

    if (!task) return null;

    const percent = task.total && task.total > 0
        ? Math.min(100, (task.done / task.total) * 100)
        : 0;

    const eta = rate > 0 && task.total
        ? Math.max(0, (task.total - task.done) / rate)
        : 0;

    const isRunning = task.state === "running";
    const isPaused = task.state === "paused" || task.state === "pausing";

    // Format bytes with dot or comma IDM-style (e.g. 81,045 MB)
    const formatIDMBytes = (n: number) => {
        if (n < 1024) return `${n} B`;
        if (n < 1048576) return `${(n / 1024).toFixed(3).replace(".", ",")} KB`;
        if (n < 1073741824) return `${(n / 1048576).toFixed(3).replace(".", ",")} MB`;
        return `${(n / 1073741824).toFixed(3).replace(".", ",")} GB`;
    };

    const speedStr = rate > 0
        ? `${(rate / (1024 * 1024)).toFixed(3).replace(".", ",")} MB/giây`
        : "—";

    const parts = useMemo(() => {
        if (!task.ranges || task.ranges.length === 0) {
            return [{
                index: 1,
                done: task.done,
                total: task.total ?? 0,
                status: isRunning ? "Đang nhận dữ liệu..." : isPaused ? "Tạm dừng" : "Đang chờ...",
            }];
        }
        return task.ranges.map(([start, end], idx) => {
            const partTotal = end === 18446744073709551615 ? 0 : end - start + 1;
            const partDone = task.part_dones?.[idx] ?? (task.state === "completed" ? partTotal : 0);
            const isDone = partTotal > 0 && partDone >= partTotal;
            let statusText = "Đang nhận dữ liệu...";
            if (isDone) statusText = "Hoàn tất";
            else if (isPaused) statusText = "Tạm dừng";
            else if (!isRunning) statusText = "Đang kết nối...";

            return {
                index: idx + 1,
                start,
                end,
                done: partDone,
                total: partTotal,
                status: statusText,
            };
        });
    }, [task, isRunning, isPaused]);

    const titlePercent = `${Math.floor(percent)}%`;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="dl-progress-window" onClick={(e) => e.stopPropagation()}>
                {/* Title bar */}
                <div className="dialog-title-bar">
                    <div className="dialog-title-left">
                        <img src="/icons/Internet.png" className="dialog-title-icon" alt="" />
                        <span className="dl-progress-window-title">
                            {titlePercent} {task.name}
                        </span>
                    </div>
                    <div className="dialog-title-controls">
                        <button className="dialog-ctrl-btn" onClick={onClose} title="Đóng">✕</button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="dl-progress-tabs">
                    <button
                        className={`dl-tab-btn ${activeTab === "status" ? "active" : ""}`}
                        onClick={() => setActiveTab("status")}
                    >
                        Trạng thái tải
                    </button>
                    <button
                        className={`dl-tab-btn ${activeTab === "speed" ? "active" : ""}`}
                        onClick={() => setActiveTab("speed")}
                    >
                        Thiết lập hạn chế tốc độ
                    </button>
                    <button
                        className={`dl-tab-btn ${activeTab === "completion" ? "active" : ""}`}
                        onClick={() => setActiveTab("completion")}
                    >
                        Thiết lập khi hoàn thành tải
                    </button>
                </div>

                {/* Tab content */}
                <div className="dl-progress-content">
                    {activeTab === "status" && (
                        <>
                            {/* URL line */}
                            <div className="dl-url-box" title={task.url}>
                                {task.url}
                            </div>

                            {/* Status metrics grid */}
                            <div className="dl-info-table">
                                <div className="dl-info-row">
                                    <span className="dl-info-label">Trạng thái:</span>
                                    <span className="dl-info-val text-primary-status">
                                        {isRunning ? "Nhận dữ liệu..." : isPaused ? "Tạm dừng" : "Đang kết nối..."}
                                    </span>
                                </div>
                                <div className="dl-info-row">
                                    <span className="dl-info-label">Kích thước tệp tin:</span>
                                    <span className="dl-info-val">
                                        {task.total ? formatIDMBytes(task.total) : "Không rõ"}
                                    </span>
                                </div>
                                <div className="dl-info-row">
                                    <span className="dl-info-label">Đã tải được:</span>
                                    <span className="dl-info-val">
                                        {formatIDMBytes(task.done)} {task.total ? `( ${percent.toFixed(2).replace(".", ",")} % )` : ""}
                                    </span>
                                </div>
                                <div className="dl-info-row">
                                    <span className="dl-info-label">Tốc độ truyền tải:</span>
                                    <span className="dl-info-val">{speedStr}</span>
                                </div>
                                <div className="dl-info-row">
                                    <span className="dl-info-label">Thời gian còn lại:</span>
                                    <span className="dl-info-val">{formatETA(eta)}</span>
                                </div>
                                <div className="dl-info-row">
                                    <span className="dl-info-label">Hỗ trợ tải lại:</span>
                                    <span className="dl-info-val">
                                        {task.etag ? "Có" : "Không"}
                                    </span>
                                </div>
                            </div>

                            {/* Green Main Progress Bar */}
                            <div className="dl-main-progress-bar-wrapper">
                                <div
                                    className="dl-main-progress-bar-fill"
                                    style={{ width: `${percent}%` }}
                                />
                            </div>

                            {/* Action Buttons Row */}
                            <div className="dl-progress-actions">
                                <button
                                    className="dl-btn-flat"
                                    onClick={() => setShowDetails(!showDetails)}
                                >
                                    {showDetails ? "<< Ẩn chi tiết" : ">> Xem chi tiết"}
                                </button>
                                <div className="dl-progress-actions-right">
                                    {isRunning ? (
                                        <button
                                            className="dl-btn-flat"
                                            onClick={() => onPause(task.id)}
                                        >
                                            Tạm dừng
                                        </button>
                                    ) : (
                                        <button
                                            className="dl-btn-flat"
                                            onClick={() => onResume(task.id)}
                                        >
                                            Tiếp tục
                                        </button>
                                    )}
                                    <button
                                        className="dl-btn-flat"
                                        onClick={() => onCancel(task.id)}
                                    >
                                        Hủy bỏ
                                    </button>
                                </div>
                            </div>

                            {/* Multi-thread segmented detail section */}
                            {showDetails && (
                                <div className="dl-connections-section">
                                    <div className="dl-connections-header">
                                        Tiến trình tải xuống và các vị trí bắt đầu các kết nối
                                    </div>

                                    {/* Visual Graphic Segment Bar */}
                                    <div className="dl-segments-graphic-bar">
                                        {parts.map((p, idx) => {
                                            const partWidth = 100 / parts.length;
                                            const partRatio = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
                                            return (
                                                <div
                                                    key={idx}
                                                    className="dl-segment-chunk"
                                                    style={{ width: `${partWidth}%` }}
                                                >
                                                    <div
                                                        className="dl-segment-fill"
                                                        style={{ width: `${partRatio * 100}%` }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Connections Table */}
                                    <div className="dl-connections-table-wrapper">
                                        <table className="dl-connections-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: "50px" }}>STT</th>
                                                    <th style={{ width: "130px" }}>Đã tải xuống</th>
                                                    <th>Thông tin</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {parts.map((p) => (
                                                    <tr key={p.index}>
                                                        <td style={{ textAlign: "center" }}>{p.index}</td>
                                                        <td>{p.done > 0 ? formatIDMBytes(p.done) : "—"}</td>
                                                        <td>{p.status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === "speed" && (
                        <div className="dl-tab-pane">
                            <label className="dialog-checkbox-label">
                                <input type="checkbox" />
                                <span>Bật giới hạn tốc độ cho tệp này</span>
                            </label>
                            <div className="dialog-row" style={{ marginTop: "12px" }}>
                                <span className="dialog-label">Tốc độ tối đa:</span>
                                <input className="dialog-input" style={{ width: "120px" }} placeholder="0 (Không giới hạn)" />
                                <span>KiB/giây</span>
                            </div>
                        </div>
                    )}

                    {activeTab === "completion" && (
                        <div className="dl-tab-pane">
                            <label className="dialog-checkbox-label" style={{ marginBottom: "8px" }}>
                                <input type="checkbox" />
                                <span>Tắt máy tính sau khi hoàn thành tải</span>
                            </label>
                            <label className="dialog-checkbox-label">
                                <input type="checkbox" defaultChecked />
                                <span>Mở hộp thoại thông báo đã tải xong</span>
                            </label>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
