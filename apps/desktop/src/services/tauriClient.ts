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
};
