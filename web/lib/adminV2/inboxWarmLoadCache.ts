import type { InboxFolder, InboxThreadsListResponse } from "@/lib/communications/inboxThreadTypes";
import {
    type InboxFolderCacheEntry,
    type InboxFolderCacheState,
    inboxFoldersToPrefetch,
    isFolderCacheStale,
    mergeFolderCacheEntry,
} from "@/lib/communications/inboxFolderCache";
import { INBOX_UNREAD_REFRESH_EVENT } from "@/lib/adminV2/inboxNavUnreadCache";

const WARM_LOAD_DELAY_MS = 1_500;
const MODAL_THREAD_LIMIT = 20;

let warmCache: InboxFolderCacheState = {};
let warmInflight: Promise<void> | null = null;
let warmScheduled = false;
const warmListeners = new Set<() => void>();

function notifyWarmListeners(): void {
    warmListeners.forEach((listener) => listener());
}

export function getInboxWarmCacheSnapshot(): InboxFolderCacheState {
    return warmCache;
}

export function subscribeInboxWarmCache(listener: () => void): () => void {
    warmListeners.add(listener);
    return () => warmListeners.delete(listener);
}

async function fetchWarmFolder(folder: InboxFolder): Promise<InboxFolderCacheEntry> {
    const res = await fetch(
        `/api/admin/inbox/threads?folder=${encodeURIComponent(folder)}&limit=${MODAL_THREAD_LIMIT}&compact=1`,
        { credentials: "include" }
    );
    const json = (await res.json().catch(() => ({}))) as InboxThreadsListResponse & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return {
        threads: Array.isArray(json.threads) ? json.threads : [],
        scheduledSends: Array.isArray(json.scheduled_sends) ? json.scheduled_sends : [],
        fetchedAt: Date.now(),
        error: null,
    };
}

export async function warmInboxFolderCache(opts?: { force?: boolean }): Promise<void> {
    if (warmInflight) return warmInflight;

    warmInflight = (async () => {
        for (const folder of inboxFoldersToPrefetch()) {
            const existing = warmCache[folder];
            if (existing && !opts?.force && !isFolderCacheStale(existing)) continue;
            try {
                const entry = await fetchWarmFolder(folder);
                warmCache = mergeFolderCacheEntry(warmCache, folder, entry);
                notifyWarmListeners();
            } catch (e) {
                const message = e instanceof Error ? e.message : "Failed to warm inbox folder";
                warmCache = mergeFolderCacheEntry(warmCache, folder, {
                    threads: existing?.threads ?? [],
                    scheduledSends: existing?.scheduledSends ?? [],
                    fetchedAt: existing?.fetchedAt ?? Date.now(),
                    error: message,
                });
                notifyWarmListeners();
            }
        }
    })().finally(() => {
        warmInflight = null;
    });

    return warmInflight;
}

/** Schedule a single deferred warm pass — safe to call from AdminV2 shell mount. */
export function scheduleInboxWarmLoad(): void {
    if (typeof window === "undefined" || warmScheduled) return;
    warmScheduled = true;

    const run = () => {
        void warmInboxFolderCache();
    };

    window.setTimeout(run, WARM_LOAD_DELAY_MS);
    window.addEventListener(INBOX_UNREAD_REFRESH_EVENT, run);
}

export function mergeInboxWarmCacheIntoPanelCache(
    panelCache: InboxFolderCacheState
): InboxFolderCacheState {
    return { ...warmCache, ...panelCache };
}

export function publishPanelCacheToWarm(panelCache: InboxFolderCacheState): void {
    warmCache = { ...warmCache, ...panelCache };
    notifyWarmListeners();
}
