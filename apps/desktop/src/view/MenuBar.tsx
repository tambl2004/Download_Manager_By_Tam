import React from "react";
import { Task, ActiveMenu, SidebarFilter, MessageState, ToolbarBtnSize, ToolbarTheme, TrayStyle } from "./types";

interface MenuBarProps {
    tasks: Task[];
    activeMenu: ActiveMenu;
    setActiveMenu: (m: ActiveMenu) => void;
    act: (id: string, action: string) => Promise<void>;
    setMessage: (msg: MessageState) => void;
    setShowAddDialog: (show: boolean) => void;
    setAddUrl: (url: string) => void;
    setFilter: (f: SidebarFilter) => void;
    exportUrls: (format: "ef2" | "txt") => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    speedLimiterEnabled: boolean;
    setSpeedLimiterEnabled: (b: boolean) => void;
    setShowSettings: (show: boolean) => void;
    showSidebar: boolean;
    setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>;
    sortBy: string;
    setSortBy: (s: string) => void;
    toolbarBtnSize: ToolbarBtnSize;
    setToolbarBtnSize: (s: ToolbarBtnSize) => void;
    toolbarTheme: ToolbarTheme;
    setToolbarTheme: (t: ToolbarTheme) => void;
    trayStyle: TrayStyle;
    setTrayStyle: (s: TrayStyle) => void;
    darkMode: boolean;
    setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
    currentFont: string;
    setCurrentFont: (f: string) => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
    tasks,
    activeMenu,
    setActiveMenu,
    act,
    setMessage,
    setShowAddDialog,
    setAddUrl,
    setFilter,
    exportUrls,
    fileInputRef,
    speedLimiterEnabled,
    setSpeedLimiterEnabled,
    setShowSettings,
    showSidebar,
    setShowSidebar,
    sortBy,
    setSortBy,
    toolbarBtnSize,
    setToolbarBtnSize,
    toolbarTheme,
    setToolbarTheme,
    trayStyle,
    setTrayStyle,
    darkMode,
    setDarkMode,
    currentFont,
    setCurrentFont,
}) => {
    return (
        <div className="menubar">
            <div className="menubar-items">
                {/* Menu: Công việc */}
                <div className="menubar-menu-wrapper">
                    <button
                        className={`menubar-menu-btn ${activeMenu === "job" ? "active" : ""}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === "job" ? null : "job");
                        }}
                        onMouseEnter={() => {
                            if (activeMenu !== null) setActiveMenu("job");
                        }}
                    >
                        Công việc
                    </button>
                    {activeMenu === "job" && (
                        <div className="menubar-dropdown">
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setShowAddDialog(true);
                                    setActiveMenu(null);
                                }}
                            >
                                Thêm tải xuống
                            </div>
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setShowAddDialog(true);
                                    setActiveMenu(null);
                                }}
                            >
                                Tải xuống hàng loạt
                            </div>
                            <div
                                className="menubar-menu-item"
                                onClick={async () => {
                                    setActiveMenu(null);
                                    try {
                                        const text = await navigator.clipboard.readText();
                                        if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
                                            setAddUrl(text);
                                            setShowAddDialog(true);
                                        } else {
                                            setShowAddDialog(true);
                                        }
                                    } catch {
                                        setShowAddDialog(true);
                                    }
                                }}
                            >
                                Tải hàng loạt liên kết trong clipboard
                            </div>
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setFilter("grabber");
                                    setActiveMenu(null);
                                }}
                            >
                                Chạy Grabber
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setMessage({ text: "Hộp thả liên kết đang được bật", type: "success" });
                                    setActiveMenu(null);
                                }}
                            >
                                Hiện hộp thả liên kết
                            </div>
                            <div className="menubar-menu-divider" />
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Xuất dữ liệu</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            exportUrls("ef2");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Ra tệp tin kết xuất IDM
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            exportUrls("txt");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Ra tệp văn bản
                                    </div>
                                </div>
                            </div>
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Nhập dữ liệu</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            fileInputRef.current?.click();
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Từ tệp tin kết xuất IDM
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            fileInputRef.current?.click();
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Từ tệp văn bản
                                    </div>
                                </div>
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    window.close();
                                }}
                            >
                                Thoát
                            </div>
                        </div>
                    )}
                </div>

                {/* Menu: Tệp tin */}
                <div className="menubar-menu-wrapper">
                    <button
                        className={`menubar-menu-btn ${activeMenu === "file" ? "active" : ""}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === "file" ? null : "file");
                        }}
                        onMouseEnter={() => {
                            if (activeMenu !== null) setActiveMenu("file");
                        }}
                    >
                        Tệp tin
                    </button>
                    {activeMenu === "file" && (
                        <div className="menubar-dropdown">
                            <div
                                className={`menubar-menu-item ${tasks.length === 0 ? "disabled" : ""}`}
                                onClick={() => {
                                    tasks.filter(t => ["running", "queued", "held"].includes(t.state)).forEach(t => void act(t.id, "pause"));
                                    setActiveMenu(null);
                                }}
                            >
                                Dừng tải xuống
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className={`menubar-menu-item ${tasks.filter(t => ["failed", "paused", "cancelled"].includes(t.state)).length === 0 ? "disabled" : ""}`}
                                onClick={() => {
                                    tasks.filter(t => ["failed", "paused", "cancelled"].includes(t.state)).forEach(t => void act(t.id, "restart"));
                                    setActiveMenu(null);
                                }}
                            >
                                Tải lại từ đầu
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className={`menubar-menu-item ${tasks.filter(t => ["running", "pausing", "cancelling"].includes(t.state) === false && tasks.length > 0).length === 0 ? "disabled" : ""}`}
                                onClick={() => {
                                    tasks.filter(t => !["running", "pausing", "cancelling"].includes(t.state)).forEach(t => void act(t.id, "delete"));
                                    setActiveMenu(null);
                                }}
                            >
                                Xóa
                            </div>
                        </div>
                    )}
                </div>

                {/* Menu: Tải xuống */}
                <div className="menubar-menu-wrapper">
                    <button
                        className={`menubar-menu-btn ${activeMenu === "download" ? "active" : ""}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === "download" ? null : "download");
                        }}
                        onMouseEnter={() => {
                            if (activeMenu !== null) setActiveMenu("download");
                        }}
                    >
                        Tải xuống
                    </button>
                    {activeMenu === "download" && (
                        <div className="menubar-dropdown">
                            <div
                                className={`menubar-menu-item ${tasks.filter(t => ["running", "queued", "held"].includes(t.state)).length === 0 ? "disabled" : ""}`}
                                onClick={() => {
                                    tasks.filter(t => ["running", "queued", "held"].includes(t.state)).forEach(t => void act(t.id, "pause"));
                                    setActiveMenu(null);
                                }}
                            >
                                Tạm dừng tất cả
                            </div>
                            <div
                                className={`menubar-menu-item ${tasks.filter(t => ["running", "queued", "held"].includes(t.state)).length === 0 ? "disabled" : ""}`}
                                onClick={() => {
                                    tasks.filter(t => ["running", "queued", "held"].includes(t.state)).forEach(t => void act(t.id, "pause"));
                                    setActiveMenu(null);
                                }}
                            >
                                Dừng tất cả
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className={`menubar-menu-item ${tasks.filter(t => t.state === "completed").length === 0 ? "disabled" : ""}`}
                                onClick={() => {
                                    tasks.filter(t => t.state === "completed").forEach(t => void act(t.id, "delete"));
                                    setActiveMenu(null);
                                }}
                            >
                                Xóa tất cả các mục tải xong
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setMessage({ text: "Tìm kiếm tệp tải xuống", type: "success" });
                                    setActiveMenu(null);
                                }}
                            >
                                Tìm kiếm (Ctrl-F)
                            </div>
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setActiveMenu(null);
                                }}
                            >
                                Tìm tiếp (F3)
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setMessage({ text: "Lập lịch tải tự động", type: "success" });
                                    setActiveMenu(null);
                                }}
                            >
                                Lập lịch
                            </div>
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Bắt đầu danh sách chờ tải</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            tasks.filter(t => t.state === "paused" || t.state === "queued").forEach(t => void act(t.id, "resume"));
                                            setMessage({ text: "Đã bắt đầu Danh sách chờ tải chính", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Bắt đầu Danh sách chờ tải chính
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            tasks.filter(t => t.state === "held").forEach(t => void act(t.id, "resume"));
                                            setMessage({ text: "Đã bắt đầu Đồng bộ danh sách chờ tải", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Bắt đầu Đồng bộ danh sách chờ tải
                                    </div>
                                </div>
                            </div>
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Dừng danh sách chờ tải</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className={`menubar-menu-item ${tasks.filter(t => t.state === "running").length === 0 ? "disabled" : ""}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            tasks.filter(t => t.state === "running").forEach(t => void act(t.id, "pause"));
                                            setMessage({ text: "Đã dừng Danh sách chờ tải chính", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Dừng Danh sách chờ tải chính
                                    </div>
                                    <div
                                        className={`menubar-menu-item ${tasks.filter(t => t.state === "running" && t.source === "chrome").length === 0 ? "disabled" : ""}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            tasks.filter(t => t.state === "running" && t.source === "chrome").forEach(t => void act(t.id, "pause"));
                                            setMessage({ text: "Đã dừng Đồng bộ danh sách chờ tải", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Dừng Đồng bộ danh sách chờ tải
                                    </div>
                                </div>
                            </div>
                            <div className="menubar-menu-divider" />
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Tính năng hạn chế tốc độ</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSpeedLimiterEnabled(true);
                                            setMessage({ text: "Đã bật tính năng hạn chế tốc độ", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {speedLimiterEnabled && <span className="menu-bullet">•</span>}
                                        <span>Bật</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSpeedLimiterEnabled(false);
                                            setMessage({ text: "Đã tắt tính năng hạn chế tốc độ", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {!speedLimiterEnabled && <span className="menu-bullet">•</span>}
                                        <span>Tắt</span>
                                    </div>
                                    <div className="menubar-menu-divider" />
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowSettings(true);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        Thiết lập...
                                    </div>
                                </div>
                            </div>
                            <div className="menubar-menu-divider" />
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setShowSettings(true);
                                    setActiveMenu(null);
                                }}
                            >
                                Tùy chọn
                            </div>
                        </div>
                    )}
                </div>

                {/* Menu: Hiển thị */}
                <div className="menubar-menu-wrapper">
                    <button
                        className={`menubar-menu-btn ${activeMenu === "view" ? "active" : ""}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === "view" ? null : "view");
                        }}
                        onMouseEnter={() => {
                            if (activeMenu !== null) setActiveMenu("view");
                        }}
                    >
                        Hiển thị
                    </button>
                    {activeMenu === "view" && (
                        <div className="menubar-dropdown">
                            {/* 1. Ẩn các nhóm / Hiện các nhóm */}
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setShowSidebar(prev => !prev);
                                    setActiveMenu(null);
                                }}
                            >
                                <span>{showSidebar ? "Ẩn các nhóm" : "Hiện các nhóm"}</span>
                            </div>

                            {/* 2. Sắp xếp các tệp ▸ */}
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Sắp xếp các tệp</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("created");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "created" && <span className="menu-bullet">•</span>}
                                        <span>Theo thời điểm thêm tải</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("name");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "name" && <span className="menu-bullet">•</span>}
                                        <span>Theo tên tệp</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("size");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "size" && <span className="menu-bullet">•</span>}
                                        <span>Theo kích thước tệp</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("state");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "state" && <span className="menu-bullet">•</span>}
                                        <span>Theo trạng thái</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("eta");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "eta" && <span className="menu-bullet">•</span>}
                                        <span>Theo thời gian còn lại</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("speed");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "speed" && <span className="menu-bullet">•</span>}
                                        <span>Theo tốc độ truyền tải</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("date");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "date" && <span className="menu-bullet">•</span>}
                                        <span>Theo ngày tải cuối</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("desc");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "desc" && <span className="menu-bullet">•</span>}
                                        <span>Theo mô tả</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("folder");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "folder" && <span className="menu-bullet">•</span>}
                                        <span>Theo đường dẫn lưu</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("source");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "source" && <span className="menu-bullet">•</span>}
                                        <span>Theo nguồn</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSortBy("parent");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {sortBy === "parent" && <span className="menu-bullet">•</span>}
                                        <span>By Parent Web Page</span>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Thanh công cụ ▸ */}
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Thanh công cụ</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMessage({ text: "Tùy chỉnh các nút trên thanh công cụ", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <span>Tùy chỉnh thanh công cụ...</span>
                                    </div>
                                    <div className="menubar-menu-divider" />
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setToolbarBtnSize("large");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {toolbarBtnSize === "large" && <span className="menu-bullet">•</span>}
                                        <span>Nút lớn</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setToolbarBtnSize("small");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {toolbarBtnSize === "small" && <span className="menu-bullet">•</span>}
                                        <span>Nút nhỏ</span>
                                    </div>
                                    <div className="menubar-menu-divider" />
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMessage({ text: "Tìm kiếm bộ biểu tượng mới cho MyDM", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <span>Tìm kiếm giao diện mới cho thanh công cụ</span>
                                    </div>
                                    <div className="menubar-menu-divider" />
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setToolbarTheme("neon");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {toolbarTheme === "neon" && <span className="menu-bullet">•</span>}
                                        <span>Neon</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setToolbarTheme("3d");
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {toolbarTheme === "3d" && <span className="menu-bullet">•</span>}
                                        <span>3D Style</span>
                                    </div>
                                </div>
                            </div>

                            {/* 4. IDM tại khay hệ thống ▸ */}
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>IDM tại khay hệ thống</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTrayStyle("3d");
                                            setMessage({ text: "Biểu tượng khay: Kiểu 3D", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {trayStyle === "3d" && <span className="menu-bullet">•</span>}
                                        <span>Kiểu 3D</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTrayStyle("classic");
                                            setMessage({ text: "Biểu tượng khay: Kiểu truyền thống", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {trayStyle === "classic" && <span className="menu-bullet">•</span>}
                                        <span>Kiểu truyền thống</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTrayStyle("none");
                                            setMessage({ text: "Đã ẩn biểu tượng khay hệ thống", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        {trayStyle === "none" && <span className="menu-bullet">•</span>}
                                        <span>Không hiển thị</span>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Tùy chỉnh danh sách URL... */}
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setMessage({ text: "Tùy chỉnh các cột trong danh sách URL", type: "success" });
                                    setActiveMenu(null);
                                }}
                            >
                                <span>Tùy chỉnh danh sách URL...</span>
                            </div>

                            {/* 6. Dark Mode support */}
                            <div
                                className="menubar-menu-item"
                                onClick={() => {
                                    setDarkMode(prev => !prev);
                                    setActiveMenu(null);
                                }}
                            >
                                {darkMode && <span className="menu-check">✓</span>}
                                <span>Dark Mode support</span>
                            </div>

                            {/* 7. Font ▸ */}
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Font</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const chosen = prompt("Nhập tên font mong muốn (ví dụ: 'Segoe UI', 'Tahoma', 'Arial', 'Consolas'):", currentFont || "Segoe UI");
                                            if (chosen) {
                                                setCurrentFont(chosen);
                                                setMessage({ text: `Đã áp dụng font: ${chosen}`, type: "success" });
                                            }
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <span>Choose Font...</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentFont("");
                                            setMessage({ text: "Đã khôi phục font mặc định", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <span>Reset to default Font</span>
                                    </div>
                                </div>
                            </div>

                            <div className="menubar-menu-divider" />

                            {/* 8. Ngôn ngữ ▸ */}
                            <div className="menubar-menu-item menubar-has-sub">
                                <span>Ngôn ngữ</span>
                                <span className="menu-arrow">▸</span>
                                <div className="menubar-submenu">
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMessage({ text: "Ngôn ngữ giao diện: Tiếng Việt", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <span className="menu-bullet">•</span>
                                        <span>Tiếng Việt</span>
                                    </div>
                                    <div
                                        className="menubar-menu-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMessage({ text: "Chuyển ngôn ngữ sang English", type: "success" });
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <span>English</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
