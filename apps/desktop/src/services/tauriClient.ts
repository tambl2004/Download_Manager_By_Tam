import { invoke } from "@tauri-apps/api/core";
import { Task, Config } from "../view/types";

/**
 * Type-safe API Client for communicating with the Tauri backend.
 */
export const tauriClient = {
    /** Lấy danh sách toàn bộ tác vụ tải xuống */
    async listTasks(): Promise<Task[]> {
        return invoke<Task[]>("list");
    },

    /** Thêm URL mới vào danh sách tải */
    async addTask(url: string, name: string): Promise<Task> {
        return invoke<Task>("add", { url, name });
    },

    /** Thêm URL mới với các tùy chọn nâng cao (nhóm, thư mục lưu, chế độ tải ngay hay tải sau) */
    async addTaskAdvanced(
        url: string,
        name: string,
        hold: boolean,
        folder?: string,
        category?: string,
        total?: number
    ): Promise<Task> {
        return invoke<Task>("add_task_advanced", { url, name, hold, folder, category, total });
    },

    /** Cập nhật thông tin tác vụ đang chờ xác nhận (held) và tùy chọn kích hoạt tải ngay */
    async updateHeldTask(
        id: string,
        name?: string,
        folder?: string,
        category?: string,
        total?: number,
        startNow: boolean = true
    ): Promise<Task> {
        return invoke<Task>("update_held_task", { id, name, folder, category, total, startNow });
    },

    /** Thăm dò thông tin file trước khi tải (dung lượng, tên file từ server, mime-type) */
    async probe(url: string): Promise<{ size: number | null; filename: string | null; mime_type: string | null }> {
        return invoke<{ size: number | null; filename: string | null; mime_type: string | null }>("probe", { url });
    },

    /** Chọn thư mục bằng hộp thoại Windows chuẩn */
    async pickFolder(): Promise<string | null> {
        return invoke<string | null>("pick_folder");
    },

    /** Thực hiện hành động điều khiển tác vụ (resume, pause, cancel, delete, restart) */
    async taskAction(id: string, action: string): Promise<void> {
        return invoke<void>("action", { id, action });
    },

    /** Lấy cấu hình hiện tại của MyDM Engine */
    async getSettings(): Promise<Config> {
        return invoke<Config>("settings");
    },

    /** Lưu cấu hình mới cho MyDM Engine */
    async saveSettings(settings: Config): Promise<void> {
        return invoke<void>("save_settings", { value: settings });
    },

    /** Mở thư mục chứa file đã tải trong Windows Explorer */
    async openFolder(id: string): Promise<void> {
        return invoke<void>("open_folder", { id });
    },

    /** Mở file bằng ứng dụng mặc định của Windows */
    async openFile(path: string): Promise<void> {
        return invoke<void>("open_file", { path });
    },

    /** Mở hộp thoại Open with... của Windows cho file */
    async openWith(path: string): Promise<void> {
        return invoke<void>("open_with", { path });
    },

    /** Mở thư mục và trỏ chọn file trong Windows Explorer */
    async openFolderSelect(path: string): Promise<void> {
        return invoke<void>("open_folder_select", { path });
    },

    /** Hiển thị cửa sổ MyDM lên trên cùng và kích hoạt tiêu điểm */
    async focusWindow(): Promise<void> {
        return invoke<void>("focus_window");
    },

    /** Mở hộp thoại xác nhận xóa tệp tin native Windows với 2 lựa chọn xóa */
    async confirmDeleteDialog(name: string): Promise<"DELETE_ONLY" | "DELETE_FILE" | "CANCEL"> {
        return invoke<"DELETE_ONLY" | "DELETE_FILE" | "CANCEL">("confirm_delete_dialog", { name });
    },
};
