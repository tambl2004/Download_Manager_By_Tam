import React, { useState, useEffect, useCallback, useMemo } from "react";
import { IDM_CATEGORIES, IDMCategory, getFileCategory, bytes } from "./types";
import { tauriClient } from "../services/tauriClient";

interface AddDialogProps {
    show: boolean;
    onClose: () => void;
    addUrl: string;
    setAddUrl: (url: string) => void;
    addName: string;
    setAddName: (name: string) => void;
    configFolder?: string;
    initialCategory?: string;
    initialTotal?: number | null;
    onAdd: (startNow?: boolean, targetFolder?: string, category?: string, total?: number) => void;
}

export const AddDialog: React.FC<AddDialogProps> = ({
    show,
    onClose,
    addUrl,
    setAddUrl,
    addName,
    setAddName,
    configFolder = "C:\\Users\\Downloads\\MyDM",
    initialCategory,
    initialTotal,
    onAdd,
}) => {
    // Categories list with support for user added categories
    const [categories, setCategories] = useState<IDMCategory[]>(IDM_CATEGORIES);
    const [selectedCatId, setSelectedCatId] = useState<string>("general");
    const [customFolder, setCustomFolder] = useState<string>("");
    const [rememberPath, setRememberPath] = useState<boolean>(true);
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [isProbing, setIsProbing] = useState<boolean>(false);
    const [userEditedName, setUserEditedName] = useState<boolean>(false);

    // Current category object
    const currentCategory = useMemo(() => {
        return categories.find((c) => c.id === selectedCatId) || categories[0];
    }, [categories, selectedCatId]);

    // Active base download folder for the selected category
    const activeCategoryFolder = useMemo(() => {
        const base = customFolder || configFolder || "C:\\Downloads";
        const trimmed = base.replace(/[\\/]+$/, "");
        return `${trimmed}\\${currentCategory.folderSubdir}`;
    }, [customFolder, configFolder, currentCategory]);

    // Full target filepath
    const fullSavePath = useMemo(() => {
        const fileName = addName.trim() || "download.bin";
        return `${activeCategoryFolder}\\${fileName}`;
    }, [activeCategoryFolder, addName]);

    // Helper: guess filename from URL
    const guessFilenameFromUrl = useCallback((urlStr: string): string => {
        try {
            const u = new URL(urlStr);
            const segments = u.pathname.split("/").filter(Boolean);
            const last = segments.pop() || "";
            return decodeURIComponent(last);
        } catch {
            return "";
        }
    }, []);

    // Automatic classification based on filename or mime type
    const classifyFilename = useCallback((name: string, mime?: string | null) => {
        const cat = getFileCategory(name);
        if (cat !== "other") {
            const match = categories.find((c) => c.fileCat === cat);
            if (match) return match.id;
        }
        if (mime) {
            const m = mime.toLowerCase();
            if (m.startsWith("video/")) return "video";
            if (m.startsWith("audio/")) return "music";
            if (m.includes("pdf") || m.includes("msword") || m.includes("document")) return "document";
            if (m.includes("zip") || m.includes("tar") || m.includes("compressed")) return "archive";
            if (m.includes("executable") || m.includes("x-msdownload")) return "program";
        }
        return "general";
    }, [categories]);

    // When dialog opens or URL changes: pre-probe file info
    useEffect(() => {
        if (!show) {
            setFileSize(null);
            setIsProbing(false);
            setUserEditedName(false);
            return;
        }

        if (initialTotal !== undefined && initialTotal !== null && initialTotal > 0) {
            setFileSize(initialTotal);
        }

        if (initialCategory) {
            const lower = initialCategory.toLowerCase();
            const found = categories.find((c) => c.id === lower || c.fileCat === lower || c.label.toLowerCase() === lower);
            if (found) setSelectedCatId(found.id);
        }

        const trimmedUrl = addUrl.trim();
        if (!trimmedUrl || !trimmedUrl.startsWith("http")) {
            return;
        }

        // Default name if not set
        if (!addName && !userEditedName) {
            const guessed = guessFilenameFromUrl(trimmedUrl);
            if (guessed) {
                setAddName(guessed);
                if (!initialCategory) setSelectedCatId(classifyFilename(guessed));
            }
        } else if (addName && !initialCategory && !userEditedName) {
            setSelectedCatId(classifyFilename(addName));
        }

        // Pre-probe from backend to obtain actual Content-Length and Content-Disposition
        let active = true;
        setIsProbing(true);
        tauriClient.probe(trimmedUrl)
            .then((result) => {
                if (!active) return;
                if (result.size !== null && result.size !== undefined && result.size > 0) {
                    setFileSize(result.size);
                }
                if (result.filename && !userEditedName) {
                    setAddName(result.filename);
                    if (!initialCategory) setSelectedCatId(classifyFilename(result.filename, result.mime_type));
                } else if (!userEditedName && !initialCategory && result.mime_type) {
                    const bestCat = classifyFilename(addName || "file", result.mime_type);
                    if (bestCat !== "general") setSelectedCatId(bestCat);
                }
            })
            .catch(() => {
                // Ignore probe error - server might not support HEAD or Range 0-0
            })
            .finally(() => {
                if (active) setIsProbing(false);
            });

        return () => {
            active = false;
        };
    }, [show, addUrl, initialCategory, initialTotal, classifyFilename, guessFilenameFromUrl]);

    // When filename manually changes, auto-update category if not manually locked
    const handleNameChange = (val: string) => {
        setAddName(val);
        setUserEditedName(true);
        const newCat = classifyFilename(val);
        setSelectedCatId(newCat);
    };

    // Browse folder button [...]
    const handleBrowseFolder = async () => {
        try {
            const selected = await tauriClient.pickFolder();
            if (selected) {
                setCustomFolder(selected);
            }
        } catch {
            // fallback if pickFolder fails
        }
    };

    // Add category button [+]
    const handleAddCategory = () => {
        const name = prompt("Nhập tên nhóm mới:", "Khác");
        if (!name || !name.trim()) return;
        const trimName = name.trim();
        const id = `cat_${Date.now()}`;
        const newCat: IDMCategory = {
            id,
            label: trimName,
            folderSubdir: trimName,
            fileCat: "other",
            icon: "/icons/Opened_Folder.png",
        };
        setCategories((prev) => [...prev, newCat]);
        setSelectedCatId(id);
    };

    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="download-info-dialog" onClick={(e) => e.stopPropagation()}>
                {/* Title Bar */}
                <div className="dialog-title-bar">
                    <div className="dialog-title-left">
                        <img src="/icons/Internet.png" className="dialog-title-icon" alt="" />
                        <span>Thông tin tệp tin tải xuống</span>
                    </div>
                    <div className="dialog-title-controls">
                        <button className="dialog-ctrl-btn" onClick={onClose} title="Đóng">✕</button>
                    </div>
                </div>

                {/* Dialog Body */}
                <div className="dialog-body">
                    {/* URL Field */}
                    <div className="dialog-row">
                        <label className="dialog-label">URL</label>
                        <div className="dialog-field-wrapper">
                            <input
                                className="dialog-input"
                                autoFocus
                                placeholder="https://example.com/file.zip"
                                value={addUrl}
                                onChange={(e) => setAddUrl(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="dialog-mid-section">
                        {/* Left column: Category & Path inputs */}
                        <div className="dialog-mid-left">
                            {/* Category Row */}
                            <div className="dialog-row">
                                <label className="dialog-label">Nhóm</label>
                                <div className="dialog-field-with-btn">
                                    <select
                                        className="dialog-select"
                                        value={selectedCatId}
                                        onChange={(e) => setSelectedCatId(e.target.value)}
                                    >
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.label}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="dialog-btn-small"
                                        title="Thêm nhóm mới"
                                        onClick={handleAddCategory}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {/* Save Path Row */}
                            <div className="dialog-row">
                                <label className="dialog-label">Đường dẫn lưu</label>
                                <div className="dialog-field-with-btn">
                                    <input
                                        className="dialog-input"
                                        value={fullSavePath}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const parts = val.split(/[\\/]/);
                                            const fileName = parts.pop() || "";
                                            setAddName(fileName);
                                            setUserEditedName(true);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="dialog-btn-small"
                                        title="Duyệt thư mục"
                                        onClick={handleBrowseFolder}
                                    >
                                        ...
                                    </button>
                                </div>
                            </div>

                            {/* Remember Path Checkbox & Sub-folder path display */}
                            <div className="dialog-sub-row">
                                <label className="dialog-checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={rememberPath}
                                        onChange={(e) => setRememberPath(e.target.checked)}
                                    />
                                    <span>Ghi nhớ đường dẫn này cho nhóm "{currentCategory.label}"</span>
                                </label>
                                <input
                                    className="dialog-input-subfolder"
                                    disabled
                                    value={activeCategoryFolder + "\\"}
                                />
                            </div>
                        </div>

                        {/* Right column: File icon & probed File Size */}
                        <div className="dialog-mid-right">
                            <div className="dialog-file-preview">
                                <img
                                    src={currentCategory.icon}
                                    alt={currentCategory.label}
                                    className="dialog-file-icon"
                                />
                                <div className="dialog-file-size">
                                    {isProbing ? (
                                        <span className="probing-text">Đang kiểm tra...</span>
                                    ) : fileSize !== null ? (
                                        <span>{bytes(fileSize)}</span>
                                    ) : (
                                        <span className="unknown-size">Không rõ dung lượng</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dialog Footer Actions */}
                <div className="dialog-footer">
                    <button
                        type="button"
                        className="dialog-action-btn"
                        onClick={() => onAdd(false, activeCategoryFolder, currentCategory.label, fileSize || undefined)}
                    >
                        Sẽ tải sau
                    </button>
                    <button
                        type="button"
                        className="dialog-action-btn btn-primary-highlight"
                        onClick={() => onAdd(true, activeCategoryFolder, currentCategory.label, fileSize || undefined)}
                    >
                        Bắt đầu tải
                    </button>
                    <button
                        type="button"
                        className="dialog-action-btn"
                        onClick={onClose}
                    >
                        Hủy bỏ
                    </button>
                </div>
            </div>
        </div>
    );
};
