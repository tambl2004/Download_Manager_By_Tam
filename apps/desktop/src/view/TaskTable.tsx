import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "@iconify/react";
import { Task, bytes, formatDate, formatETA, getFileCategory, FILE_ICONS, stateLabels, MessageState } from "./types";

interface TaskTableProps {
    tasks: Task[];
    rates: Record<string, number>;
    selectedId: string | null;
    setSelectedId: (id: string) => void;
    setContextMenu: (ctx: { x: number; y: number; taskId: string } | null) => void;
    setMessage: (msg: MessageState) => void;
}

export const TaskTable: React.FC<TaskTableProps> = ({
    tasks,
    rates,
    selectedId,
    setSelectedId,
    setContextMenu,
    setMessage,
}) => {
    return (
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
                    {tasks.map((t) => {
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
                    {Array.from({ length: Math.max(0, 24 - tasks.length) }).map((_, i) => (
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
    );
};
