import { useState, useEffect, useCallback } from "react";
import { Config, MessageState } from "../view/types";
import { tauriClient } from "../services/tauriClient";

export function useConfig(setMessage: (msg: MessageState) => void) {
    const [config, setConfig] = useState<Config | null>(null);
    const [speedLimiterEnabled, setSpeedLimiterEnabled] = useState(false);

    useEffect(() => {
        tauriClient.getSettings()
            .then(setConfig)
            .catch((e) => setMessage({ text: String(e), type: "error" }));
    }, [setMessage]);

    const handleSaveSettings = useCallback(async () => {
        if (!config) return false;
        try {
            await tauriClient.saveSettings(config);
            setMessage({
                text: "Đã lưu cấu hình. Kết nối và tốc độ áp dụng cho tác vụ mới.",
                type: "success",
            });
            return true;
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
            return false;
        }
    }, [config, setMessage]);

    return {
        config,
        setConfig,
        speedLimiterEnabled,
        setSpeedLimiterEnabled,
        handleSaveSettings,
    };
}
