import { entityDataMatchesDrawer } from "@/lib/admin/drawer/entityDataMatchesDrawer";
import { logPersonPrefetch } from "@/lib/admin/drawer/personDrawerPerfLogs";
import {
    stampChildLifecycleOpenContextOnPersonRecord,
    type PersonDrawerOpenSeed,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { putDrawerEntitySnapshot, peekDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";

export type PersonPrefetchSource = "opportunity_drawer_idle" | "hover" | "click";

const inflight = new Map<string, Promise<void>>();

export function isPersonDrawerSnapshotWarm(personId: string): boolean {
    const id = personId.trim();
    if (!id) return false;
    const cached = peekDrawerEntitySnapshot("persons", id);
    return cached != null && entityDataMatchesDrawer(cached, id, "persons");
}

/** Warm person drawer snapshot before navigation (stack back restores opportunity instantly). */
export function prefetchPersonDrawerSnapshot(
    personId: string,
    opts?: { source?: PersonPrefetchSource; childOpenSeed?: PersonDrawerOpenSeed }
): void {
    const source = opts?.source ?? "click";
    const childOpenSeed = opts?.childOpenSeed;
    const id = personId.trim();
    if (!id) return;

    if (isPersonDrawerSnapshotWarm(id)) {
        if (childOpenSeed?.presentation_emphasis === "child_lifecycle") {
            const cached = peekDrawerEntitySnapshot("persons", id);
            if (cached) {
                putDrawerEntitySnapshot(
                    "persons",
                    id,
                    stampChildLifecycleOpenContextOnPersonRecord(cached, childOpenSeed)
                );
            }
        }
        logPersonPrefetch({ personId: id, source, cacheHit: true, durationMs: 0 });
        return;
    }

    if (inflight.has(id)) return;

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    const p = fetch(`/api/admin/entity/persons/${encodeURIComponent(id)}`)
        .then(async (res) => {
            if (!res.ok) return;
            const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (json && typeof json === "object" && entityDataMatchesDrawer(json, id, "persons")) {
                const stamped =
                    childOpenSeed?.presentation_emphasis === "child_lifecycle"
                        ? stampChildLifecycleOpenContextOnPersonRecord(json, childOpenSeed)
                        : json;
                putDrawerEntitySnapshot("persons", id, stamped);
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

/** @internal test helper */
export function __clearPersonDrawerPrefetchInflightForTests(): void {
    inflight.clear();
}

/** @internal test helper */
export function __getPersonDrawerPrefetchInflightForTests(): Map<string, Promise<void>> {
    return inflight;
}
