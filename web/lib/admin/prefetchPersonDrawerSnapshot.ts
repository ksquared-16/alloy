import { entityDataMatchesDrawer } from "@/lib/admin/drawer/entityDataMatchesDrawer";
import { logPersonPrefetch } from "@/lib/admin/drawer/personDrawerPerfLogs";
import {
    stampChildLifecycleOpenContextOnPersonRecord,
    stampParentGuardianOpenContextOnPersonRecord,
    type PersonDrawerOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { putDrawerEntitySnapshot, peekDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";

import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type PersonPrefetchSource =
    | "opportunity_drawer_idle"
    | "person_drawer_idle"
    | "hover"
    | "click";

const inflight = new Map<string, Promise<void>>();

export function isPersonDrawerSnapshotWarm(personId: string): boolean {
    const id = personId.trim();
    if (!id) return false;
    const cached = peekDrawerEntitySnapshot("persons", id);
    return cached != null && entityDataMatchesDrawer(cached, id, "persons");
}

/** Warm person drawer snapshot before navigation (stack back restores opportunity instantly). */
function stampPrefetchOpenSeed(
    record: Record<string, unknown>,
    openSeed: PersonDrawerOpenSeed | undefined
): Record<string, unknown> {
    if (!openSeed) return record;
    if (openSeed.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
        return stampChildLifecycleOpenContextOnPersonRecord(record, openSeed);
    }
    if (openSeed.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
        return stampParentGuardianOpenContextOnPersonRecord(record, openSeed);
    }
    return record;
}

export function prefetchPersonDrawerSnapshot(
    personId: string,
    opts?: { source?: PersonPrefetchSource; childOpenSeed?: PersonDrawerOpenSeed; openSeed?: PersonDrawerOpenSeed }
): void {
    const source = opts?.source ?? "click";
    const openSeed = opts?.openSeed ?? opts?.childOpenSeed;
    const id = personId.trim();
    if (!id) return;

    if (isPersonDrawerSnapshotWarm(id)) {
        const cached = peekDrawerEntitySnapshot("persons", id);
        if (cached) {
            putDrawerEntitySnapshot("persons", id, stampPrefetchOpenSeed(cached, openSeed));
        }
        logPersonPrefetch({ personId: id, source, cacheHit: true, durationMs: 0 });
        return;
    }

    if (inflight.has(id)) return;

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    const url = `/api/admin/entity/persons/${encodeURIComponent(id)}`;
    const init = workspaceDataFetchInit();

    const p = dedupeAdminFetch(url, init)
        .then(async (res) => {
            if (!res.ok) return;
            const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (json && typeof json === "object" && entityDataMatchesDrawer(json, id, "persons")) {
                putDrawerEntitySnapshot("persons", id, stampPrefetchOpenSeed(json, openSeed));
            }
        })
        .catch(() => {})
        .finally(() => {
            inflight.delete(id);
            const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
            logPersonPrefetch({
                personId: id,
                source,
                cacheHit: isPersonDrawerSnapshotWarm(id),
                durationMs: Math.round(endedAt - startedAt),
            });
        });

    inflight.set(id, p);
}

/** Coalesced entity GET — joins prefetch inflight and dedupeAdminFetch for drawer open + composed fetch. */
export async function fetchPersonDrawerEntityCoalesced(
    personId: string,
    opts?: { source?: PersonPrefetchSource; openSeed?: PersonDrawerOpenSeed }
): Promise<Record<string, unknown> | null> {
    const id = personId.trim();
    if (!id) return null;

    const cached = peekDrawerEntitySnapshot("persons", id);
    if (cached && entityDataMatchesDrawer(cached, id, "persons")) {
        return stampPrefetchOpenSeed(cached, opts?.openSeed);
    }

    const existingInflight = inflight.get(id);
    if (existingInflight) {
        await existingInflight.catch(() => {});
        const next = peekDrawerEntitySnapshot("persons", id);
        if (next && entityDataMatchesDrawer(next, id, "persons")) {
            return stampPrefetchOpenSeed(next, opts?.openSeed);
        }
    }

    const url = `/api/admin/entity/persons/${encodeURIComponent(id)}`;
    const init = workspaceDataFetchInit();
    const fetchP = dedupeAdminFetch(url, init)
        .then(async (res) => {
            if (!res.ok) return;
            const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (json && typeof json === "object" && entityDataMatchesDrawer(json, id, "persons")) {
                putDrawerEntitySnapshot("persons", id, stampPrefetchOpenSeed(json, opts?.openSeed));
            }
        })
        .catch(() => {})
        .finally(() => {
            inflight.delete(id);
        });

    inflight.set(id, fetchP);
    await fetchP;

    const resolved = peekDrawerEntitySnapshot("persons", id);
    if (resolved && entityDataMatchesDrawer(resolved, id, "persons")) {
        return stampPrefetchOpenSeed(resolved, opts?.openSeed);
    }
    return null;
}

/** @internal test helper */
export function __clearPersonDrawerPrefetchInflightForTests(): void {
    inflight.clear();
}

/** @internal test helper */
export function __getPersonDrawerPrefetchInflightForTests(): Map<string, Promise<void>> {
    return inflight;
}
