/**
 * Canonical Business Process label projection for Work Items (single source).
 */

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

export type WorkItemBpLabelCatalog = {
    processLabels: Record<string, string>;
    stageLabels: Record<string, string>;
};

let cachedCatalog: WorkItemBpLabelCatalog | null = null;
let inflight: Promise<WorkItemBpLabelCatalog> | null = null;

function humanizeKey(key: string): string {
    const cleaned = key.replace(/[_-]+/g, " ").trim();
    if (!cleaned) return key;
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildWorkItemBpLabelCatalogFromEntries(entries: LifecycleCatalogEntry[]): WorkItemBpLabelCatalog {
    const processLabels: Record<string, string> = {};
    const stageLabels: Record<string, string> = {};

    for (const entry of entries) {
        const deptId = entry.department_id?.trim();
        if (deptId) {
            processLabels[deptId] = entry.lifecycle_name?.trim() || entry.department_name?.trim() || humanizeKey(deptId);
        }
        const processKey = entry.process_key?.trim();
        if (processKey && deptId && !processLabels[processKey]) {
            processLabels[processKey] = processLabels[deptId];
        }
    }

    return { processLabels, stageLabels };
}

export async function fetchWorkItemBpLabelCatalog(): Promise<WorkItemBpLabelCatalog> {
    if (cachedCatalog) return cachedCatalog;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch("/api/admin/lifecycle-catalog", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to load lifecycle catalog");
            const json = (await res.json()) as { entries?: LifecycleCatalogEntry[] };
            cachedCatalog = buildWorkItemBpLabelCatalogFromEntries(Array.isArray(json.entries) ? json.entries : []);
            return cachedCatalog;
        } catch {
            cachedCatalog = { processLabels: {}, stageLabels: {} };
            return cachedCatalog;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

export function resetWorkItemBpLabelCatalogForTests(): void {
    cachedCatalog = null;
    inflight = null;
}
