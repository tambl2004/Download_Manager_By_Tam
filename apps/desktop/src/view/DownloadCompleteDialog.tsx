import React, { useState } from "react";
import { Task, bytes } from "./types";
import { tauriClient } from "../services/tauriClient";

interface DownloadCompleteDialogProps {
    task: Task | undefined;
    onClose: () => void;
}

export const DownloadCompleteDialog: React.FC<DownloadCompleteDialogProps> = ({
    task,
    onClose,
}) => {
    const [dontShowAgain, setDontShowAgain] = useState<boolean>(false);

    if (!task) return null;

    const fullFilePath = `${task.folder.replace(/[\\/]+$/, "")}\\${task.name}`;

    const handleOpen = async () => {
        try {
            await tauriClient.openFile(fullFilePath);
            onClose();
        } catch {
            // fallback
        }
    };

    const handleOpenWith = async () => {
        try {
            await tauriClient.openWith(fullFilePath);
        } catch {
            // fallback
        }
    };

    const handleOpenFolder = async () => {
        try {
            await tauriClient.openFolderSelect(fullFilePath);
        } catch {
            // fallback
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="dl-complete-window" onClick={(e) => e.stopPropagation()}>
                {/* Title bar */}
                <div className="dialog-title-bar">
                    <div className="dialog-title-left">
                        <img src="/icons/Check_Mark.png" className="dialog-title-icon" alt="" />
                        <span>Đã tải xong</span>
                    </div>
                    <div className="dialog-title-controls">
                        <button className="dialog-ctrl-btn" onClick={onClose} title="Đóng">✕</button>
                    </div>
                </div>

                {/* Dialog Content */}
                <div className="dl-complete-body">
                    {/* Header with folder envelope icon */}
                    <div className="dl-complete-header">
                        <img
                            src="/icons/Downloads_Folder.png"
                            className="dl-complete-icon"
                            alt="Complete"
                        />
                        <div className="dl-complete-header-text">
                            <h3 className="dl-complete-title">Đã tải xong</h3>
                            <p className="dl-complete-subtitle">
                                Đã tải được {bytes(task.done)} {task.total ? `(${task.total} Byte)` : ""}
                            </p>
                        </div>
                    </div>

                    {/* URL Field */}
                    <div className="dl-complete-field-group">
                        <label className="dl-complete-label">Địa chỉ</label>
                        <input
                            className="dialog-input"
                            readOnly
                            value={task.url}
                            title={task.url}
                        />
                    </div>

                    {/* Destination Path Field */}
                    <div className="dl-complete-field-group">
                        <label className="dl-complete-label">Tệp tin được lưu vào đường dẫn sau:</label>
                        <input
                            className="dialog-input"
                            readOnly
                            value={fullFilePath}
                            title={fullFilePath}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="dl-complete-actions">
                        <button className="dialog-action-btn" onClick={handleOpen}>
                            Mở
                        </button>
                        <button className="dialog-action-btn" onClick={handleOpenWith}>
                            Mở bằng...
                        </button>
                        <button className="dialog-action-btn" onClick={handleOpenFolder}>
                            Mở thư mục
                        </button>
                        <button className="dialog-action-btn" onClick={onClose}>
                            Đóng
                        </button>
                    </div>

                    {/* Footer Options */}
                    <div className="dl-complete-footer-options">
                        <label className="dialog-checkbox-label">
                            <input
                                type="checkbox"
                                checked={dontShowAgain}
                                onChange={(e) => setDontShowAgain(e.target.checked)}
                            />
                            <span>Không mở lại hộp thoại này</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};
