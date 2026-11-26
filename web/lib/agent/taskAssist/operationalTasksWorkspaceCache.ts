import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    fetchWorkspaceOperationalTasks,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { createWarmCache } from "@/lib/runtime/warmCache";

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

export type WorkspaceOperationalTasksResult = {
    tasks: CachedOperationalTaskRow[] | null;
    error: string | null;
};

const DEFAULT_STALE_MS = 90_000;

/**
 * Workspace task list — one shared, deduped, warm-first cache keyed by filter, shared by every consumer
 * (the panel, the overview landing, the KPI strip, the nav) so a Work Items open no longer fires the
 * same `/operational-tasks?filter=…` three times.
 *
 * Built on the shared `createWarmCache` Runtime primitive (`lib/runtime/warmCache.ts`), keyed by filter.
 * The named exports below are a thin, back-compatible facade so existing consumers are unchanged.
 */
const warmCache = createWarmCache<OperationalTaskWorkspaceFilter, CachedOperationalTaskRow[]>({
    keyOf: (filter) => filter,
    staleMs: DEFAULT_STALE_MS,
    errorMessage: "Failed to load tasks",
    fetcher: async (filter) => {
        const res = await fetchWorkspaceOperationalTasks(filter);
        const json = await readJson<{ ok?: boolean; tasks?: CachedOperationalTaskRow[]; error?: string; message?: string }>(res);
        if (!res.ok || !json.ok) {
            throw new Error(json.message || json.error || `Request failed (${res.status})`);
        }
        return Array.isArray(json.tasks) ? json.tasks : [];
    },
});

/**
 * Warm-first, deduped load. Reuses a fresh cache (paints with no fetch); otherwise shares the single
 * in-flight request. Pass `{ force: true }` after a mutation to bypass cache freshness and revalidate
 * (still deduped).
 */
export async function loadWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter = "open",
    options?: { force?: boolean }
): Promise<WorkspaceOperationalTasksResult> {
    const result = await warmCache.warm(filter, options);
    return { tasks: result.data, error: result.error };
}

export function getCachedWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter = "open"
): CachedOperationalTaskRow[] | null {
    return warmCache.get(filter);
}

export function setCachedWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter,
    tasks: CachedOperationalTaskRow[]
): void {
    warmCache.set(filter, tasks);
}

export function clearOperationalTasksWorkspaceCache(): void {
    warmCache.invalidate();
}

/**
 * Warm workspace task list for modal open (non-blocking).
 * Returns cached rows when fresh enough; otherwise fetches in background.
 */
export function prefetchWorkspaceOperationalTasks(
    filter: OperationalTaskWorkspaceFilter = "open",
    options?: { maxAgeMs?: number }
): void {
    if (options?.maxAgeMs != null) {
        const state = warmCache.getState(filter);
        if (state.fetchedAt != null && Date.now() - state.fetchedAt < options.maxAgeMs) return;
    }
    // Fire-and-forget through the shared in-flight so a prefetch and a concurrent load coalesce.
    void warmCache.warm(filter);
}
