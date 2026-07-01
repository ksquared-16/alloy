/**
 * Card 3 — Enforce field policies on opportunity/job admin PATCH (mapped fields only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildDrawerFieldPolicyResolvedMap,
    type DrawerFieldDefinitionForPolicy,
    type DrawerFieldPolicyResolved,
    type DrawerPolicyEntityType,
} from "@/lib/fields/drawerFieldPolicyAdapter";
import { resolveFieldEditability } from "@/lib/fields/fieldInteractionPolicy";
import {
    evaluateFieldRequirementViolations,
    legacyIsRequiredFromPolicy,
    resolveFieldRequirementPolicy,
    type FieldDefinitionRequirementSource,
    type FieldRequirementPolicyV1,
} from "@/lib/fields/fieldRequirementPolicy";
import { resolveFieldInteractionPolicy } from "@/lib/fields/fieldInteractionPolicy";
import { isAdvancedRequirementPolicyForSettings } from "@/lib/fields/fieldPolicySettingsUi";
import { displayFromFieldValueRow } from "@/lib/admin/typedFieldValues";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export const FIELD_POLICY_VALIDATION_ERROR = "Field validation failed";

export type FieldPolicyPatchViolation = {
    field_key: string;
    code: "required" | "required_on_save" | "read_only";
    message: string;
};

export type EnforceDrawerFieldPoliciesResult =
    | { ok: true }
    | { ok: false; violations: FieldPolicyPatchViolation[] };

type FieldDefRow = DrawerFieldDefinitionForPolicy & {
    id: string;
    field_type?: string;
};

function normalizeEntityType(entityType: string): DrawerPolicyEntityType | null {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunity" || t === "opportunities") return "opportunity";
    if (t === "job" || t === "jobs") return "job";
    return null;
}

function isValueEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (typeof value === "boolean") return false;
    if (typeof value === "number") return Number.isNaN(value);
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

function valuesEqual(a: unknown, b: unknown): boolean {
    if (isValueEmpty(a) && isValueEmpty(b)) return true;
    if (typeof a === "number" && typeof b === "number") return a === b;
    if (typeof a === "boolean" && typeof b === "boolean") return a === b;
    return String(a) === String(b);
}

/** Read native + metadata values for policy merge from an entity row. */
export function extractPersistedValuesForPolicy(
    entityType: DrawerPolicyEntityType,
    row: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...row };
    if (entityType === "opportunity") {
        const meta = (row.metadata ?? null) as Record<string, unknown> | null;
        if (meta && typeof meta.notes === "string") {
            out.notes = meta.notes;
        }
    }
    if (entityType === "job") {
        const meta = (row.metadata ?? null) as Record<string, unknown> | null;
        if (meta && meta.internal_notes !== undefined) {
            out.internal_notes = meta.internal_notes;
        }
    }
    return out;
}

/** Apply PATCH body overlays onto persisted values (enforceable fields only). */
export function mergeValuesForPolicyCheck(
    entityType: DrawerPolicyEntityType,
    persisted: Record<string, unknown>,
    body: Record<string, unknown>,
    resolvedMap: Record<string, DrawerFieldPolicyResolved>,
    customValuesByFieldKey: Record<string, unknown>
): Record<string, unknown> {
    const merged: Record<string, unknown> = {
        ...persisted,
        ...customValuesByFieldKey,
    };

    for (const [fieldKey, resolved] of Object.entries(resolvedMap)) {
        if (resolved.policyMode !== "enforceable") continue;

        if (resolved.storage === "field_values") {
            if (body[fieldKey] !== undefined) {
                merged[fieldKey] = body[fieldKey];
            } else if (customValuesByFieldKey[fieldKey] !== undefined) {
                merged[fieldKey] = customValuesByFieldKey[fieldKey];
            }
            continue;
        }

        const bodyKey = resolved.bodyKey ?? fieldKey;
        if (body[bodyKey] !== undefined) {
            merged[fieldKey] = body[bodyKey];
            if (fieldKey === "notes" && entityType === "opportunity") {
                merged.notes = body[bodyKey];
            }
        }
    }

    return merged;
}

