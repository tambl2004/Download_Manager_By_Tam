import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Task, SidebarFilter, MessageState, getFileCategory } from "../view/types";
import { tauriClient } from "../services/tauriClient";

export function useDownloads(setMessage: (msg: MessageState) => void) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [rates, setRates] = useState<Record<string, number>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [filter, setFilter] = useState<SidebarFilter>("all");
    const [sortBy, setSortBy] = useState<string>("created");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        all: true,
        unfinished: false,
        completed: false,
        queue: false,
    });

    const toggleExpand = useCallback((key: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const last = useRef<{ time: number; data: Task[] }>({ time: Date.now(), data: [] });

    const refresh = useCallback(async () => {
        try {
            const list = await tauriClient.listTasks();
            const now = Date.now();
            const dt = (now - last.current.time) / 1000;
            if (dt > 0) {
                setRates(
                    Object.fromEntries(
                        list.map((t) => [
                            t.id,
                            t.state === "running"
                                ? Math.max(0, (t.done - (last.current.data.find((x) => x.id === t.id)?.done ?? t.done)) / dt)
                                : 0,
                        ])
                    )
                );
            }
            last.current = { time: now, data: list };
            setTasks(list);
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
        }
    }, [setMessage]);

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const tick = async () => {
            await refresh();
            if (active) timer = setTimeout(tick, 800);
        };
        void tick();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [refresh]);

    const act = useCallback(async (id: string, action: string) => {
        if (
            ["delete", "restart"].includes(action) &&
            !confirm(
                action === "delete"
                    ? "Xóa lịch sử và phần tải dở? File đã hoàn tất được giữ lại."
                    : "Xóa phần tải dở và tải lại từ đầu?"
            )
        )
            return;
        try {
            await tauriClient.taskAction(id, action);
            await refresh();
        } catch (e) {
            setMessage({ text: String(e), type: "error" });
        }
    }, [refresh, setMessage]);

    /* Filter tasks */
    const filteredTasks = useMemo(() => {
        return tasks.filter((t) => {
            if (filter === "all") return true;
            if (filter.startsWith("cat:")) {
                return getFileCategory(t.name) === filter.slice(4);
            }
            if (filter === "unfinished") {
                return t.state !== "completed";
            }
            if (filter.startsWith("unfinished:")) {
                return t.state !== "completed" && getFileCategory(t.name) === filter.slice(11);
            }
            if (filter === "completed") {
                return t.state === "completed";
            }
            if (filter.startsWith("completed:")) {
                return t.state === "completed" && getFileCategory(t.name) === filter.slice(10);
            }
            if (filter === "grabber") {
                return t.source === "grabber";
            }
            if (filter === "queue") {
                return t.state === "queued" || t.state === "held";
            }
            if (filter === "queue:main") {
                return t.state === "queued";
            }
            if (filter === "queue:sync") {
                return t.state === "held";
            }
            return true;
        });
    }, [tasks, filter]);

    /* Sorted tasks based on View -> Sắp xếp các tệp */
    const sortedTasks = useMemo(() => {
        return [...filteredTasks].sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name);
            if (sortBy === "size") return (a.total ?? 0) - (b.total ?? 0);
            if (sortBy === "state") return a.state.localeCompare(b.state);
            if (sortBy === "speed") return (rates[b.id] ?? 0) - (rates[a.id] ?? 0);
            if (sortBy === "eta") {
                const speedA = rates[a.id] ?? 0;
                const speedB = rates[b.id] ?? 0;
                const etaA = speedA > 0 && a.total ? (a.total - a.done) / speedA : 9999999;
                const etaB = speedB > 0 && b.total ? (b.total - b.done) / speedB : 9999999;
                return etaA - etaB;
            }
            if (sortBy === "date") return b.created - a.created;
            if (sortBy === "folder") return a.folder.localeCompare(b.folder);
            if (sortBy === "source") return (a.source || "").localeCompare(b.source || "");
            if (sortBy === "desc") return (a.source_host || "").localeCompare(b.source_host || "");
            if (sortBy === "parent") return (a.url || "").localeCompare(b.url || "");
            return b.created - a.created;
        });
    }, [filteredTasks, sortBy, rates]);

    const selectedTask = useMemo(() => {
        return tasks.find((t) => t.id === selectedId);
    }, [tasks, selectedId]);

    const countForFilter = useCallback((f: SidebarFilter): number => {
        if (f === "all") return tasks.length;
        if (f.startsWith("cat:")) {
            return tasks.filter((t) => getFileCategory(t.name) === f.slice(4)).length;
        }
        if (f === "unfinished") {
            return tasks.filter((t) => t.state !== "completed").length;
        }
        if (f.startsWith("unfinished:")) {
            return tasks.filter((t) => t.state !== "completed" && getFileCategory(t.name) === f.slice(11)).length;
        }
        if (f === "completed") {
            return tasks.filter((t) => t.state === "completed").length;
        }
        if (f.startsWith("completed:")) {
            return tasks.filter((t) => t.state === "completed" && getFileCategory(t.name) === f.slice(10)).length;
        }
        if (f === "grabber") {
            return tasks.filter((t) => t.source === "grabber").length;
        }
        if (f === "queue") {
            return tasks.filter((t) => t.state === "queued" || t.state === "held").length;
        }
        if (f === "queue:main") {
            return tasks.filter((t) => t.state === "queued").length;
        }
        if (f === "queue:sync") {
            return tasks.filter((t) => t.state === "held").length;
        }
        return 0;
    }, [tasks]);

    const totalSpeed = useMemo(() => {
        return Object.values(rates).reduce((a, b) => a + b, 0);
    }, [rates]);

    const activeCount = useMemo(() => {
        return tasks.filter((t) => t.state === "running").length;
    }, [tasks]);

    return {
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
    };
}
