/**
 * Communications V2 — Announcement Audience Spec (Phase 1 / B8A).
 *
 * The audience is a GRAIN + a set of AND-combined FILTERS (OR within a filter's value
 * list). Status filters carry concrete operator-selected status_keys (sourced from
 * configured status_definitions in the UI); there are NO fixed buckets and NO hardcoded
 * waitlist/active/lead/enrolled concepts. Stored in announcement_targets.target_type='custom'
 * with the spec in rule.audience_spec.
 *
 * Pure types + validation only — NO Supabase, NO HTTP, NO send, NO provider.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type ValidationError = { ok: false; error: string };
export type Validated<T> = { ok: true; value: T };
export type ValidationResult<T> = Validated<T> | ValidationError;
const err = (error: string): ValidationError => ({ ok: false, error });

export const AUDIENCE_GRAINS = ["families", "children"] as const;
export type AudienceGrain = (typeof AUDIENCE_GRAINS)[number];

export const AUDIENCE_FILTER_KINDS = [
    "family_status",
    "child_enrollment_status",
    "location",
    "program",
    "room",
] as const;
export type AudienceFilterKind = (typeof AUDIENCE_FILTER_KINDS)[number];

/** opportunities.status_key (case/family track) — concrete operator-selected keys. */
export type FamilyStatusFilter = { kind: "family_status"; status_keys: string[] };
/** opportunity_customer_members.outcome_status_key (child enrollment track). */
export type ChildEnrollmentStatusFilter = { kind: "child_enrollment_status"; status_keys: string[] };
/** opportunities.location_id (default); OCM location fallback for child grain. */
export type LocationFilter = { kind: "location"; location_ids: string[] };
/** opportunity_customer_members.desired_program_category_id. */
export type ProgramFilter = { kind: "program"; program_category_ids: string[] };
/**
 * opportunity_customer_members.program_room_cohort_key — a TEXT cohort key scoped by
 * location + program. Resolution is UNRESOLVED by design until a safe room option endpoint
 * exists; the location_id + program_category_id scope is required so the key is unambiguous.
 */
export type RoomFilter = {
    kind: "room";
    room_cohort_keys: string[];
    location_id: string;
    program_category_id: string;
};

export type AudienceFilter =
    | FamilyStatusFilter
    | ChildEnrollmentStatusFilter
    | LocationFilter
    | ProgramFilter
    | RoomFilter;

export type AnnouncementAudienceSpec = {
    grain: AudienceGrain;
    /** AND across filters; empty = all families. */
    filters: AudienceFilter[];
};

// ---- validation helpers ----

function nonEmptyStringArray(raw: unknown, label: string): ValidationResult<string[]> {
    if (!Array.isArray(raw)) return err(`${label} must be an array`);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const s = typeof item === "string" ? item.trim() : "";
        if (!s) return err(`${label} must contain only non-empty strings`);
        if (!seen.has(s)) {
            seen.add(s);
            out.push(s);
        }
    }
    if (out.length === 0) return err(`${label} must not be empty`);
    return { ok: true, value: out };
}

function uuidArray(raw: unknown, label: string): ValidationResult<string[]> {
    const res = nonEmptyStringArray(raw, label);
    if (!res.ok) return res;
    for (const id of res.value) if (!UUID_RE.test(id)) return err(`${label} must contain only uuids`);
    return res;
}

function uuidValue(raw: unknown, label: string): ValidationResult<string> {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!UUID_RE.test(s)) return err(`${label} must be a uuid`);
    return { ok: true, value: s };
}