function bodyKeysAttemptingPatch(
    body: Record<string, unknown>,
    resolvedMap: Record<string, DrawerFieldPolicyResolved>
): Set<string> {
    const fieldKeys = new Set<string>();
    const bodyKeys = new Set(Object.keys(body).filter((k) => body[k] !== undefined));

    for (const [fieldKey, resolved] of Object.entries(resolvedMap)) {
        if (resolved.policyMode !== "enforceable") continue;
        const bk = resolved.storage === "field_values" ? fieldKey : (resolved.bodyKey ?? fieldKey);
        if (bodyKeys.has(bk) || (resolved.storage === "field_values" && bodyKeys.has(fieldKey))) {
            fieldKeys.add(fieldKey);
        }
    }
    return fieldKeys;
}

function requirementPolicyEnforceableOnSave(policy: FieldRequirementPolicyV1): boolean {
    if (isAdvancedRequirementPolicyForSettings(policy)) return false;
    return policy.mode === "required" || policy.mode === "required_on_save";
}

function buildResolvedMapForEnforcement(
    entityType: DrawerPolicyEntityType,
    defs: FieldDefRow[],
    layoutConfig?: RecordLayoutConfigJson | null
): Record<string, DrawerFieldPolicyResolved> {
    if (entityType === "opportunity" && layoutConfig !== undefined) {
        return buildDrawerFieldPolicyResolvedMap(entityType, defs, {
            layoutConfig: layoutConfig ?? null,
        });
    }
    return buildDrawerFieldPolicyResolvedMap(entityType, defs);
}

function effectiveRequirementPolicy(
    def: FieldDefRow,
    resolved: DrawerFieldPolicyResolved
): FieldRequirementPolicyV1 {
    return resolved.requirement ?? resolveFieldRequirementPolicy(def);
}

function requirementSourceForEvaluation(
    def: FieldDefRow,
    resolved: DrawerFieldPolicyResolved
): FieldDefinitionRequirementSource {
    const policy = effectiveRequirementPolicy(def, resolved);
    return {
        field_key: def.field_key,
        requirement_policy: policy,
        is_required: legacyIsRequiredFromPolicy(policy),
    };
}

/**
 * Pure evaluation — used by tests and async loader.
 */
export function evaluateDrawerFieldPoliciesOnPatch(params: {
    entityType: DrawerPolicyEntityType;
    defs: FieldDefRow[];
    body: Record<string, unknown>;
    persisted: Record<string, unknown>;
    customValuesByFieldKey?: Record<string, unknown>;
    /** Card 3 — opportunity only: placement-aware effective policies when provided. */
    layoutConfig?: RecordLayoutConfigJson | null;
}): EnforceDrawerFieldPoliciesResult {
    const { entityType, defs, body, persisted } = params;
    const customValuesByFieldKey = params.customValuesByFieldKey ?? {};
    const resolvedMap = buildResolvedMapForEnforcement(entityType, defs, params.layoutConfig);
    const merged = mergeValuesForPolicyCheck(entityType, persisted, body, resolvedMap, customValuesByFieldKey);
    const touched = bodyKeysAttemptingPatch(body, resolvedMap);
    const violations: FieldPolicyPatchViolation[] = [];

    for (const def of defs) {
        const resolved = resolvedMap[def.field_key];
        if (!resolved || resolved.policyMode !== "enforceable") continue;

        const reqPolicy = effectiveRequirementPolicy(def, resolved);
        const intSource = {
            field_key: def.field_key,
            entity_type: entityType,
            is_system: def.is_system,
            interaction_policy:
                resolved.interaction ??
                resolveFieldInteractionPolicy({
                    field_key: def.field_key,
                    entity_type: entityType,
                    is_system: def.is_system,
                    interaction_policy: def.interaction_policy,
                }),
        };
        const editability = resolveFieldEditability(intSource, { permission_keys: ["__admin_patch__"] });

        if (editability.editability_mode === "editable_through_related_record") {
            continue;
        }

        if (!editability.editable && editability.editability_mode === "read_only" && touched.has(def.field_key)) {
            const before =
                resolved.storage === "field_values"
                    ? customValuesByFieldKey[def.field_key] ?? persisted[def.field_key]
                    : persisted[def.field_key] ?? persisted[resolved.bodyKey ?? def.field_key];
            const after = merged[def.field_key];
            if (!valuesEqual(before, after)) {
                violations.push({
                    field_key: def.field_key,
                    code: "read_only",
                    message:
                        editability.lock_reason?.trim() ||
                        `Field "${def.field_key}" is read-only and cannot be updated.`,
                });
            }
            continue;
        }

        if (!requirementPolicyEnforceableOnSave(reqPolicy)) continue;

        const reqViolations = evaluateFieldRequirementViolations(
            requirementSourceForEvaluation(def, resolved),
            { phase: "save", values: merged },
            merged[def.field_key]
        );
        for (const v of reqViolations) {
            violations.push({
                field_key: v.field_key,
                code: v.code === "required_on_save" ? "required_on_save" : "required",
                message: v.message,
            });
        }
    }

    if (violations.length > 0) {
        return { ok: false, violations };
    }
    return { ok: true };
}

