import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task, ToolbarBtnSize, MessageState } from "./types";

interface ToolbarProps {
    showToolbar: boolean;
    toolbarBtnSize: ToolbarBtnSize;
    tasks: Task[];
    selectedTask: Task | undefined;
    act: (id: string, action: string) => Promise<void>;
    setShowAddDialog: (show: boolean) => void;
    setShowSettings: (show: boolean) => void;
    setMessage: (msg: MessageState) => void;
    onRefresh?: () => Promise<void>;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    showToolbar,
    toolbarBtnSize,
    tasks,
    selectedTask,
    act,
    setShowAddDialog,
    setShowSettings,
    setMessage,
    onRefresh,
}) => {
    if (!showToolbar) return null;

    return (
        <div className={`toolbar ${toolbarBtnSize === "small" ? "small" : ""}`}>
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

            <button className="toolbar-btn" onClick={() => setShowSettings(true)} title="Cài đặt">
                <span className="icon">
                    <img width="80" height="80" src="/icons/Settings.png" alt="options" />
                </span>
                Tùy chọn
            </button>


            <button
                className="toolbar-btn"
                onClick={async () => {
                    const heldTasks = tasks.filter(t => t.state === "held");
                    if (heldTasks.length > 0) {
                        heldTasks.forEach(t => void act(t.id, "resume"));
                        setMessage({ text: `Đã bắt đầu đồng bộ ${heldTasks.length} tác vụ`, type: "success" });
                    } else if (onRefresh) {
                        await onRefresh();
                        setMessage({ text: "Đã làm mới và đồng bộ danh sách tải xuống", type: "success" });
                    } else {
                        setMessage({ text: "Đã đồng bộ danh sách tải xuống", type: "success" });
                    }
                }}
                title="Đồng bộ / Làm mới danh sách"
            >
                <span className="icon">
                    <img width="80" height="80" src="/icons/Refresh.png" alt="sync queue" />
                </span>
                Đồng bộ
            </button>

            <div className="toolbar-sep" />

            <button
                className={`toolbar-btn ${!selectedTask ? "disabled" : ""}`}
                onClick={() => {
                    if (selectedTask) {
                        invoke("open_folder", { id: selectedTask.id }).catch(e => setMessage({ text: String(e), type: "error" }));
                    }
                }}
                title="Mở thư mục lưu tệp"
            >
                <span className="icon">
                    <img width="80" height="80" src="/icons/Opened_Folder.png" alt="open folder" />
                </span>
                Mở thư mục
            </button>
        </div>
    );
};
