/**
 * Types for deterministic job overview semantic layout planner (P0/P1).
 * @see docs/implementation/ai-agent-semantic-layout-planner-v1.md
 */

export const JOB_OVERVIEW_PLANNER_VERSION = 1 as const;

export type CatalogBandKey =
    | "summary"
    | "people"
    | "operational"
    | "financial"
    | "relationships"
    | "service_property";

export type JobOverviewResolutionCatalog = {
    /** Monotonic when synonyms or fields change. */
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
    /** Default items when creating an empty `service_property` band. */
    service_property_default_items: readonly { kind: "system_field"; key: string }[];
};

export type ParsedJobOverviewIntent = {
    hide_financial: boolean;
    show_financial: boolean;
    customer_focused: boolean;
    service_details_higher: boolean;
    show_main_contact: boolean;
    show_address: boolean;
    show_next_service: boolean;
};

export type ResolvedFieldRef = {
    phrase_matched: string;
    field_key: string;
    confidence: "high" | "medium";
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
        fields: ResolvedFieldRef[];
        relationship_groups_touched: boolean;
        bands_touched: CatalogBandKey[];
    };
    rationale: string[];
    ambiguity: AmbiguityMarker[];
    diff_summary: DiffSummary;
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
