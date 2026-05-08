/** Shared helpers for org-scoped CRM pickers (Forms manual linkage). */

export const CRM_ENTITY_SEARCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Avoid breaking PostgREST filters and accidental LIKE wildcards. */
export function sanitizeCrmSearchToken(s: string): string {
    return s.replace(/[%_,\\()."]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);
}

export type CrmSearchEntityType = "person" | "customer" | "customer_member" | "opportunity";

export const CRM_SEARCH_ENTITY_TYPES: readonly CrmSearchEntityType[] = [
    "person",
    "customer",
    "customer_member",
    "opportunity",
] as const;

export function isCrmSearchEntityType(v: string): v is CrmSearchEntityType {
    return (CRM_SEARCH_ENTITY_TYPES as readonly string[]).includes(v);
}

/** Prefer pasted UUID when non-empty; otherwise use picker selection. */
export function effectiveManualLinkUuid(manualRaw: string, pickedId: string | undefined): string | undefined {
    const m = manualRaw.trim();
    if (m.length > 0) return m;
    if (pickedId && pickedId.trim().length > 0) return pickedId.trim();
    return undefined;
}

export function labelPersonRow(p: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
}): string {
    const fn = (p.full_name ?? "").trim();
    if (fn) return fn;
    const a = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return a || "—";
}
