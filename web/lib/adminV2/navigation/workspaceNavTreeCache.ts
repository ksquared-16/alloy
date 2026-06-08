/**
 * Session-scoped cache for AdminV2 sidebar department / work-unit tree.
 * Avoids refetch-on-every-expand; does not bypass access control (APIs enforce scope).
 */

import {
    readWorkspaceNavTreeSession,
    writeWorkspaceNavTreeSession,
} from "@/lib/adminV2/navigation/workspaceNavTreeSession";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type WorkspaceNavTreeDept = { id: string; name: string | null; key?: string | null };
export type WorkspaceNavTreeWu = {
    id: string;
    name: string | null;
    key?: string | null;
    department_id: string;
    queue_definition?: unknown;
    metadata?: unknown;
};

export type WorkspaceNavTreeSnapshot = {
    depts: WorkspaceNavTreeDept[];
    wus: WorkspaceNavTreeWu[];
    error: string | null;
    loadedAtMs: number;
};

let memorySnapshot: WorkspaceNavTreeSnapshot | null = null;
let inflight: Promise<WorkspaceNavTreeSnapshot> | null = null;

export function getWorkspaceNavTreeSnapshot(): WorkspaceNavTreeSnapshot | null {
    return memorySnapshot;
}

export function clearWorkspaceNavTreeCache(): void {
    memorySnapshot = null;
    inflight = null;
}

/** Memory first, then session — survives hard `location.assign` shell navigation. */
export function hydrateWorkspaceNavTreeCache(): WorkspaceNavTreeSnapshot | null {
    if (memorySnapshot?.depts.length) return memorySnapshot;
    const session = readWorkspaceNavTreeSession();
    if (session?.depts.length) {
        memorySnapshot = session;
        return session;
    }
    return null;
}

/** Warm nav tree as soon as AdminV2 shell mounts (non-blocking). */
export function prefetchWorkspaceNavTree(): void {
    if (memorySnapshot?.depts.length) return;
    const session = readWorkspaceNavTreeSession();
    if (session?.depts.length) {
        memorySnapshot = session;
    }
    void loadWorkspaceNavTree();
}

export function getInitialWorkspaceNavTreeState(): {
    depts: WorkspaceNavTreeDept[];
    wus: WorkspaceNavTreeWu[];
    error: string | null;
    showLoading: boolean;
} {
    const snap = hydrateWorkspaceNavTreeCache();
    const hasDepts = Boolean(snap?.depts.length);
    return {
        depts: snap?.depts ?? [],
        wus: snap?.wus ?? [],
        error: snap?.error ?? null,
        showLoading: !hasDepts && !snap?.error,
    };
}

export async function loadWorkspaceNavTree(options?: { force?: boolean }): Promise<WorkspaceNavTreeSnapshot> {
    if (!options?.force && memorySnapshot && memorySnapshot.depts.length > 0) {
        return memorySnapshot;
    }
    if (!options?.force && inflight) {
        return inflight;
    }

    inflight = (async (): Promise<WorkspaceNavTreeSnapshot> => {
        let depts: WorkspaceNavTreeDept[] = memorySnapshot?.depts ?? [];
        let wus: WorkspaceNavTreeWu[] = memorySnapshot?.wus ?? [];
        let error: string | null = null;

        try {
            const init = workspaceDataFetchInit();
            const [dRes, wRes] = await Promise.all([
                dedupeAdminFetch("/api/admin/departments", init),
                dedupeAdminFetch("/api/admin/work-units", init),
            ]);
            const dj = (await dRes.json().catch(() => ({}))) as { items?: WorkspaceNavTreeDept[] };
            const wj = (await wRes.json().catch(() => ({}))) as { items?: WorkspaceNavTreeWu[] };

            if (dRes.ok) {
                depts = dj.items ?? [];
            } else {
                error = "Departments unavailable";
            }
            if (wRes.ok) {
                wus = wj.items ?? [];
            } else if (!error) {
                error = "Work units unavailable";
            }
        } catch {
            error = "Navigation data unavailable";
            if (!depts.length) depts = [];
            if (!wus.length) wus = [];
        }

        const snapshot: WorkspaceNavTreeSnapshot = {
            depts,
            wus,
            error,
            loadedAtMs: Date.now(),
        };
        memorySnapshot = snapshot;
        if (snapshot.depts.length) {
            writeWorkspaceNavTreeSession(snapshot);
        }
        return snapshot;
    })();

    try {
        return await inflight;
    } finally {
        inflight = null;
    }
}