/** Validate a single filter. */
export function validateAudienceFilter(raw: unknown): ValidationResult<AudienceFilter> {
    if (!raw || typeof raw !== "object") return err("each filter must be an object");
    const f = raw as Record<string, unknown>;
    const kind = typeof f.kind === "string" ? f.kind : "";
    if (!(AUDIENCE_FILTER_KINDS as readonly string[]).includes(kind)) return err(`invalid filter kind '${kind}'`);

    switch (kind as AudienceFilterKind) {
        case "family_status": {
            const r = nonEmptyStringArray(f.status_keys, "family_status.status_keys");
            return r.ok ? { ok: true, value: { kind: "family_status", status_keys: r.value } } : r;
        }
        case "child_enrollment_status": {
            const r = nonEmptyStringArray(f.status_keys, "child_enrollment_status.status_keys");
            return r.ok ? { ok: true, value: { kind: "child_enrollment_status", status_keys: r.value } } : r;
        }
        case "location": {
            const r = uuidArray(f.location_ids, "location.location_ids");
            return r.ok ? { ok: true, value: { kind: "location", location_ids: r.value } } : r;
        }
        case "program": {
            const r = uuidArray(f.program_category_ids, "program.program_category_ids");
            return r.ok ? { ok: true, value: { kind: "program", program_category_ids: r.value } } : r;
        }
        case "room": {
            const keys = nonEmptyStringArray(f.room_cohort_keys, "room.room_cohort_keys");
            if (!keys.ok) return keys;
            // Cohort keys are scoped per location + program — required so they are unambiguous.
            const loc = uuidValue(f.location_id, "room.location_id");
            if (!loc.ok) return loc;
            const prog = uuidValue(f.program_category_id, "room.program_category_id");
            if (!prog.ok) return prog;
            return {
                ok: true,
                value: { kind: "room", room_cohort_keys: keys.value, location_id: loc.value, program_category_id: prog.value },
            };
        }
    }
}

/** Validate a full audience spec. Empty filters = all families. */
export function validateAudienceSpec(raw: unknown): ValidationResult<AnnouncementAudienceSpec> {
    if (!raw || typeof raw !== "object") return err("audience_spec must be an object");
    const s = raw as Record<string, unknown>;
    const grain = typeof s.grain === "string" ? s.grain : "";
    if (!(AUDIENCE_GRAINS as readonly string[]).includes(grain)) return err(`invalid grain '${grain}'`);

    const rawFilters = s.filters;
    if (rawFilters !== undefined && !Array.isArray(rawFilters)) return err("filters must be an array");
    const filters: AudienceFilter[] = [];
    for (const rf of (rawFilters as unknown[]) ?? []) {
        const r = validateAudienceFilter(rf);
        if (!r.ok) return r;
        filters.push(r.value);
    }
    return { ok: true, value: { grain: grain as AudienceGrain, filters } };
}

/** Read a validated spec out of an announcement_targets.rule jsonb; null if absent/invalid. */
export function parseAudienceSpecFromRule(rule: unknown): AnnouncementAudienceSpec | null {
    if (!rule || typeof rule !== "object") return null;
    const spec = (rule as Record<string, unknown>).audience_spec;
    if (spec === undefined) return null;
    const res = validateAudienceSpec(spec);
    return res.ok ? res.value : null;
}

/** Wrap a spec for storage in announcement_targets.rule. */
export function audienceSpecToRule(spec: AnnouncementAudienceSpec): { audience_spec: AnnouncementAudienceSpec } {
    return { audience_spec: spec };
}

/**
 * Back-compat adapter: map legacy typed announcement_targets rows to a spec so the
 * resolver has one input model. A 'custom' row carrying rule.audience_spec wins. Legacy
 * bucket rows (active_families/waitlist) are intentionally DROPPED — buckets are no longer
 * resolver concepts (they become saved presets later). Note: legacy multi-target rows were
 * unioned; the spec ANDs filters — only location/program legacy refs convert to filters.
 */
export type LegacyTargetRow = {
    target_type: string;
    target_ref: string | null;
    rule?: Record<string, unknown> | null;
};

export type TargetSpecResolution = { ok: true; spec: AnnouncementAudienceSpec } | { ok: false; error: string };

