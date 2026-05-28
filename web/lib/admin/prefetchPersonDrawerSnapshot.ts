import { putDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";

const inflight = new Map<string, Promise<void>>();

/** Warm person drawer snapshot before navigation (stack back restores opportunity instantly). */
export function prefetchPersonDrawerSnapshot(personId: string): void {
    const id = personId.trim();
    if (!id) return;
    if (inflight.has(id)) return;

    const p = fetch(`/api/admin/persons/${encodeURIComponent(id)}`)
        .then(async (res) => {
            if (!res.ok) return;
            const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (json && typeof json === "object") {
                putDrawerEntitySnapshot("persons", id, json);
            }
        })
        .catch(() => {})
        .finally(() => {
            inflight.delete(id);
        });

    inflight.set(id, p);
}

/** @internal test helper */
export function __clearPersonDrawerPrefetchInflightForTests(): void {
    inflight.clear();
}
