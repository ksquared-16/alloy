/**
 * Authoritative apply adapters for Configuration / Layout Assist (Card 10).
 * Uses org-scoped admin Supabase writes with the same validation as field-definitions APIs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ADMIN_FIELD_TYPES } from "@/lib/fields/adminFieldTypeList";
import { validateSelectLikeConfig } from "@/lib/fields/fieldDefinitionConfig";
import { mergeFieldDefinitionPoliciesFromBody } from "@/lib/fields/fieldDefinitionPolicyWrite";
import { logAdminAudit } from "@/lib/adminAuth";

import {
    CONFIGURATION_MUTATING_OPERATION_KINDS,
    type ConfigurationOperationKindV1,
    type ConfigurationOperationV1,
    type ConfigurationProposalV1,
} from "../configurationProposalV1";
import { assertPermissionsForOperationKinds } from "../configurationProposalAccess";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

export const CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS: readonly ConfigurationOperationKindV1[] = [
    "create_field",
    "update_field",
    "set_field_requirement",
    "set_field_interaction",
    "set_field_write_target",
    "expose_field_on_layout",
    "hide_field_on_layout",
    "move_field_to_section",
] as const;

const FIELD_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

export type ApplyOperationResult = {
    operation_id: string;
    kind: ConfigurationOperationKindV1;
    ok: boolean;
    verified: boolean;
    error?: string;
    verification_warning?: string;
    field_definition_id?: string;
};

export function assertProposalCanBeApplied(
    proposal: ConfigurationProposalV1,
    applyMode: string
): { ok: true } | { ok: false; message: string } {
    if (applyMode === "recommendation_only") {
        return { ok: false, message: "recommendation_only proposals cannot be applied." };
    }
    const mutating = proposal.proposed_operations.filter(
        (o) => (CONFIGURATION_MUTATING_OPERATION_KINDS as readonly string[]).includes(o.kind)
    );
    if (mutating.length === 0) {
        return { ok: false, message: "Proposal has no mutating operations to apply." };
    }
    return { ok: true };
}

export type ApplyConfigurationProposalResult =
    | {
          ok: true;
          results: ApplyOperationResult[];
          partial_failure: boolean;
      }
    | { ok: false; error: string; message: string };

async function fetchFieldByKey(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    fieldKey: string
): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("field_definitions")
        .select("*")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("field_key", fieldKey)
        .maybeSingle();
    if (error || !data) return null;
    return data as Record<string, unknown>;
}

function verifyVisibility(
    row: Record<string, unknown> | null,
    expected: { is_visible_in_drawer?: boolean }
): boolean {
    if (!row) return false;
    if (expected.is_visible_in_drawer !== undefined) {
        return Boolean(row.is_visible_in_drawer) === expected.is_visible_in_drawer;
    }
    return true;
}

async function applyCreateField(
    supabase: SupabaseClient,
    orgId: string,
    op: ConfigurationOperationV1
): Promise<ApplyOperationResult> {
    const after = op.after ?? {};
    const field_key = String(op.field_key ?? after.field_key ?? "").trim().toLowerCase();
    const entity_type = op.entity_type;
    if (!FIELD_KEY_REGEX.test(field_key)) {
        return { operation_id: op.operation_id, kind: op.kind, ok: false, verified: false, error: "Invalid field_key" };
    }
    const field_type = String(after.field_type ?? "text").toLowerCase();
    if (!ADMIN_FIELD_TYPES.includes(field_type as (typeof ADMIN_FIELD_TYPES)[number])) {
        return { operation_id: op.operation_id, kind: op.kind, ok: false, verified: false, error: "Invalid field_type" };
    }

    const existing = await fetchFieldByKey(supabase, orgId, entity_type, field_key);
    if (existing) {
        return {
            operation_id: op.operation_id,
            kind: op.kind,
            ok: false,
            verified: false,
            error: "field_key already exists",
        };
    }

    const label = String(after.label ?? field_key);
    const config =
        after.config != null && typeof after.config === "object"
            ? (after.config as Record<string, unknown>)
            : {};
    const cfgCheck = validateSelectLikeConfig(field_type, config);
    if (!cfgCheck.ok) {
        return { operation_id: op.operation_id, kind: op.kind, ok: false, verified: false, error: cfgCheck.error };
    }

    const policyMerge = mergeFieldDefinitionPoliciesFromBody({
        is_required: Boolean(after.is_required),
        requirement_policy: after.requirement_policy,
        interaction_policy: after.interaction_policy,
    });
    if (!policyMerge.ok) {
        return {
            operation_id: op.operation_id,
            kind: op.kind,
            ok: false,
            verified: false,
            error: String(policyMerge.error),
        };
    }

    const insert: Record<string, unknown> = {
        org_id: orgId,
        entity_type,
        field_key,
        field_type,
        label,
        description: after.description ?? null,
        section_key: String(after.section_key ?? "custom"),
        sort_order: typeof after.sort_order === "number" ? after.sort_order : 100,
        is_system: false,
        is_required: policyMerge.is_required ?? Boolean(after.is_required),
        is_active: after.is_active !== false,
        is_visible_in_form: after.is_visible_in_form !== false,
        is_visible_in_drawer: after.is_visible_in_drawer !== false,
        is_visible_in_table: after.is_visible_in_table !== false,
        is_filterable: Boolean(after.is_filterable),
        is_sortable: Boolean(after.is_sortable),
        config,
        is_visible_in_public_booking: Boolean(after.is_visible_in_public_booking),
        ...(policyMerge.requirement_policy !== undefined
            ? { requirement_policy: policyMerge.requirement_policy, is_required: policyMerge.is_required }
            : {}),
        ...(policyMerge.interaction_policy !== undefined
            ? { interaction_policy: policyMerge.interaction_policy }
            : {}),
    };

    const { data: created, error } = await supabase.from("field_definitions").insert(insert).select("id").single();
    if (error || !created) {
        return { operation_id: op.operation_id, kind: op.kind, ok: false, verified: false, error: error?.message };
    }

    const row = await fetchFieldByKey(supabase, orgId, entity_type, field_key);
    const verified = row != null && String(row.field_key) === field_key;
    return {
        operation_id: op.operation_id,
        kind: op.kind,
        ok: true,
        verified,
        field_definition_id: String(created.id),
        verification_warning: verified ? undefined : "create_field read-after-write mismatch",
    };
}

async function applyPatchField(
    supabase: SupabaseClient,
    orgId: string,
    op: ConfigurationOperationV1,
    patchBuilder: (row: Record<string, unknown>) => Record<string, unknown> | { error: string },
    verify: (row: Record<string, unknown> | null) => boolean
): Promise<ApplyOperationResult> {
    const field_key = String(op.field_key ?? "").trim();
    if (!field_key) {
        return { operation_id: op.operation_id, kind: op.kind, ok: false, verified: false, error: "field_key required" };
    }
    const row = await fetchFieldByKey(supabase, orgId, op.entity_type, field_key);
    if (!row) {
        return { operation_id: op.operation_id, kind: op.kind, ok: false, verified: false, error: "field not found" };
    }

    const built = patchBuilder(row);
    if ("error" in built) {
        return {
            operation_id: op.operation_id,
            kind: op.kind,
            ok: false,
            verified: false,
            error: String(built.error),
        };
    }

    const { error } = await supabase
        .from("field_definitions")
        .update(built)
        .eq("id", row.id)
        .eq("org_id", orgId);

    if (error) {
        return { operation_id: op.operation_id, kind: op.kind, ok: false, verified: false, error: error.message };
    }

    const afterRow = await fetchFieldByKey(supabase, orgId, op.entity_type, field_key);
    const verified = verify(afterRow);
    return {
        operation_id: op.operation_id,
        kind: op.kind,
        ok: true,
        verified,
        field_definition_id: String(row.id),
        verification_warning: verified ? undefined : "read-after-write verification failed",
    };
}

async function applySingleOperation(
    supabase: SupabaseClient,
    orgId: string,
    op: ConfigurationOperationV1
): Promise<ApplyOperationResult> {
    if (op.kind === "data_quality_recommendation") {
        return {
            operation_id: op.operation_id,
            kind: op.kind,
            ok: true,
            verified: true,
        };
    }

    if (!(CONFIG_LAYOUT_APPLY_SUPPORTED_KINDS as readonly string[]).includes(op.kind)) {
        return {
            operation_id: op.operation_id,
            kind: op.kind,
            ok: false,
            verified: false,
            error: `Unsupported operation kind for apply: ${op.kind}`,
        };
    }

    switch (op.kind) {
        case "create_field":
            return applyCreateField(supabase, orgId, op);
        case "update_field":
            return applyPatchField(
                supabase,
                orgId,
                op,
                () => {
                    const after = op.after ?? {};
                    const updates: Record<string, unknown> = {};
                    for (const k of ["label", "description", "sort_order", "section_key", "is_active"] as const) {
                        if (after[k] !== undefined) updates[k] = after[k];
                    }
                    return updates;
                },
                (row) => row != null
            );
        case "set_field_requirement":
            return applyPatchField(
                supabase,
                orgId,
                op,
                (row) => {
                    const policyMerge = mergeFieldDefinitionPoliciesFromBody({
                        is_required:
                            op.after?.is_required !== undefined
                                ? Boolean(op.after.is_required)
                                : Boolean(row.is_required),
                        requirement_policy: op.after?.requirement_policy ?? op.after,
                    });
                    if (!policyMerge.ok) return { error: policyMerge.error };
                    return {
                        requirement_policy: policyMerge.requirement_policy,
                        is_required: policyMerge.is_required,
                    };
                },
                (row) => row != null && (op.after?.requirement_policy != null || op.after?.is_required != null)
            );
        case "set_field_interaction":
        case "set_field_write_target":
            return applyPatchField(
                supabase,
                orgId,
                op,
                () => {
                    const policyMerge = mergeFieldDefinitionPoliciesFromBody({
                        interaction_policy: op.after?.interaction_policy ?? op.after,
                    });
                    if (!policyMerge.ok) return { error: policyMerge.error };
                    return { interaction_policy: policyMerge.interaction_policy };
                },
                (row) => row?.interaction_policy != null
            );
        case "expose_field_on_layout":
            return applyPatchField(
                supabase,
                orgId,
                op,
                () => ({ is_visible_in_drawer: true }),
                (row) => verifyVisibility(row, { is_visible_in_drawer: true })
            );
        case "hide_field_on_layout":
            return applyPatchField(
                supabase,
                orgId,
                op,
                () => ({ is_visible_in_drawer: false }),
                (row) => verifyVisibility(row, { is_visible_in_drawer: false })
            );
        case "move_field_to_section":
            return applyPatchField(
                supabase,
                orgId,
                op,
                () => ({
                    section_key: String(op.after?.section_key ?? op.section_key ?? "custom"),
                }),
                (row) =>
                    String(row?.section_key ?? "") ===
                    String(op.after?.section_key ?? op.section_key ?? "custom")
            );
        default:
            return {
                operation_id: op.operation_id,
                kind: op.kind,
                ok: false,
                verified: false,
                error: `Unsupported: ${op.kind}`,
            };
    }
}

/**
 * Apply all mutating operations on an approved proposal. Caller must enforce approved state + permissions.
 */
