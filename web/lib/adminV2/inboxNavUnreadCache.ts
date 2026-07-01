const CACHE_KEY = "alloy:inbox:unread-count:v1";

export function readInboxUnreadCountCache(): number | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw == null) return null;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : null;
    } catch {
        return null;
    }
}

export function writeInboxUnreadCountCache(count: number): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(CACHE_KEY, String(Math.max(0, Math.floor(count))));
    } catch {
        /* ignore */
    }
}

export const INBOX_UNREAD_REFRESH_EVENT = "alloy-comms-unread-refresh";

export function dispatchInboxUnreadRefresh(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(INBOX_UNREAD_REFRESH_EVENT));
}
