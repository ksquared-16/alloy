/**
 * Public link metadata defaults for CRM intake outcomes (Runtime Test 1A).
 */

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IntakeLinkDefaults = {
    default_vertical_id: string | null;
    default_location_id: string | null;
    default_work_unit_id: string | null;
    default_department_id: string | null;
    default_opportunity_status_key: string | null;
};

export type IntakeOpportunitySource = "public_form" | "embed";

function readUuid(m: Record<string, unknown>, key: string): string | null {
    const v = typeof m[key] === "string" ? m[key].trim() : "";
    return UUID_RE.test(v) ? v : null;
}

function readStatusKey(m: Record<string, unknown>): string | null {
    const v = typeof m.default_opportunity_status_key === "string" ? m.default_opportunity_status_key.trim() : "";
    return v.length ? v : null;
}

/** Parse intake routing defaults from `form_public_links.metadata`. */
export function parseIntakeLinkDefaults(
    linkMetadata: Record<string, unknown> | null | undefined
): IntakeLinkDefaults {
    const m = linkMetadata ?? {};
    return {
        default_vertical_id: readUuid(m, "default_vertical_id"),
        default_location_id: readUuid(m, "default_location_id"),
        default_work_unit_id: readUuid(m, "default_work_unit_id"),
        default_department_id: readUuid(m, "default_department_id"),
        default_opportunity_status_key: readStatusKey(m),
    };
}

/**
 * Opportunity `source` for form intake writes.
 * `embed_mode: true` on link metadata → `embed`; optional `intake_opportunity_source` override.
 */
export function resolveIntakeOpportunitySource(
    linkMetadata: Record<string, unknown> | null | undefined
): IntakeOpportunitySource {
    const m = linkMetadata ?? {};
    const explicit =
        typeof m.intake_opportunity_source === "string" ? m.intake_opportunity_source.trim() : "";
    if (explicit === "embed" || explicit === "public_form") return explicit;
    if (m.embed_mode === true) return "embed";
    return "public_form";
}
