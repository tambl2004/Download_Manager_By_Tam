import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task, MessageState } from "./types";

interface ContextMenuProps {
    contextMenu: { x: number; y: number; taskId: string } | null;
    setContextMenu: (ctx: { x: number; y: number; taskId: string } | null) => void;
    tasks: Task[];
    act: (id: string, action: string) => Promise<void>;
    setMessage: (msg: MessageState) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
    contextMenu,
    setContextMenu,
    tasks,
    act,
    setMessage,
}) => {
    if (!contextMenu) return null;

    const t = tasks.find((task) => task.id === contextMenu.taskId);
    if (!t) return null;

    return (
        <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className={`context-menu-item ${!["paused", "failed", "held"].includes(t.state) ? "disabled" : ""}`}
                onClick={() => {
                    act(t.id, "resume");
                    setContextMenu(null);
                }}
            >
                <img src="/icons/Download.png" alt="Tiếp tục" className="menu-icon" />
                <span>Tiếp tục</span>
            </div>
            <div
                className={`context-menu-item ${!["running", "queued", "held"].includes(t.state) ? "disabled" : ""}`}
                onClick={() => {
                    act(t.id, "pause");
                    setContextMenu(null);
                }}
            >
                <img src="/icons/Stop.png" alt="Tạm dừng" className="menu-icon" />
                <span>Tạm dừng</span>
            </div>
            <div
                className={`context-menu-item ${!["running", "queued", "held", "paused", "failed"].includes(t.state) ? "disabled" : ""}`}
                onClick={() => {
                    act(t.id, "cancel");
                    setContextMenu(null);
                }}
            >
                <img src="/icons/Cancel.png" alt="Hủy bỏ" className="menu-icon" />
                <span>Hủy bỏ</span>
            </div>
            <div className="context-menu-sep" />
            <div
                className={`context-menu-item ${!["failed", "paused", "cancelled"].includes(t.state) ? "disabled" : ""}`}
                onClick={() => {
                    act(t.id, "restart");
                    setContextMenu(null);
                }}
            >
                <img src="/icons/Restart.png" alt="Tải lại từ đầu" className="menu-icon" />
                <span>Tải lại từ đầu</span>
            </div>
            <div className="context-menu-sep" />
            <div
                className="context-menu-item"
                onClick={() => {
                    invoke("open_folder", { id: t.id }).catch((e) =>
                        setMessage({ text: String(e), type: "error" })
                    );
                    setContextMenu(null);
                }}
            >
                <img src="/icons/Opened_Folder.png" alt="Mở thư mục" className="menu-icon" />
                <span>Mở thư mục</span>
            </div>
            <div className="context-menu-sep" />
            <div
                className={`context-menu-item ${["running", "pausing", "cancelling"].includes(t.state) ? "disabled" : ""}`}
                onClick={() => {
                    act(t.id, "delete");
                    setContextMenu(null);
                }}
            >
                <img src="/icons/Trash_Can.png" alt="Xóa lịch sử" className="menu-icon" />
                <span>Xóa lịch sử</span>
            </div>
        </div>
    );
};
