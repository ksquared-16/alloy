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
    entity_id: string | null;
    entity_type: string | null;
    created_at: string;
    entity_label?: string | null;
    household_label?: string | null;
    contact_label?: string | null;
    status_label?: string | null;
    children_labels?: string[] | null;
    contact_field_label?: string | null;
    location_id?: string | null;
};

type CacheEntry = {
    tasks: CachedOperationalTaskRow[];
    loadedAtMs: number;
};

export type WorkspaceOperationalTasksResult = {
    tasks: CachedOperationalTaskRow[] | null;
    error: string | null;
};

const cache = new Map<OperationalTaskWorkspaceFilter, CacheEntry>();
const inflight = new Map<OperationalTaskWorkspaceFilter, Promise<WorkspaceOperationalTasksResult>>();

const DEFAULT_STALE_MS = 90_000;

/**
 * ONE network fetch per filter, shared by every concurrent caller (the panel, the overview landing,
 * the KPI strip, the nav). Even a forced load joins an in-flight request for the same filter — force
 * bypasses cache freshness, never the in-flight dedupe — so the Work Items open no longer fires the
 * same `/operational-tasks?filter=…` three times. Errors are carried out (not swallowed) so the panel
 * can still surface them.
 */
function runInflightTasksFetch(
    filter: OperationalTaskWorkspaceFilter
): Promise<WorkspaceOperationalTasksResult> {
    const existing = inflight.get(filter);
    if (existing) return existing;

    const p = (async (): Promise<WorkspaceOperationalTasksResult> => {
        try {
            const res = await fetchWorkspaceOperationalTasks(filter);
            const json = await readJson<{ ok?: boolean; tasks?: CachedOperationalTaskRow[]; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) {
                return { tasks: null, error: json.message || json.error || `Request failed (${res.status})` };
            }
            const tasks = Array.isArray(json.tasks) ? json.tasks : [];
            setCachedWorkspaceOperationalTasks(filter, tasks);
            return { tasks, error: null };
        } catch (e) {
            return { tasks: null, error: e instanceof Error ? e.message : "Failed to load tasks" };
        } finally {
            inflight.delete(filter);
        }
    })();
    inflight.set(filter, p);
    return p;
}

/**
 * Warm-first, deduped load. Reuses a fresh cache (paints with no fetch); otherwise shares the single
 * in-flight request. Pass `{ force: true }` after a mutation to bypass cache freshness and revalidate
 * (still deduped). Every Work Items consumer routes through this, so they share one cache and one
 * request per filter — the same treatment the Processing queue/forms warm caches give their surfaces.
 */
export async function loadWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter = "open",
    options?: { force?: boolean }
): Promise<WorkspaceOperationalTasksResult> {
    if (!options?.force) {
        const existing = cache.get(filter);
        if (existing && Date.now() - existing.loadedAtMs < DEFAULT_STALE_MS) {
            return { tasks: existing.tasks, error: null };
        }
    }
    return runInflightTasksFetch(filter);
}

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
    // Fire-and-forget through the shared in-flight so a prefetch and a concurrent load coalesce.
    void runInflightTasksFetch(filter);
}
