import React from "react";
import { Config } from "./types";

interface SettingsDialogProps {
    show: boolean;
    onClose: () => void;
    config: Config | null;
    setConfig: React.Dispatch<React.SetStateAction<Config | null>>;
    onSave: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
    show,
    onClose,
    config,
    setConfig,
    onSave,
}) => {
    if (!show || !config) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <span>Tùy chọn</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
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
                    <button className="btn" onClick={onClose}>Hủy</button>
                    <button className="btn btn-primary" onClick={onSave}>Lưu cấu hình</button>
                </div>
            </div>
        </div>
    );
};
