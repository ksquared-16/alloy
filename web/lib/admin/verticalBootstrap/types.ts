/**
 * Vertical bootstrap v1 — config contract for applying Growth org structure
 * (statuses, departments, work units + queue_definition). Used by admin preview/apply
 * and intended for a future AI config agent.
 */

export type VerticalBootstrapDepartmentInput = {
    key: string;
    name: string;
    description?: string | null;
    sort_order?: number;
    is_active?: boolean;
    /** Reserved; merged as {} when absent. */
    metadata?: Record<string, unknown>;
};

export type VerticalBootstrapStatusInput = {
    entity_type: string;
    status_key: string;
    status_label: string;
    sort_order?: number;
    is_active?: boolean;
    /** Must include lifecycle_stage when present (validated). */
    metadata?: Record<string, unknown>;
};

export type VerticalBootstrapWorkUnitInput = {
    department_key: string;
    key: string;
    name: string;
    description?: string | null;
    sort_order?: number;
    is_active?: boolean;
    queue_definition?: unknown;
    metadata?: Record<string, unknown>;
};

/**
 * Carried in the same JSON the AI config agent will emit; preview echoes it, apply ignores it until
 * those surfaces are wired. Keeps “configuration first” documentation alongside structural rows.
 */
export type VerticalBootstrapOnboardingContextV1 = {
    /** e.g. childcare, home_services — informational until org↔industry binding uses it */
    industry_key?: string;
    industry_label?: string;
    /** Human labels for UI copy / future terminology tables */
    terminology?: Record<string, string>;
    /** What the product should do after bootstrap — many steps remain code/catalog today */
    action_expectations?: Array<{
        id: string;
        description: string;
        phase?: string;
        applies_to?: string;
        deferred_to_product?: boolean;
    }>;
    /** Quote intake / field catalog registration — not applied by vertical-bootstrap v1 */
    starter_field_intake?: {
        registration: "deferred";
        notes?: string;
        suggested_inputs_for_quote?: string[];
    };
};

/** v1 payload — apply persists departments, status_definitions, work_units only. */
export type VerticalBootstrapPayloadV1 = {
    schema_version: 1;
    /** Informational — not written to DB in v1. */
    vertical_key?: string;
    /** Preview/audit only until onboarding service persists it */
    onboarding_context?: VerticalBootstrapOnboardingContextV1;
    departments: VerticalBootstrapDepartmentInput[];
    status_definitions: VerticalBootstrapStatusInput[];
    work_units: VerticalBootstrapWorkUnitInput[];
};

export type VerticalBootstrapMode = "preview" | "apply";

export type BootstrapRowAction = "create" | "update" | "noop";

export type VerticalBootstrapDepartmentPreview = {
    key: string;
    action: BootstrapRowAction;
    existing_id: string | null;
    after: {
        name: string;
        description: string | null;
        sort_order: number;
        is_active: boolean;
    };
};

export type VerticalBootstrapStatusPreview = {
    entity_type: string;
    status_key: string;
    action: BootstrapRowAction;
    existing_id: string | null;
    after: {
        status_label: string;
        sort_order: number;
        is_active: boolean;
        metadata: Record<string, unknown>;
    };
};

export type VerticalBootstrapWorkUnitPreview = {
    department_key: string;
    department_id: string | null;
    department_missing: boolean;
    key: string;
    action: BootstrapRowAction;
    existing_id: string | null;
    after: {
        name: string;
        description: string | null;
        sort_order: number;
        is_active: boolean;
        queue_definition: Record<string, unknown>;
    };
};

export type VerticalBootstrapPreviewResult = {
    ok: boolean;
    errors: string[];
    warnings: string[];
    onboarding_context?: VerticalBootstrapOnboardingContextV1;
    departments: VerticalBootstrapDepartmentPreview[];
    status_definitions: VerticalBootstrapStatusPreview[];
    work_units: VerticalBootstrapWorkUnitPreview[];
};

export type VerticalBootstrapApplySummary = {
    departments_created: number;
    departments_updated: number;
    status_definitions_created: number;
    status_definitions_updated: number;
    work_units_created: number;
    work_units_updated: number;
};

export type VerticalBootstrapApplyResult =
    | { ok: true; summary: VerticalBootstrapApplySummary }
    | { ok: false; error: string };
