import type { CommandSurfaceThreadState } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";
import { createEmptyThreadState } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadState";

const THREAD_STORAGE_KEY = "alloy-adminv2-command-surface-thread";
const THREAD_EXPANDED_KEY = "alloy-adminv2-command-surface-thread-expanded";

export type PersistedCommandSurfaceSession = {
    thread: CommandSurfaceThreadState;
    threadExpanded: boolean;
};

export function loadPersistedCommandSurfaceSession(): PersistedCommandSurfaceSession {
    if (typeof window === "undefined") {
        return { thread: createEmptyThreadState(), threadExpanded: true };
    }
    try {
        const raw = sessionStorage.getItem(THREAD_STORAGE_KEY);
        const expandedRaw = sessionStorage.getItem(THREAD_EXPANDED_KEY);
        if (!raw) {
            return { thread: createEmptyThreadState(), threadExpanded: expandedRaw !== "false" };
        }
        const parsed = JSON.parse(raw) as CommandSurfaceThreadState;
        if (!parsed || !Array.isArray(parsed.turns)) {
            return { thread: createEmptyThreadState(), threadExpanded: true };
        }
        return {
            thread: parsed,
            threadExpanded: expandedRaw !== "false",
        };
    } catch {
        return { thread: createEmptyThreadState(), threadExpanded: true };
    }
}

export function persistCommandSurfaceSession(session: PersistedCommandSurfaceSession): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(session.thread));
        sessionStorage.setItem(THREAD_EXPANDED_KEY, session.threadExpanded ? "true" : "false");
    } catch {
        /* ignore quota / private mode */
    }
}

export function clearPersistedCommandSurfaceSession(): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(THREAD_STORAGE_KEY);
        sessionStorage.removeItem(THREAD_EXPANDED_KEY);
    } catch {
        /* ignore */
    }
}
