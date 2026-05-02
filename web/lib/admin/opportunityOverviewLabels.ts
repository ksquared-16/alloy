/**
 * Opportunity drawer Overview: explicit FK → hydrated labels from GET /api/admin/entity/opportunities/:id.
 * Do not rely on generic UUID heuristics for these keys.
 */
export const OPPORTUNITY_OVERVIEW_RELATIONSHIP_FIELD_KEYS = [
    "customer_id",
    "primary_person_id",
    "primary_contact_id",
    "contact_id",
    "location_id",
    "vertical_id",
    "pipeline_stage_id",
] as const;

const OPP_REL_KEY_SET = new Set<string>(OPPORTUNITY_OVERVIEW_RELATIONSHIP_FIELD_KEYS);

function trimNonEmpty(s: unknown): string | null {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length > 0 ? t : null;
}

function hasNonEmptyFk(record: Record<string, unknown>, fkKey: string): boolean {
    const v = record[fkKey];
    if (v == null) return false;
    return String(v).trim() !== "";
}

/**
 * @returns `undefined` — not one of the mapped opportunity relationship keys.
 * @returns string — label to show (`""` if FK set but label missing — caller shows "—").
 */
export function opportunityOverviewRelationshipReadLabel(
    record: Record<string, unknown>,
    fieldKey: string
): string | undefined {
    const k = fieldKey.trim();
    if (!OPP_REL_KEY_SET.has(k)) {
        return undefined;
    }
    switch (k) {
        case "customer_id":
            if (!hasNonEmptyFk(record, "customer_id")) return undefined;
            return trimNonEmpty(record._customer_name) ?? "";
        case "primary_person_id":
            if (!hasNonEmptyFk(record, "primary_person_id")) return undefined;
            return trimNonEmpty(record._primary_person_name) ?? "";
        // LEGACY: contact-based identity (do not extend). TODO: migrate to person_id
        case "primary_contact_id":
            if (!hasNonEmptyFk(record, "primary_contact_id")) return undefined;
            return trimNonEmpty(record._primary_contact_name ?? record._contact_name) ?? "";
        // LEGACY: contact-based identity (do not extend). TODO: migrate to person_id
        case "contact_id":
            if (!hasNonEmptyFk(record, "contact_id") && !hasNonEmptyFk(record, "primary_contact_id")) return undefined;
            return trimNonEmpty(record._primary_contact_name ?? record._contact_name) ?? "";
        case "location_id":
            if (!hasNonEmptyFk(record, "location_id") && !hasNonEmptyFk(record, "_location_id")) return undefined;
            return trimNonEmpty(record._location_label ?? record._location_name) ?? "";
        case "vertical_id":
            if (!hasNonEmptyFk(record, "vertical_id")) return undefined;
            return trimNonEmpty(record._vertical_name) ?? "";
        case "pipeline_stage_id":
            if (!hasNonEmptyFk(record, "pipeline_stage_id")) return undefined;
            return trimNonEmpty(record._pipeline_stage_name ?? record._stage_name) ?? "";
        default:
            return undefined;
    }
}

/** Status / stage line: never show raw stage id as the primary label. */
export function opportunityOverviewStatusBadgeLabel(record: Record<string, unknown>): string | null {
    const disp = trimNonEmpty(record._status_display);
    if (disp) return disp;
    const stage = trimNonEmpty(record._pipeline_stage_name ?? record._stage_name);
    if (stage) return stage;
    return null;
}
