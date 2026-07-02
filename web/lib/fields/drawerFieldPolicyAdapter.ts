/**
 * Card 1.5 / C0 — Maps `field_definitions.field_key` to real drawer/PATCH write paths
 * for opportunity and job records. Read-side only; no enforcement.
 */

import {
    resolveEffectiveFieldBehavior,
    type EffectiveFieldBehaviorSource,
} from "@/lib/fields/resolveEffectiveFieldBehavior";
import type { FieldInteractionPolicyV1 } from "@/lib/fields/fieldInteractionPolicy";
import type { FieldRequirementPolicyV1 } from "@/lib/fields/fieldRequirementPolicy";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export type DrawerPolicyEntityType = "opportunity" | "job";

export type DrawerFieldStorage =
    | "column"
    | "field_values"
    | "metadata"
    | "pipeline"
    | "action"
    | "relationship"
    | "computed"
    | "unknown";

export type DrawerFieldPolicyMode = "enforceable" | "display_only" | "never_policy_controlled" | "deferred";

export type DrawerFieldPolicyResolved = {
    entityType: DrawerPolicyEntityType;
    fieldKey: string;
    storage: DrawerFieldStorage;
    bodyKey: string | null;
    policyMode: DrawerFieldPolicyMode;
    requirementSupported: boolean;
    interactionSupported: boolean;
    reason: string;
    /** Card 2 — effective policies for opportunity drawer (placement → definition → preset). */
    requirement?: FieldRequirementPolicyV1;
    interaction?: FieldInteractionPolicyV1;
    requirement_source?: EffectiveFieldBehaviorSource;
    interaction_source?: EffectiveFieldBehaviorSource;
};

export type BuildDrawerFieldPolicyResolvedMapOptions = {
    /** When set (including `null`), opportunity fields get placement-aware effective behavior. */
    layoutConfig?: RecordLayoutConfigJson | null;
};

/** Minimal field_definition row needed for policy mapping (attach + tests). */
export type DrawerFieldDefinitionForPolicy = {
    field_key: string;
    is_system: boolean;
    is_required?: boolean;
    requirement_policy?: unknown;
    interaction_policy?: unknown;
};

/** Enriched attach row: registry fields + optional policy columns (GET only). */
export type DrawerFieldDefinitionAttachRow = DrawerFieldDefinitionForPolicy & {
    id: string;
    field_type: string;
    label: string | null;
    section_key: string | null;
    sort_order: number;
    is_visible_in_drawer: boolean;
};

const DRAWER_POLICY_ENTITY_TYPES = new Set<DrawerPolicyEntityType>(["opportunity", "job"]);

/** Native opportunity PATCH allowlist keys with 1:1 column writes (Card 1.5 safe subset). */
const OPPORTUNITY_ENFORCEABLE_NATIVE = new Set([
    "name",
    "source",
    "assigned_to",
    "lost_reason",
    "job_date",
    "job_time_window",
    "location_id",
]);

/** `notes` PATCH body key → `opportunities.metadata.notes` (not a top-level column). */
const OPPORTUNITY_METADATA_NATIVE: Record<string, { bodyKey: string; path: string }> = {
    notes: { bodyKey: "notes", path: "metadata.notes" },
};

/** Native job PATCH allowlist keys with 1:1 column writes (Card 1.5 safe subset). */
const JOB_ENFORCEABLE_NATIVE = new Set([
    "title",
    "description",
    "service_key",
    "job_type",
    "scheduled_at",
    "completed_at",
    "service_frequency_key",
    "is_recurring",
]);

const STATUS_FIELD_KEYS = new Set(["status_key", "status", "job_status_id", "vendor_status_id", "schedule_status_id"]);

const OPPORTUNITY_QUOTE_PRICING_KEYS = new Set([
    "quote_total",
    "quote_subtotal",
    "discount_amount",
    "discount_code",
    "discount_code_id",
    "discount_program_id",
    "discount_validated_at",
    "price_breakdown",
    "quote_is_overridden",
    "quote_override_total",
    "quote_override_reason",
    "recurring_price_cents",
    "estimated_price_cents",
    "monetary_value_cents",
    "display_total_cents",
    "fee_schedule",
    "tuition",
    "tuition_pricing",
]);

const OPPORTUNITY_PIPELINE_KEYS = new Set([
    "quote_inputs",
    "apply_quote_discount",
    "clear_quote_discount",
    "clear_quote_override",
    "quote_discount_selection",
]);

const JOB_PRICING_DISCOUNT_KEYS = new Set([
    "gross_price_cents",
    "discount_amount",
    "discount_code",
    "discount_code_id",
    "discount_program_id",
    "discounted",
    "display_total_cents",
    "_discount_amount_cents",
]);

const TOUR_ENROLLMENT_WORKFLOW_KEYS = new Set([
    // opportunity-level legacy field key — not the OCM column
    "desired_start_date",
    "tour_date",
    "tour_time",
    "follow_up_notes",
    "next_follow_up_at",
    "program_type",
    "schedule_type",
    "inquiry_source",
]);