async function loadCustomFieldValues(
    supabase: SupabaseClient,
    orgId: string,
    entityType: DrawerPolicyEntityType,
    entityId: string,
    defs: FieldDefRow[]
): Promise<Record<string, unknown>> {
    const customDefs = defs.filter((d) => !d.is_system);
    if (customDefs.length === 0) return {};

    const dbType = entityType;
    const ids = customDefs.map((d) => d.id);
    const { data: fvRows } = await supabase
        .from("field_values")
        .select("field_definition_id, value_text, value_number, value_boolean, value_date, value_json")
        .eq("entity_type", dbType)
        .eq("entity_id", entityId)
        .in("field_definition_id", ids);

    const defById = new Map(customDefs.map((d) => [d.id, d]));
    const out: Record<string, unknown> = {};

    for (const row of (fvRows ?? []) as {
        field_definition_id: string;
        value_text?: string | null;
        value_number?: number | null;
        value_boolean?: boolean | null;
        value_date?: string | null;
        value_json?: unknown;
    }[]) {
        const def = defById.get(row.field_definition_id);
        if (!def?.field_type) continue;
        out[def.field_key] = displayFromFieldValueRow(def.field_type, row);
    }
    return out;
}

export async function enforceDrawerFieldPoliciesOnPatch(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    entityId: string;
    body: Record<string, unknown>;
    persistedRow: Record<string, unknown>;
    layoutConfig?: RecordLayoutConfigJson | null;
}): Promise<EnforceDrawerFieldPoliciesResult> {
    const entityType = normalizeEntityType(params.entityType);
    if (!entityType) return { ok: true };

    const { data: defRows, error } = await params.supabase
        .from("field_definitions")
        .select("id, field_key, field_type, is_system, is_required, requirement_policy, interaction_policy")
        .eq("org_id", params.orgId)
        .eq("entity_type", entityType)
        .eq("is_active", true);

    if (error) {
        console.error("[enforceDrawerFieldPoliciesOnPatch] field_definitions load", error);
        return { ok: true };
    }

    const defs = (defRows ?? []) as FieldDefRow[];
    if (defs.length === 0) return { ok: true };

    const customValues = await loadCustomFieldValues(
        params.supabase,
        params.orgId,
        entityType,
        params.entityId,
        defs
    );
    const persisted = extractPersistedValuesForPolicy(entityType, params.persistedRow);

    const layoutConfig =
        entityType === "opportunity" && params.layoutConfig !== undefined
            ? params.layoutConfig
            : undefined;

    return evaluateDrawerFieldPoliciesOnPatch({
        entityType,
        defs,
        body: params.body,
        persisted,
        customValuesByFieldKey: customValues,
        layoutConfig,
    });
}

export function fieldPolicyValidationResponse(violations: FieldPolicyPatchViolation[]) {
    return {
        error: FIELD_POLICY_VALIDATION_ERROR,
        violations,
    };
}
