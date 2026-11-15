import React from "react";

interface AddDialogProps {
    show: boolean;
    onClose: () => void;
    addUrl: string;
    setAddUrl: (url: string) => void;
    addName: string;
    setAddName: (name: string) => void;
    configFolder?: string;
    onAdd: () => void;
}

export const AddDialog: React.FC<AddDialogProps> = ({
    show,
    onClose,
    addUrl,
    setAddUrl,
    addName,
    setAddName,
    configFolder,
    onAdd,
}) => {
    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <span>Thêm tải xuống mới</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>URL tải xuống</label>
                        <input
                            autoFocus
                            placeholder="https://example.com/file.zip"
                            value={addUrl}
                            onChange={(e) => setAddUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onAdd();
                            }}
                        />
                    </div>
                    <div className="form-group">
                        <label>Tên tệp (tùy chọn — để trống sẽ lấy từ server)</label>
                        <input
                            placeholder="Để trống sẽ lấy tên từ Content-Disposition hoặc URL"
                            value={addName}
                            onChange={(e) => setAddName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onAdd();
                            }}
                        />
                    </div>
                    {configFolder && (
                        <div className="form-group">
                            <label>Lưu vào thư mục</label>
                            <input value={configFolder} disabled style={{ background: "#f5f5f5" }} />
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Hủy</button>
                    <button className="btn btn-primary" onClick={onAdd}>Bắt đầu tải xuống</button>
                </div>
            </div>
        </div>
    );
};
