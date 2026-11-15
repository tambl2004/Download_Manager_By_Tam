import React from "react";
import { bytes } from "./types";

interface StatusBarProps {
    showStatusbar: boolean;
    filteredCount: number;
    totalCount: number;
    isFiltered: boolean;
    activeCount: number;
    totalSpeed: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
    showStatusbar,
    filteredCount,
    totalCount,
    isFiltered,
    activeCount,
    totalSpeed,
}) => {
    if (!showStatusbar) return null;

    return (
        <div className="statusbar">
            <div className="statusbar-left">
                <span>{filteredCount} tệp{isFiltered ? ` (lọc từ ${totalCount})` : ""}</span>
                <span>{activeCount} đang tải</span>
            </div>
            <div className="statusbar-right">
                {totalSpeed > 0 && <span>Tổng tốc độ: {bytes(totalSpeed)}/s</span>}
                <span>MyDM 0.2</span>
            </div>
        </div>
    );
};