/**
 * STRICT resolution of announcement_targets rows to a spec (B8B). A 'custom' row is
 * authoritative and MUST carry a valid rule.audience_spec — if it is missing/invalid this
 * returns an error rather than silently broadening to all families. With no custom row,
 * legacy typed rows map via the adapter. No rows at all is an error.
 */
export function resolveTargetsToSpec(rows: LegacyTargetRow[]): TargetSpecResolution {
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "announcement has no audience targets" };
    const custom = rows.find((r) => r.target_type === "custom");
    if (custom) {
        const spec = parseAudienceSpecFromRule(custom.rule ?? null);
        if (!spec) return { ok: false, error: "custom audience target is missing a valid rule.audience_spec" };
        return { ok: true, spec };
    }
    return { ok: true, spec: legacyTargetsToSpec(rows) };
}

export function legacyTargetsToSpec(targets: LegacyTargetRow[]): AnnouncementAudienceSpec {
    for (const t of targets) {
        if (t.target_type === "custom") {
            const spec = parseAudienceSpecFromRule(t.rule ?? null);
            if (spec) return spec;
        }
    }
    const filters: AudienceFilter[] = [];
    for (const t of targets) {
        if (t.target_type === "location" && t.target_ref && UUID_RE.test(t.target_ref)) {
            filters.push({ kind: "location", location_ids: [t.target_ref] });
        } else if (t.target_type === "program" && t.target_ref && UUID_RE.test(t.target_ref)) {
            filters.push({ kind: "program", program_category_ids: [t.target_ref] });
        }
        // all_families → no filter; active_families/waitlist/room → dropped (no bucket resolution).
    }
    return { grain: "families", filters };
}

// ---- preview result shapes (consumed by the resolver IO layer) ----

export type FilterResolution = {
    kind: AudienceFilterKind;
    status: "resolved" | "unresolved";
    family_count: number;
    detail: string;
};

export type AudiencePreview = {
    grain: AudienceGrain;
    total_families: number;
    /** distinct matching children (OCM rows) when child filters apply; null otherwise. */
    matched_children: number | null;
    per_filter: FilterResolution[];
    counts_by_channel: { email: number; sms: number; in_app: number; messageable: number } | null;
    excluded: { opted_out: number };
    unresolved: FilterResolution[];
    sample_recipients: { family: string }[];
    capped: boolean;
};

// ---- public recipient-preview response shape (B8D) ----

export type PerFilterResult = {
    kind: AudienceFilterKind;
    status: "resolved" | "unresolved";
    /** family count when resolved. */
    count?: number;
    /** reason when unresolved (e.g. room needs an option source). */
    reason?: string;
};

export type AudiencePreviewResponse = {
    grain: AudienceGrain;
    matched_families: number;
    /** present only for grain='children'. */
    matched_children?: number | null;
    /** distinct messageable family-guardian recipients. */
    total_recipients: number;
    counts_by_channel: { email: number; sms: number; in_app: number; messageable: number } | null;
    per_filter: PerFilterResult[];
    unresolved: PerFilterResult[];
    excluded: { opted_out: number };
    sample_recipients: { family: string }[];
    capped: boolean;
};

/** Shape an internal AudiencePreview into the public recipient-preview response. Pure. */
export function audiencePreviewResponse(p: AudiencePreview): AudiencePreviewResponse {
    const per_filter: PerFilterResult[] = p.per_filter.map((f) =>
        f.status === "resolved"
            ? { kind: f.kind, status: "resolved", count: f.family_count }
            : { kind: f.kind, status: "unresolved", reason: f.detail }
    );
    return {
        grain: p.grain,
        matched_families: p.total_families,
        ...(p.grain === "children" ? { matched_children: p.matched_children } : {}),
        total_recipients: p.counts_by_channel ? p.counts_by_channel.messageable : 0,
        counts_by_channel: p.counts_by_channel,
        per_filter,
        unresolved: per_filter.filter((f) => f.status === "unresolved"),
        excluded: p.excluded,
        sample_recipients: p.sample_recipients,
        capped: p.capped,
    };
}
