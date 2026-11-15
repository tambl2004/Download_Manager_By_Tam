import React from "react";
import { Task, bytes, stateLabels } from "./types";

interface TaskDetailProps {
    selectedTask: Task | undefined;
    rates: Record<string, number>;
}

export const TaskDetail: React.FC<TaskDetailProps> = ({ selectedTask, rates }) => {
    if (!selectedTask) return null;

    const sourceLabel = (t: Task) => {
        if (t.source === "chrome") return "Chrome";
        if (t.source === "manual") return "Thủ công";
        return "—";
    };

    return (
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
    );
};
