import React from "react";
import { MessageState } from "./types";

interface MessageBarProps {
    message: MessageState;
    onClose: () => void;
}

export const MessageBar: React.FC<MessageBarProps> = ({ message, onClose }) => {
    if (!message) return null;

    return (
        <div className={`message-bar ${message.type}`} role="alert">
            <span>{message.text}</span>
            <button onClick={onClose} aria-label="Đóng thông báo">✕</button>
        </div>
    );
};
