/** URL slug segment for a work unit or queue lane — derived from `work_units.key` or queue `queues[].key`. */
export function workUnitKeyToRouteSlug(key: string): string {
    return key
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/_/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/** Decode operator URL slug back to platform key form (`new-leads` → `new_leads`). */
export function workUnitRouteSlugToKey(slug: string): string {
    return slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/-/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

export function workUnitRouteSlugsEquivalent(a: string, b: string): boolean {
    return workUnitRouteSlugToKey(a) === workUnitRouteSlugToKey(b);
}
