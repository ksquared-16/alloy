/**
 * Command Center — client-side warm cache for conversations + first selected workspace.
 * Mirrors inbox warm-load pattern so the modal opens with queue + first conversation ready.
 */
import {
    flattenVisibleConversationIds,
    groupConversationsByQueue,
    resolveCommandCenterSelection,
    visibleCommandCenterQueues,
    type ConversationSummary,
} from "@/lib/communications/v2/commandCenterViewModel";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import type { FamilyCommunicationWorkspaceVM, TimelineEventVM } from "@/lib/communications/v2/familyWorkspace/types";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";

const CACHE_TTL_MS = 90_000;

export type CommandCenterCacheSnapshot = {
    conversations: ConversationSummary[];
    fetchedAt: number;
    error: string | null;
};

export type CommandCenterThreadMessageWarm = {
    id?: string;
    direction?: string | null;
    channel?: string | null;
    body?: string | null;
    created_at?: string | null;
    opened_at?: string | null;
    replied_at?: string | null;
    kind?: string | null;
    thread_id?: string | null;
    status?: string | null;
};

export type CommandCenterFirstConversationWarm = {
    conversationId: string;
    customerId: string | null;
    workspace: FamilyCommunicationWorkspaceVM | null;
    threadMessages: CommandCenterThreadMessageWarm[] | null;
    fetchedAt: number;
};

let cache: CommandCenterCacheSnapshot | null = null;
let firstConversationWarm: CommandCenterFirstConversationWarm | null = null;
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

export function getCommandCenterFirstConversationWarm(): CommandCenterFirstConversationWarm | null {
    if (!firstConversationWarm) return null;
    if (Date.now() - firstConversationWarm.fetchedAt > CACHE_TTL_MS) return null;
    return firstConversationWarm;
}

export function getCommandCenterWarmSelectedConversationId(): string | null {
    return getCommandCenterFirstConversationWarm()?.conversationId ?? null;
}

export function subscribeCommandCenterCache(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Resolve first auto-selected conversation id from a conversation list (pure). */
export function resolveCommandCenterWarmSelection(conversations: ConversationSummary[]): string | null {
    const grouped = groupConversationsByQueue(conversations);
    const sections = visibleCommandCenterQueues(grouped);
    const visibleIds = flattenVisibleConversationIds(sections);
    return resolveCommandCenterSelection(null, visibleIds);
}

function mapTimelineToThreadMessages(events: TimelineEventVM[]): CommandCenterThreadMessageWarm[] {
    return events.map((e) => ({
        id: e.id,
        direction: e.direction,
        channel: e.channel,
        body: e.body,
        created_at: e.createdAt,
        opened_at: e.openedAt,
        replied_at: e.repliedAt,
        kind: e.kind,
        thread_id: e.threadId,
        status: e.status,
    }));
}

async function warmFirstConversationWorkspace(
    conversations: ConversationSummary[],
    selectionId?: string | null
): Promise<void> {
    const firstId = selectionId ?? resolveCommandCenterWarmSelection(conversations);
    if (!firstId) return;

    const conv = conversations.find((c) => c.id === firstId);
    const customerId = conv?.customer_id?.trim() ?? null;
    const liveWorkspace = isCommsV2FlagEnabled("comms_v2_live_workspace");

    try {
        if (liveWorkspace && customerId) {
            const res = await fetch(
                `/api/admin/communications/family-workspace?customer_id=${encodeURIComponent(customerId)}&thread_id=${encodeURIComponent(firstId)}`,
                { credentials: "include" }
            );
            if (!res.ok) return;
            const data = (await res.json()) as { workspace?: FamilyCommunicationWorkspaceVM };
            if (!data.workspace) return;
            firstConversationWarm = {
                conversationId: firstId,
                customerId,
                workspace: data.workspace,
                threadMessages: mapTimelineToThreadMessages(data.workspace.messages ?? []),
                fetchedAt: Date.now(),
            };
            notify();
            return;
        }

        const res = await fetch(`/api/admin/communications/threads/${encodeURIComponent(firstId)}/messages`, {
            credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: CommandCenterThreadMessageWarm[] } | CommandCenterThreadMessageWarm[];
        const messages = Array.isArray(data) ? data : (data.messages ?? []);
        firstConversationWarm = {
            conversationId: firstId,
            customerId,
            workspace: null,
            threadMessages: messages,
            fetchedAt: Date.now(),
        };
        notify();
    } catch {
        /* warm is best-effort */
    }
}

export async function prefetchCommandCenterConversations(opts?: {
    force?: boolean;
}): Promise<CommandCenterCacheSnapshot> {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        const empty: CommandCenterCacheSnapshot = { conversations: [], fetchedAt: Date.now(), error: null };
        return empty;
    }

    const fresh = getCommandCenterCacheSnapshot();
    if (fresh && !opts?.force) {
        if (!getCommandCenterFirstConversationWarm() && fresh.conversations.length > 0) {
            void warmFirstConversationWorkspace(fresh.conversations);
        }
        return fresh;
    }

    if (inflight && !opts?.force) return inflight;

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
            if (next.conversations.length > 0) {
                await warmFirstConversationWorkspace(next.conversations);
            }
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

/** Intent/hover/open — reuses in-flight warm when present. */
export function warmCommandCenterModal(): Promise<CommandCenterCacheSnapshot> {
    return prefetchCommandCenterConversations();
}

/** Deferred warm pass — after primary workspace surface is ready. */
export function scheduleCommandCenterPrefetch(): void {
    if (typeof window === "undefined" || warmScheduled) return;
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) return;
    warmScheduled = true;
    runWhenAdminV2PrimarySurfaceReady(() => {
        void prefetchCommandCenterConversations();
    }, "command_center_warm");
}

/** Test-only reset. */
export function resetCommandCenterPrefetchCacheForTests(): void {
    cache = null;
    firstConversationWarm = null;
    inflight = null;
    warmScheduled = false;
    listeners.clear();
}
