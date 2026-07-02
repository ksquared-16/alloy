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

/**
 * Route key for a configured Work View — derived from its LABEL, not its id. View ids are
 * slugified from the label the view was CREATED with and survive renames ("Active Pipeline"
 * can carry id `new_work_view_2`), so id-based slugs leak internal keys into operator URLs.
 * Label-derived slugs stay configured-vocabulary end to end; renames rename the URL.
 * Returns null when the label yields nothing routable (label-less views are not navigable).
 */
export function workViewRouteKeyFromLabel(label: string | null | undefined): string | null {
    const key = workUnitRouteSlugToKey(label ?? "");
    return key.length ? key.slice(0, 48) : null;
}
