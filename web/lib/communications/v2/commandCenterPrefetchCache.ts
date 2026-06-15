/**
 * Command Center — client-side warm cache for /api/admin/communications/conversations.
 * Mirrors inbox warm-load pattern so Inbox opens with queue data already in memory.
 */
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";

const CACHE_TTL_MS = 90_000;
const WARM_DELAY_MS = 1_500;

export type CommandCenterCacheSnapshot = {
    conversations: ConversationSummary[];
    fetchedAt: number;
    error: string | null;
};

let cache: CommandCenterCacheSnapshot | null = null;
let inflight: Promise<CommandCenterCacheSnapshot> | null = null;
let warmScheduled = false;
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((l) => l());
}

export function getCommandCenterCacheSnapshot(): CommandCenterCacheSnapshot | null {
    if (!cache) return null;
    if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
    return cache;
}

export function subscribeCommandCenterCache(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export async function prefetchCommandCenterConversations(opts?: {
    force?: boolean;
}): Promise<CommandCenterCacheSnapshot> {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        const empty: CommandCenterCacheSnapshot = { conversations: [], fetchedAt: Date.now(), error: null };
        return empty;
    }

    const fresh = getCommandCenterCacheSnapshot();
    if (fresh && !opts?.force) return fresh;

    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch("/api/admin/communications/conversations", { credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as {
                conversations?: ConversationSummary[];
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            const next: CommandCenterCacheSnapshot = {
                conversations: json.conversations ?? [],
                fetchedAt: Date.now(),
                error: null,
            };
            cache = next;
            notify();
            return next;
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to load conversations";
            const next: CommandCenterCacheSnapshot = {
                conversations: cache?.conversations ?? [],
                fetchedAt: cache?.fetchedAt ?? Date.now(),
                error: message,
            };
            cache = next;
            notify();
            return next;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

/** Deferred warm pass — safe from AdminV2 shell mount. */
export function scheduleCommandCenterPrefetch(): void {
    if (typeof window === "undefined" || warmScheduled) return;
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) return;
    warmScheduled = true;
    window.setTimeout(() => {
        void prefetchCommandCenterConversations();
    }, WARM_DELAY_MS);
}