export async function applyConfigurationProposal(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    role: string;
    proposal: ConfigurationProposalV1;
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">;
}): Promise<ApplyConfigurationProposalResult> {
    const applicable = assertProposalCanBeApplied(params.proposal, params.proposal.apply_mode);
    if (!applicable.ok) {
        return { ok: false, error: "NOT_APPLICABLE", message: applicable.message };
    }

    const kinds = params.proposal.proposed_operations
        .filter((o) => (CONFIGURATION_MUTATING_OPERATION_KINDS as readonly string[]).includes(o.kind))
        .map((o) => o.kind);
    const perm = assertPermissionsForOperationKinds(params.access, kinds);
    if (!perm.ok) {
        return { ok: false, error: "FORBIDDEN", message: perm.message };
    }

    const results: ApplyOperationResult[] = [];
    for (const op of params.proposal.proposed_operations) {
        const result = await applySingleOperation(params.supabase, params.orgId, op);
        results.push(result);
        if (!result.ok) {
            logAdminAudit({
                entity: "config_layout_assist_proposals",
                id: params.proposal.id,
                changed_fields: [`apply_operation_failed:${op.operation_id}`, op.kind],
                actor_user_id: params.userId,
                role: params.role,
            });
        }
    }

    const partial_failure = results.some((r) => !r.ok || !r.verified);
    logAdminAudit({
        entity: "config_layout_assist_proposals",
        id: params.proposal.id,
        changed_fields: [
            partial_failure ? "apply_partial" : "apply_complete",
            ...results.map((r) => `${r.operation_id}:${r.ok ? "ok" : "fail"}`),
        ],
        actor_user_id: params.userId,
        role: params.role,
    });

    return { ok: true, results, partial_failure };
}
