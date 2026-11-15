import React from "react";
import { SidebarFilter, SUB_CATEGORIES } from "./types";

interface SidebarProps {
    showSidebar: boolean;
    setShowSidebar: (show: boolean) => void;
    filter: SidebarFilter;
    setFilter: (f: SidebarFilter) => void;
    expanded: Record<string, boolean>;
    toggleExpand: (key: string, e: React.MouseEvent) => void;
    countForFilter: (f: SidebarFilter) => number;
}

export const Sidebar: React.FC<SidebarProps> = ({
    showSidebar,
    setShowSidebar,
    filter,
    setFilter,
    expanded,
    toggleExpand,
    countForFilter,
}) => {
    if (!showSidebar) return null;

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span>Thể loại</span>
                <button className="sidebar-close" onClick={() => setShowSidebar(false)} title="Đóng bảng thể loại">✕</button>
            </div>
            <div className="tree-container">
                {/* 1. Tất cả */}
                <div className="tree-node is-first-root">
                    <div
                        className={`tree-item ${filter === "all" ? "selected" : ""}`}
                        onClick={() => setFilter("all")}
                    >
                        <span
                            className="tree-toggle"
                            onClick={(e) => toggleExpand("all", e)}
                            title={expanded.all ? "Thu gọn" : "Mở rộng"}
                        >
                            {expanded.all ? "−" : "+"}
                        </span>
                        <span className="tree-icon">
                            <img src="/icons/Opened_Folder.png" alt="Tất cả" />
                        </span>
                        <span className="tree-label">Tất cả</span>
                        <span className="tree-count">{countForFilter("all")}</span>
                    </div>

                    {expanded.all && (
                        <div className="tree-sub-group">
                            {SUB_CATEGORIES.map((sub, idx) => (
                                <div
                                    key={sub.key}
                                    className={`tree-item tree-sub-row ${idx === SUB_CATEGORIES.length - 1 ? "is-last" : ""} ${filter === `cat:${sub.key}` ? "selected" : ""}`}
                                    onClick={() => setFilter(`cat:${sub.key}` as SidebarFilter)}
                                >
                                    <span className="tree-icon">
                                        <img src={sub.img} alt={sub.label} />
                                    </span>
                                    <span className="tree-label">{sub.label}</span>
                                    <span className="tree-count">{countForFilter(`cat:${sub.key}` as SidebarFilter)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. Chưa tải xong */}
                <div className="tree-node">
                    <div
                        className={`tree-item ${filter === "unfinished" ? "selected" : ""}`}
                        onClick={() => setFilter("unfinished")}
                    >
                        <span
                            className="tree-toggle"
                            onClick={(e) => toggleExpand("unfinished", e)}
                            title={expanded.unfinished ? "Thu gọn" : "Mở rộng"}
                        >
                            {expanded.unfinished ? "−" : "+"}
                        </span>
                        <span className="tree-icon">
                            <img src="/icons/Downloads_Folder.png" alt="Chưa tải xong" />
                        </span>
                        <span className="tree-label">Chưa tải xong</span>
                        <span className="tree-count">{countForFilter("unfinished")}</span>
                    </div>

                    {expanded.unfinished && (
                        <div className="tree-sub-group">
                            {SUB_CATEGORIES.map((sub, idx) => (
                                <div
                                    key={sub.key}
                                    className={`tree-item tree-sub-row ${idx === SUB_CATEGORIES.length - 1 ? "is-last" : ""} ${filter === `unfinished:${sub.key}` ? "selected" : ""}`}
                                    onClick={() => setFilter(`unfinished:${sub.key}` as SidebarFilter)}
                                >
                                    <span className="tree-icon">
                                        <img src={sub.img} alt={sub.label} />
                                    </span>
                                    <span className="tree-label">{sub.label}</span>
                                    <span className="tree-count">{countForFilter(`unfinished:${sub.key}` as SidebarFilter)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Đã tải xong */}
                <div className="tree-node">
                    <div
                        className={`tree-item ${filter === "completed" ? "selected" : ""}`}
                        onClick={() => setFilter("completed")}
                    >
                        <span
                            className="tree-toggle"
                            onClick={(e) => toggleExpand("completed", e)}
                            title={expanded.completed ? "Thu gọn" : "Mở rộng"}
                        >
                            {expanded.completed ? "−" : "+"}
                        </span>
                        <span className="tree-icon">
                            <img src="/icons/Check_Mark.png" alt="Đã tải xong" />
                        </span>
                        <span className="tree-label">Đã tải xong</span>
                        <span className="tree-count">{countForFilter("completed")}</span>
                    </div>

                    {expanded.completed && (
                        <div className="tree-sub-group">
                            {SUB_CATEGORIES.map((sub, idx) => (
                                <div
                                    key={sub.key}
                                    className={`tree-item tree-sub-row ${idx === SUB_CATEGORIES.length - 1 ? "is-last" : ""} ${filter === `completed:${sub.key}` ? "selected" : ""}`}
                                    onClick={() => setFilter(`completed:${sub.key}` as SidebarFilter)}
                                >
                                    <span className="tree-icon">
                                        <img src={sub.img} alt={sub.label} />
                                    </span>
                                    <span className="tree-label">{sub.label}</span>
                                    <span className="tree-count">{countForFilter(`completed:${sub.key}` as SidebarFilter)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 4. Grabber Project */}
                <div className="tree-node">
                    <div
                        className={`tree-item tree-leaf-row ${filter === "grabber" ? "selected" : ""}`}
                        onClick={() => setFilter("grabber")}
                    >
                        <span className="tree-icon">
                            <img src="/icons/Internet.png" alt="Grabber Project" />
                        </span>
                        <span className="tree-label">Grabber Project</span>
                        <span className="tree-count">{countForFilter("grabber")}</span>
                    </div>
                </div>

                {/* 5. Danh sách chờ tải */}
                <div className="tree-node is-last-root">
                    <div
                        className={`tree-item ${filter === "queue" ? "selected" : ""}`}
                        onClick={() => setFilter("queue")}
                    >
                        <span
                            className="tree-toggle"
                            onClick={(e) => toggleExpand("queue", e)}
                            title={expanded.queue ? "Thu gọn" : "Mở rộng"}
                        >
                            {expanded.queue ? "−" : "+"}
                        </span>
                        <span className="tree-icon">
                            <img src="/icons/Opened_Folder.png" alt="Danh sách chờ tải" />
                        </span>
                        <span className="tree-label">Danh sách chờ tải</span>
                        <span className="tree-count">{countForFilter("queue")}</span>
                    </div>

                    {expanded.queue && (
                        <div className="tree-sub-group">
                            <div
                                className={`tree-item tree-sub-row ${filter === "queue:main" ? "selected" : ""}`}
                                onClick={() => setFilter("queue:main")}
                            >
                                <span className="tree-icon">
                                    <img src="/icons/Opened_Folder.png" alt="Danh sách chờ tải chính" />
                                </span>
                                <span className="tree-label">Danh sách chờ tải chính</span>
                                <span className="tree-count">{countForFilter("queue:main")}</span>
                            </div>
                            <div
                                className={`tree-item tree-sub-row is-last ${filter === "queue:sync" ? "selected" : ""}`}
                                onClick={() => setFilter("queue:sync")}
                            >
                                <span className="tree-icon">
                                    <img src="/icons/Downloads_Folder.png" alt="Đồng bộ danh sách chờ tải" />
                                </span>
                                <span className="tree-label">Đồng bộ danh sách chờ tải</span>
                                <span className="tree-count">{countForFilter("queue:sync")}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