const RELATIONSHIP_FK_KEYS = new Set([
    "customer_id",
    "location_id",
    "primary_contact_id",
    "primary_person_id",
    "opportunity_id",
    "work_unit_id",
    "appointment_id",
    "vertical_id",
    "assigned_vendor_id",
]);

const ACTION_FIELD_KEYS = new Set(["action_key"]);

const JOB_METADATA_DEFERRED = new Set(["internal_notes"]);

/** Drawer/presentation aliases that do not match PATCH body keys. */
const ALIAS_DEFERRED_KEYS = new Set(["customer_notes"]);

function isComputedFieldKey(fieldKey: string): boolean {
    return fieldKey.startsWith("_");
}

function normalizeEntityType(entityType: string): DrawerPolicyEntityType | null {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunity" || t === "opportunities") return "opportunity";
    if (t === "job" || t === "jobs") return "job";
    return null;
}

function resolveEnforceableNative(
    entityType: DrawerPolicyEntityType,
    fieldKey: string
): DrawerFieldPolicyResolved | null {
    if (entityType === "opportunity") {
        if (OPPORTUNITY_ENFORCEABLE_NATIVE.has(fieldKey)) {
            return {
                entityType,
                fieldKey,
                storage: "column",
                bodyKey: fieldKey,
                policyMode: "enforceable",
                requirementSupported: true,
                interactionSupported: true,
                reason: "Native opportunity column; PATCH allowlist 1:1 body key.",
            };
        }
        const meta = OPPORTUNITY_METADATA_NATIVE[fieldKey];
        if (meta) {
            return {
                entityType,
                fieldKey,
                storage: "metadata",
                bodyKey: meta.bodyKey,
                policyMode: "enforceable",
                requirementSupported: true,
                interactionSupported: true,
                reason: `PATCH maps to ${meta.path}.`,
            };
        }
    }
    if (entityType === "job" && JOB_ENFORCEABLE_NATIVE.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "column",
            bodyKey: fieldKey,
            policyMode: "enforceable",
            requirementSupported: true,
            interactionSupported: true,
            reason: "Native job column; PATCH allowlist 1:1 body key.",
        };
    }
    return null;
}

/**
 * Classify one field_definition for drawer policy readiness (no I/O).
 */
export function resolveDrawerFieldPolicy(
    entityTypeInput: string,
    def: Pick<DrawerFieldDefinitionForPolicy, "field_key" | "is_system">
): DrawerFieldPolicyResolved | null {
    const entityType = normalizeEntityType(entityTypeInput);
    if (!entityType) return null;

    const fieldKey = def.field_key.trim();
    if (!fieldKey) return null;

    if (isComputedFieldKey(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "computed",
            bodyKey: null,
            policyMode: "never_policy_controlled",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Computed or display-only underscore-prefixed field; not in field_definitions writes.",
        };
    }

    if (ALIAS_DEFERRED_KEYS.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "metadata",
            bodyKey: "notes",
            policyMode: "deferred",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Drawer alias (customer_notes); PATCH uses notes → metadata.notes — map explicitly before enforce.",
        };
    }

    if (ACTION_FIELD_KEYS.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "action",
            bodyKey: "action_key",
            policyMode: "never_policy_controlled",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Action-controlled mutation path; not a scalar field policy target.",
        };
    }

    if (STATUS_FIELD_KEYS.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "column",
            bodyKey: fieldKey === "status" ? "status_key" : fieldKey,
            policyMode: "deferred",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Status field; overlaps status transition rules and action paths.",
        };
    }

    if (entityType === "opportunity" && OPPORTUNITY_PIPELINE_KEYS.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "pipeline",
            bodyKey: fieldKey,
            policyMode: "deferred",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Quote pipeline-only PATCH keys; separate merge path.",
        };
    }

    const quotePricing =
        (entityType === "opportunity" && OPPORTUNITY_QUOTE_PRICING_KEYS.has(fieldKey)) ||
        (entityType === "job" && JOB_PRICING_DISCOUNT_KEYS.has(fieldKey));
    if (quotePricing) {
        return {
            entityType,
            fieldKey,
            storage: entityType === "opportunity" ? "column" : "column",
            bodyKey: fieldKey,
            policyMode: "deferred",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Quote/pricing/discount field; dedicated pricing merge or resolver.",
        };
    }

    if (TOUR_ENROLLMENT_WORKFLOW_KEYS.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            // desired_start_date is the opportunity-level legacy field key — not the OCM column
            storage: fieldKey === "desired_start_date" || fieldKey === "tour_date" || fieldKey === "tour_time" ? "metadata" : "unknown",
            bodyKey: fieldKey,
            policyMode: "deferred",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Tour/enrollment/workflow field; metadata, field_values, or action paths — not a single PATCH key.",
        };
    }

    if (entityType === "job" && JOB_METADATA_DEFERRED.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "metadata",
            bodyKey: fieldKey,
            policyMode: "deferred",
            requirementSupported: false,
            interactionSupported: false,
            reason: "Job internal_notes maps to metadata; deferred until mapping tested with policies.",
        };
    }

    const enforceableNative = resolveEnforceableNative(entityType, fieldKey);
    if (enforceableNative) return enforceableNative;

    if (RELATIONSHIP_FK_KEYS.has(fieldKey)) {
        return {
            entityType,
            fieldKey,
            storage: "relationship",
            bodyKey: fieldKey,
            policyMode: "never_policy_controlled",
            requirementSupported: false,
            interactionSupported: false,
            reason: "FK/relationship field; PATCH blocked or requires dedicated identity/action routes.",
        };
    }

    if (!def.is_system) {
        return {
            entityType,
            fieldKey,
            storage: "field_values",
            bodyKey: fieldKey,
            policyMode: "enforceable",
            requirementSupported: true,
            interactionSupported: true,
            reason: "Custom field; persisted via field_values upsert on PATCH.",
        };
    }

    return {
        entityType,
        fieldKey,
        storage: "unknown",
        bodyKey: null,
        policyMode: "deferred",
        requirementSupported: false,
        interactionSupported: false,
        reason: "System field without a verified 1:1 PATCH write path in Card 1.5 scope.",
    };
}

