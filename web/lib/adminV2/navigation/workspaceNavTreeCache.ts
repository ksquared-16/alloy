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

export type WorkspaceNavTreeDept = {
    id: string;
    name: string | null;
    key?: string | null;
    /**
     * Published department configuration.
     *
     * This has ALWAYS arrived here — `/api/admin/departments` returns it and `depts = dj.items` keeps
     * it — but the type omitted it, so nothing could read it and the subject-scoped provisioning
     * answer re-sent the same ~30 KB on every selection. Declaring it is the whole retention change;
     * the bytes were already in memory and already written to the nav-tree session snapshot.
     */
    metadata?: unknown;
};
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

/**
 * ── RETAINED DEPARTMENT CONFIGURATION (S6-1) ─────────────────────────────────────────────────────
 *
 * Department metadata is reference/operational configuration, so it takes the bounded policy decided
 * in Slice 10 and implemented for Focus Panel Summary in Slice 11: reuse is bounded, expiry does not
 * blank anything, and a failed refresh keeps the last known value.
 *
 * 90s matches the configuration TTL this codebase already uses. There is deliberately no department
 * publish event, BroadcastChannel or subscription here — Slice 10 decided TTL plus foreground
 * revalidation is sufficient for this class, and inventing an event for every reference object is
 * exactly the over-engineering that decision rejected.
 */
export const WORKSPACE_DEPARTMENT_CONFIG_TTL_MS = 90_000;

export type RetainedDepartmentConfig =
    | { usable: false }
    | { usable: true; metadata: unknown; fresh: boolean; loadedAtMs: number };

/**
 * The owner's truthful answer to "do I hold usable configuration for THIS department?".
 *
 * Deliberately not "was /api/admin/departments requested earlier". A caller may only omit the
 * embedded copy when this says `usable`, and scope is part of the question: an unknown department id
 * is a hard miss, never a silent yes.
 *
 * `fresh: false` still counts as usable — that is stale-while-revalidate. Expiry means "refresh in
 * the background", never "stop answering".
 */
export function peekRetainedDepartmentConfig(departmentId: string | null | undefined): RetainedDepartmentConfig {
    const id = (departmentId ?? "").trim();
    if (!id || !memorySnapshot) return { usable: false };
    const dept = memorySnapshot.depts.find((d) => String(d.id) === id);
    const metadata = dept?.metadata;
    if (!dept || metadata == null || typeof metadata !== "object") return { usable: false };
    return {
        usable: true,
        metadata,
        fresh: Date.now() - memorySnapshot.loadedAtMs < WORKSPACE_DEPARTMENT_CONFIG_TTL_MS,
        loadedAtMs: memorySnapshot.loadedAtMs,
    };
}

/**
 * The ONE question the provisioning layer may ask, answered by the owner rather than by provisioning
 * poking at component state: "for this Work Unit, do I already hold the live department configuration
 * the answer would otherwise re-send?"
 *
 * Scope is part of the question. An unknown Work Unit, an unknown department, or a department whose
 * configuration we do not hold is a hard miss — never a silent yes.
 */
export function retainedDepartmentConfigIds(): string[] {
    if (!memorySnapshot) return [];
    return memorySnapshot.depts
        .filter((d) => d.metadata != null && typeof d.metadata === "object")
        .map((d) => String(d.id))
        .filter(Boolean)
        // Bounded on purpose: this rides a URL that is also a cache key, and a tenant with many
        // configured departments must not turn that key into an unbounded string.
        .slice(0, 8);
}

/**
 * The retained configuration for ONE department, for the composition that needs it. Null on any
 * miss — the caller then uses whatever the answer embedded. Kicks a background refresh when stale
 * and never waits for it: an expired entry is still answered from, which is the
 * stale-while-revalidate half of the policy.
 */
export function retainedDepartmentConfigForDepartment(
    departmentId: string | null | undefined,
): Record<string, unknown> | null {
    const retained = peekRetainedDepartmentConfig(departmentId);
    if (!retained.usable) return null;
    if (!retained.fresh) revalidateRetainedDepartmentConfigIfStale();
    return retained.metadata as Record<string, unknown>;
}

/** Background refresh when the retained configuration has aged past the TTL. Never blocks a caller. */
export function revalidateRetainedDepartmentConfigIfStale(): void {
    if (typeof window === "undefined" || !memorySnapshot) return;
    if (Date.now() - memorySnapshot.loadedAtMs < WORKSPACE_DEPARTMENT_CONFIG_TTL_MS) return;
    // `force` refreshes in place; a failure leaves `memorySnapshot` untouched, so the last known
    // configuration stays usable and the next eligible call retries.
    void loadWorkspaceNavTree({ force: true }).catch(() => {});
}

/** @internal test seam — seeds the retained snapshot without a network round trip. */
export function __seedWorkspaceNavTreeForTests(depts: WorkspaceNavTreeDept[], loadedAtMs: number): void {
    memorySnapshot = { depts, wus: [], error: null, loadedAtMs };
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
