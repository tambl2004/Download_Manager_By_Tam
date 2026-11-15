import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { addCollection } from "@iconify/react";
import fluentColorIcons from "@iconify-json/fluent-color/icons.json";
import "./style.css";

import {
    ActiveMenu,
    ToolbarBtnSize,
    ToolbarTheme,
    TrayStyle,
    MessageState,
    MenuBar,
    Toolbar,
    Sidebar,
    TaskTable,
    TaskDetail,
    StatusBar,
    ContextMenu,
    AddDialog,
    SettingsDialog,
    MessageBar,
} from "./view";

import { tauriClient } from "./services/tauriClient";
import { useDownloads } from "./hooks/useDownloads";
import { useConfig } from "./hooks/useConfig";

// Nạp dữ liệu Fluent UI System Color Icons offline
addCollection({
    ...(fluentColorIcons as any),
    aliases: {
        ...((fluentColorIcons as any).aliases || {}),
        "folder-24": { parent: "document-folder-24" },
        "settings-24": { parent: "settings-24" },
    },
});

function App() {
    const [message, setMessage] = useState<MessageState>(null);
    const {
        tasks,
        rates,
        selectedId,
        setSelectedId,
        selectedTask,
        filter,
        setFilter,
        sortBy,
        setSortBy,
        expanded,
        toggleExpand,
        refresh,
        act,
        sortedTasks,
        countForFilter,
        totalSpeed,
        activeCount,
    } = useDownloads(setMessage);

    const {
        config,
        setConfig,
        speedLimiterEnabled,
        setSpeedLimiterEnabled,
        handleSaveSettings,
    } = useConfig(setMessage);

    // UI visibility & preferences
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [showToolbar] = useState(true);
    const [showStatusbar] = useState(true);
    const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
    const [toolbarBtnSize, setToolbarBtnSize] = useState<ToolbarBtnSize>("large");
    const [toolbarTheme, setToolbarTheme] = useState<ToolbarTheme>("neon");
    const [trayStyle, setTrayStyle] = useState<TrayStyle>("3d");
    const [darkMode, setDarkMode] = useState<boolean>(false);
    const [currentFont, setCurrentFont] = useState<string>("");
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);

    // Add dialog input state
    const [addUrl, setAddUrl] = useState("");
    const [addName, setAddName] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Close context menu on click outside
    useEffect(() => {
        const handler = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener("click", handler);
            return () => document.removeEventListener("click", handler);
        }
    }, [contextMenu]);

    // Close menubar dropdown menu on click outside or Escape
    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".menubar")) {
                setActiveMenu(null);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setActiveMenu(null);
            }
        };
        window.addEventListener("click", handleGlobalClick);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("click", handleGlobalClick);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const handleAdd = useCallback(async () => {
        const trimUrl = addUrl.trim();
        const trimName = addName.trim();
        if (!trimUrl) return;
        try {
            await tauriClient.addTask(trimUrl, trimName);
            setAddUrl("");
            setAddName("");
            setShowAddDialog(false);
            await refresh();
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
        }
    }, [addUrl, addName, refresh]);

    const exportUrls = useCallback((format: "ef2" | "txt") => {
        const urls = tasks.map((t) => t.url).filter(Boolean);
        if (urls.length === 0) {
            setMessage({ text: "Không có liên kết nào để xuất", type: "error" });
            return;
        }
        let content = "";
        if (format === "ef2") {
            content = tasks.map((t) => `<${t.url}>\r\nfile: ${t.name}\r\n`).join("\r\n");
        } else {
            content = urls.join("\r\n");
        }
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = format === "ef2" ? "mydm_export.ef2" : "mydm_export.txt";
        a.click();
        URL.revokeObjectURL(url);
        setMessage({
            text: format === "ef2" ? "Đã xuất ra tệp tin kết xuất IDM (.ef2)" : "Đã xuất ra tệp văn bản (.txt)",
            type: "success",
        });
    }, [tasks]);

    const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
            const urls: string[] = [];
            for (const line of lines) {
                const m = line.match(/<([^>]+)>/) || line.match(/^(https?:\/\/[^\s]+)/i);
                if (m) urls.push(m[1]);
            }
            if (urls.length > 0) {
                setAddUrl(urls[0]);
                setShowAddDialog(true);
                setMessage({ text: `Đã đọc ${urls.length} liên kết từ tệp`, type: "success" });
            } else {
                setMessage({ text: "Không tìm thấy liên kết hợp lệ trong tệp", type: "error" });
            }
        } catch (err) {
            setMessage({ text: String(err), type: "error" });
        }
        e.target.value = "";
    }, []);

    return (
        <div
            className={`app ${darkMode ? "dark-mode" : ""}`}
            style={currentFont ? { fontFamily: `${currentFont}, sans-serif` } : undefined}
            onClick={() => setContextMenu(null)}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportFile}
                accept=".txt,.ef2"
                style={{ display: "none" }}
            />

            <MenuBar
                tasks={tasks}
                activeMenu={activeMenu}
                setActiveMenu={setActiveMenu}
                act={act}
                setMessage={setMessage}
                setShowAddDialog={setShowAddDialog}
                setAddUrl={setAddUrl}
                setFilter={setFilter}
                exportUrls={exportUrls}
                fileInputRef={fileInputRef}
                speedLimiterEnabled={speedLimiterEnabled}
                setSpeedLimiterEnabled={setSpeedLimiterEnabled}
                setShowSettings={setShowSettings}
                showSidebar={showSidebar}
                setShowSidebar={setShowSidebar}
                sortBy={sortBy}
                setSortBy={setSortBy}
                toolbarBtnSize={toolbarBtnSize}
                setToolbarBtnSize={setToolbarBtnSize}
                toolbarTheme={toolbarTheme}
                setToolbarTheme={setToolbarTheme}
                trayStyle={trayStyle}
                setTrayStyle={setTrayStyle}
                darkMode={darkMode}
                setDarkMode={setDarkMode}
                currentFont={currentFont}
                setCurrentFont={setCurrentFont}
            />

            <Toolbar
                showToolbar={showToolbar}
                toolbarBtnSize={toolbarBtnSize}
                tasks={tasks}
                selectedTask={selectedTask}
                act={act}
                setShowAddDialog={setShowAddDialog}
                setShowSettings={setShowSettings}
                setMessage={setMessage}
                onRefresh={refresh}
            />

            <MessageBar message={message} onClose={() => setMessage(null)} />

            <div className="main">
                <Sidebar
                    showSidebar={showSidebar}
                    setShowSidebar={setShowSidebar}
                    filter={filter}
                    setFilter={setFilter}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    countForFilter={countForFilter}
                />

                <div className="content">
                    <TaskTable
                        tasks={sortedTasks}
                        rates={rates}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        setContextMenu={setContextMenu}
                        setMessage={setMessage}
                    />

                    <TaskDetail selectedTask={selectedTask} rates={rates} />
                </div>
            </div>

            <StatusBar
                showStatusbar={showStatusbar}
                filteredCount={sortedTasks.length}
                totalCount={tasks.length}
                isFiltered={filter !== "all"}
                activeCount={activeCount}
                totalSpeed={totalSpeed}
            />

            <ContextMenu
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
                tasks={tasks}
                act={act}
                setMessage={setMessage}
            />

            <AddDialog
                show={showAddDialog}
                onClose={() => setShowAddDialog(false)}
                addUrl={addUrl}
                setAddUrl={setAddUrl}
                addName={addName}
                setAddName={setAddName}
                configFolder={config?.folder}
                onAdd={handleAdd}
            />

            <SettingsDialog
                show={showSettings}
                onClose={() => setShowSettings(false)}
                config={config}
                setConfig={setConfig}
                onSave={handleSaveSettings}
            />
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<App />);
