import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

export type OperationalTasksNavCounts = { open: number; due_soon: number; overdue: number };

const cache = new Map<OperationalTaskWorkspaceFilter, { counts: OperationalTasksNavCounts; savedAtMs: number }>();
const TTL_MS = 90_000;

export function readOperationalTasksNavCountsCache(
    filter: OperationalTaskWorkspaceFilter = "open"
): OperationalTasksNavCounts | null {
    const hit = cache.get(filter);
    if (!hit) return null;
    if (Date.now() - hit.savedAtMs > TTL_MS) return null;
    return hit.counts;
}

export function writeOperationalTasksNavCountsCache(
    filter: OperationalTaskWorkspaceFilter,
    counts: OperationalTasksNavCounts
): void {
    cache.set(filter, { counts, savedAtMs: Date.now() });
}