export function buildDrawerFieldPolicyResolvedMap(
    entityTypeInput: string,
    defs: DrawerFieldDefinitionForPolicy[],
    options?: BuildDrawerFieldPolicyResolvedMapOptions
): Record<string, DrawerFieldPolicyResolved> {
    const entityType = normalizeEntityType(entityTypeInput);
    if (!entityType) return {};
    const usePlacementAware =
        entityType === "opportunity" && options !== undefined && "layoutConfig" in options;

    const out: Record<string, DrawerFieldPolicyResolved> = {};
    for (const def of defs) {
        const resolved = resolveDrawerFieldPolicy(entityType, def);
        if (!resolved) continue;

        const entry: DrawerFieldPolicyResolved = { ...resolved };

        if (usePlacementAware) {
            const effective = resolveEffectiveFieldBehavior({
                entityType,
                fieldDef: { ...def, entity_type: entityType },
                layoutConfig: options?.layoutConfig ?? null,
            });
            if (effective) {
                entry.requirement = effective.requirement;
                entry.interaction = effective.interaction;
                entry.requirement_source = effective.requirement_source;
                entry.interaction_source = effective.interaction_source;
            }
        }

        out[def.field_key] = entry;
    }
    return out;
}

export function drawerTypeSupportsFieldPolicyResolution(drawerType: string): boolean {
    const et = DRAWER_TYPE_TO_FIELD_ENTITY_TYPE[drawerType];
    return et != null && DRAWER_POLICY_ENTITY_TYPES.has(normalizeEntityType(et) as DrawerPolicyEntityType);
}

/** Mirror attach drawer types (opportunities → opportunity). */
export const DRAWER_TYPE_TO_POLICY_ENTITY: Record<string, DrawerPolicyEntityType> = {
    opportunities: "opportunity",
    jobs: "job",
};

/** Used by attach; keep in sync with entityFieldRegistryAttach.DRAWER_TYPE_TO_FIELD_ENTITY_TYPE. */
const DRAWER_TYPE_TO_FIELD_ENTITY_TYPE: Record<string, string> = {
    jobs: "job",
    opportunities: "opportunity",
};

/**
 * Read-side enrichment for opportunity/job entity GET payloads.
 * Does not change drawer edit behavior.
 */
export type AttachDrawerFieldPolicyResolutionOptions = {
    layoutConfig?: RecordLayoutConfigJson | null;
};

export function attachDrawerFieldPolicyResolution(
    out: Record<string, unknown>,
    drawerType: string,
    options?: AttachDrawerFieldPolicyResolutionOptions
): void {
    if (!drawerTypeSupportsFieldPolicyResolution(drawerType)) return;

    const entityType = DRAWER_TYPE_TO_POLICY_ENTITY[drawerType];
    const defs = (out._field_definitions ?? []) as DrawerFieldDefinitionForPolicy[];
    if (!defs.length) {
        out._field_policy_resolved = {};
        return;
    }

    const mapOptions: BuildDrawerFieldPolicyResolvedMapOptions | undefined =
        drawerType === "opportunities"
            ? { layoutConfig: options?.layoutConfig ?? null }
            : undefined;

    out._field_policy_resolved = buildDrawerFieldPolicyResolvedMap(entityType, defs, mapOptions);
}

/** Counts for diagnostics / tests. */
export function summarizeDrawerFieldPolicyMap(map: Record<string, DrawerFieldPolicyResolved>): {
    enforceable: number;
    display_only: number;
    deferred: number;
    never_policy_controlled: number;
} {
    let enforceable = 0;
    let display_only = 0;
    let deferred = 0;
    let never_policy_controlled = 0;
    for (const v of Object.values(map)) {
        if (v.policyMode === "enforceable") enforceable++;
        else if (v.policyMode === "display_only") display_only++;
        else if (v.policyMode === "deferred") deferred++;
        else if (v.policyMode === "never_policy_controlled") never_policy_controlled++;
    }
    return { enforceable, display_only, deferred, never_policy_controlled };
}
