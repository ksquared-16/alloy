import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    fetchWorkspaceOperationalTasks,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

export type CachedOperationalTaskRow = {
    id: string;
    title: string;
    description: string | null;
    due_at: string;
    status: string;
    source: string;
    entity_id: string;
    entity_type: string;
    created_at: string;
};

type CacheEntry = {
    tasks: CachedOperationalTaskRow[];
    loadedAtMs: number;
};

const cache = new Map<OperationalTaskWorkspaceFilter, CacheEntry>();
const inflight = new Map<OperationalTaskWorkspaceFilter, Promise<CachedOperationalTaskRow[] | null>>();

const DEFAULT_STALE_MS = 90_000;

export function getCachedWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter = "open"
): CachedOperationalTaskRow[] | null {
    return cache.get(filter)?.tasks ?? null;
}

export function setCachedWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter,
    tasks: CachedOperationalTaskRow[]
): void {
    cache.set(filter, { tasks, loadedAtMs: Date.now() });
}

export function clearOperationalTasksWorkspaceCache(): void {
    cache.clear();
    inflight.clear();
}

/**
 * Warm workspace task list for modal open (non-blocking).
 * Returns cached rows when fresh enough; otherwise fetches in background.
 */
export function prefetchWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter = "open",
    options?: { maxAgeMs?: number }
): void {
    const maxAge = options?.maxAgeMs ?? DEFAULT_STALE_MS;
    const existing = cache.get(filter);
    if (existing && Date.now() - existing.loadedAtMs < maxAge) return;
    if (inflight.has(filter)) return;

    const p = (async (): Promise<CachedOperationalTaskRow[] | null> => {
        try {
            const res = await fetchWorkspaceOperationalTasks(filter);
            const json = await readJson<{ ok?: boolean; tasks?: CachedOperationalTaskRow[] }>(res);
            if (!res.ok || !json.ok) return null;
            const tasks = Array.isArray(json.tasks) ? json.tasks : [];
            setCachedWorkspaceOperationalTasks(filter, tasks);
            return tasks;
        } catch {
            return null;
        } finally {
            inflight.delete(filter);
        }
    })();
    inflight.set(filter, p);
}
