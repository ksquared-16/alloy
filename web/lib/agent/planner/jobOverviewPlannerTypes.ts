/**
 * Types for deterministic job overview semantic layout planner (P0/P1).
 * @see docs/implementation/ai-agent-semantic-layout-planner-v1.md
 */

export const JOB_OVERVIEW_PLANNER_VERSION = 1 as const;

/** How person/contact language should be read (see ai-agent-person-contact-overview-doctrine-v1.md). */
export type ContactSemantics = "none" | "identity" | "channels" | "mixed";

export type CatalogBandKey =
    | "summary"
    | "people"
    | "operational"
    | "financial"
    | "relationships"
    | "service_property";

/** Declares phrases with no canonical job overview system_field key (do not invent keys). */
export type JobOverviewCapabilityGap = {
    /** Stable id for tests and UI (e.g. phone, email). */
    id: string;
    synonyms: readonly string[];
    /** Human-readable reason surfaced in rationale / unresolved. */
    reason: string;
};

export type JobOverviewResolutionCatalog = {
    /** Monotonic when synonyms, fields, or gaps change. */
    catalog_version: number;
    band_keys: readonly CatalogBandKey[];
    relationship_group_keys: readonly ("primary_customer_person" | "customer_account")[];
    /** System field keys allowed in overview config (job RRS overview path). */
    system_fields: readonly {
        key: string;
        /** Lowercase substrings; matched with word boundaries where possible. */
        synonyms: readonly string[];
        /** Preferred band when adding as an item. */
        preferred_band: CatalogBandKey;
        /** If true, planner may add to header_keys when intent matches. */
        allow_header: boolean;
    }[];
    /** Phrases that match the request but have no overview key to emit. */
    capability_gaps: readonly JobOverviewCapabilityGap[];
    /** Default items when creating an empty `service_property` band. */
    service_property_default_items: readonly { kind: "system_field"; key: string }[];
};

export type ParsedJobOverviewIntent = {
    hide_financial: boolean;
    show_financial: boolean;
    customer_focused: boolean;
    service_details_higher: boolean;
    /** Raise people/contact band near top (after summary). */
    contact_details_higher: boolean;
    show_main_contact: boolean;
    show_address: boolean;
    show_next_service: boolean;
    /** Service line / type / “what they booked” — maps to catalog fields + service_property band. */
    show_service_details: boolean;
    /** Request mentions phone/email (or similar) which have no canonical overview keys. */
    referenced_unreachable_contact_channels: boolean;
    /** Disambiguation for “contact” / “contact details” utterances. */
    contact_semantics: ContactSemantics;
};

export type ResolvedFieldRef = {
    phrase_matched: string;
    field_key: string;
    confidence: "high" | "medium";
};

export type ResolvedTargetOutcome = {
    kind: "system_field";
    field_key: string;
    phrase_matched: string;
    outcome: "added" | "already_present";
    confidence: "high" | "medium";
};

export type UnresolvedTargetRef = {
    concept_id: string;
    phrase_matched: string;
    reason: string;
};

export type AmbiguityMarker = {
    code: string;
    detail: string;
};

export type DiffSummary = {
    header_keys?: { before: string[]; after: string[] };
    financial_band_enabled?: { before: boolean | null; after: boolean | null };
    band_order?: { before: string[]; after: string[] };
    relationship_group_keys?: { before: string[] | undefined; after: string[] | undefined };
    /** Band keys where enabled flag or items order/length changed vs snapshot. */
    bands_content_changed?: string[];
};

export type JobOverviewPlannerSuccess = {
    ok: true;
    planner_version: typeof JOB_OVERVIEW_PLANNER_VERSION;
    user_request_text: string;
    target: {
        target_kind: "record_overview_layout";
        entity_type: "job";
        surface: "overview";
    };
    parsed_intent: ParsedJobOverviewIntent;
    resolution: {
        /** Legacy summary list (deduped by field_key). */
        fields: ResolvedFieldRef[];
        resolved_outcomes: ResolvedTargetOutcome[];
        unresolved_targets: UnresolvedTargetRef[];
        relationship_groups_touched: boolean;
        bands_touched: CatalogBandKey[];
    };
    rationale: string[];
    ambiguity: AmbiguityMarker[];
    diff_summary: DiffSummary;
    /** False when header/bands/relationship keys are unchanged vs grounded snapshot (version may still bump). */
    effective_layout_change: boolean;
    /** Full replacement config for v1 rail (strict-valid). */
    config: Record<string, unknown>;
    expected_config_version: number;
};

export type JobOverviewPlannerFailure = {
    ok: false;
    user_request_text: string;
    error: string;
    rationale?: string[];
    ambiguity?: AmbiguityMarker[];
};

export type JobOverviewPlannerResult = JobOverviewPlannerSuccess | JobOverviewPlannerFailure;
