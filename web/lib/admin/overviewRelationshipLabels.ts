/** UUID v4 pattern — used to avoid showing raw ids in overview when a label exists on the record. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value: unknown): boolean {
    return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * Resolve a human-readable label for FK / relationship fields on entity GET payloads.
 * Keys must match column / field_definition `field_key` values (e.g. `job_id`, `customer_id`).
 */
export function resolveOverviewRelationshipLabel(
    record: Record<string, unknown>,
    fieldKey: string,
    opts?: { linkIdField?: string }
): string | null {
    const tryKeys = [fieldKey, opts?.linkIdField].filter((k): k is string => typeof k === "string" && k.length > 0);
    const seen = new Set<string>();
    for (const k of tryKeys) {
        if (seen.has(k)) continue;
        seen.add(k);
        const label = labelForRelationshipKey(record, k);
        if (label) return label;
    }
    return null;
}

function nonEmpty(s: unknown): string | null {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length > 0 ? t : null;
}

/** Prefer Batch-2 `_relationship_displays` keyed by FK column (e.g. `customer_id`). */
function labelFromRelationshipDisplays(record: Record<string, unknown>, fkColumn: string): string | null {
    const raw = record._relationship_displays;
    if (!raw || typeof raw !== "object") return null;
    const entry = (raw as Record<string, { label?: string | null; record_number?: unknown } | null | undefined>)[fkColumn];
    if (!entry || typeof entry !== "object") return null;
    const label = nonEmpty(entry.label);
    if (label) return label;
    const rn = entry.record_number;
    if (rn != null && rn !== "") {
        const n = typeof rn === "number" ? rn : Number(rn);
        if (Number.isFinite(n)) return `#${n}`;
    }
    return null;
}

function labelForRelationshipKey(record: Record<string, unknown>, k: string): string | null {
    const fromApi = labelFromRelationshipDisplays(record, k);
    if (fromApi) return fromApi;
    switch (k) {
        case "job_id":
            return nonEmpty(record._job_title ?? record._job_label);
        case "location_id":
            return nonEmpty(record._location_label ?? record._location_name);
        case "customer_id":
            return nonEmpty(record._customer_name);
        case "_customer_name":
            return nonEmpty(record._customer_name);
        case "_location_name":
            return nonEmpty(record._location_name ?? record._location_label);
        case "_opportunity_name":
            return nonEmpty(record._opportunity_name);
        case "_primary_person_name":
            return nonEmpty(record._primary_person_name);
        case "primary_contact_id":
            return nonEmpty(record._primary_contact_name ?? record._contact_name);
        case "contact_id":
            return nonEmpty(record._primary_contact_name ?? record._contact_name);
        case "primary_person_id":
            return nonEmpty(record._primary_person_name);
        case "person_id":
            return nonEmpty(record._person_name ?? record._primary_person_name);
        case "opportunity_id":
            return nonEmpty(record._opportunity_name);
        case "assigned_vendor_id":
            return nonEmpty(record._assigned_vendor_name ?? record._vendor_name);
        case "vendor_id":
            return nonEmpty(record._linked_vendor_name ?? record._vendor_name ?? record._assigned_vendor_name);
        case "customer_subscription_id":
            return nonEmpty(record._customer_subscription_label);
        case "vertical_id":
            return nonEmpty(record._vertical_name);
        case "pipeline_stage_id":
            return nonEmpty(record._pipeline_stage_name ?? record._stage_name);
        case "pipeline_id":
            return nonEmpty(record._pipeline_name);
        case "discount_program_id":
            return nonEmpty(record._discount_program_label);
        case "discount_code_id":
            return nonEmpty(record.discount_code ?? record._discount_label);
        default:
            return null;
    }
}
