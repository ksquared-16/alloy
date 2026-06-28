/**
 * Shared eligibility resolvers for the Action Runtime (Phase 2/3).
 *
 * Eligibility is read-only and server-authoritative. It answers: given the current
 * record/process/status context, is this action runnable now, what transitions are
 * available, and what inputs are required/blocking?
 *
 * These helpers delegate to existing invariant-owning modules (status definitions,
 * status_transition_rules) rather than re-deriving rules.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    fetchEffectiveStatusDefinitions,
    type StatusDefinitionRow,
} from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import type { ActionBlocker, ActionTransitionOption } from "@/lib/adminV2/actions/actionTypes";

export type OpportunityStatusContext = {
    found: boolean;
    statusKey: string | null;
    metadata: Record<string, unknown> | null;
    workUnitId: string | null;
    customerId: string | null;
    primaryPersonId: string | null;
};

/** Load the case-grain status context for an opportunity. */
export async function loadOpportunityStatusContext(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<OpportunityStatusContext> {
    const id = (opportunityId ?? "").trim();
    if (!id) {
        return { found: false, statusKey: null, metadata: null, workUnitId: null, customerId: null, primaryPersonId: null };
    }
    const { data } = await supabase
        .from("opportunities")
        .select("status_key, metadata, work_unit_id, customer_id, primary_person_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!data) {
        return { found: false, statusKey: null, metadata: null, workUnitId: null, customerId: null, primaryPersonId: null };
    }
    const row = data as {
        status_key?: string | null;
        metadata?: Record<string, unknown> | null;
        work_unit_id?: string | null;
        customer_id?: string | null;
        primary_person_id?: string | null;
    };
    return {
        found: true,
        statusKey: row.status_key?.trim() || null,
        metadata: row.metadata ?? null,
        workUnitId: row.work_unit_id?.trim() || null,
        customerId: row.customer_id?.trim() || null,
        primaryPersonId: row.primary_person_id?.trim() || null,
    };
}

/** Configured status options for an entity, excluding the current status. */
export async function resolveAvailableStatusTransitions(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    currentStatusKey: string | null
): Promise<{ options: ActionTransitionOption[]; definitions: StatusDefinitionRow[] }> {
    const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, entityType, { activeOnly: true });
    const options = defs
        .filter((d) => d.status_key && d.status_key !== currentStatusKey)
        .map((d) => ({ key: d.status_key, label: (d.status_label?.trim() || d.status_key) as string }));
    return { options, definitions: defs };
}

/**
 * Resolve whether a specific target transition is allowed, returning structured blockers.
 * Used both by the eligibility resolver (to gate the chosen target) and execute (defense in depth).
 */
export async function resolveStatusTransitionBlockers(input: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    entityId: string;
    actionKey: string;
    fromStatusKey: string | null;
    toStatusKey: string;
    departmentId: string | null;
    workUnitId: string | null;
    metadata: Record<string, unknown> | null;
    payload: Record<string, unknown>;
}): Promise<ActionBlocker[]> {
    const target = input.toStatusKey.trim();
    if (!target) return [];

    // Target must be a known status for this entity.
    const { definitions } = await resolveAvailableStatusTransitions(
        input.supabase,
        input.orgId,
        input.entityType,
        input.fromStatusKey
    );
    if (!definitions.some((d) => d.status_key === target)) {
        return [
            {
                code: "invalid_transition",
                message: `"${target}" is not a defined status for this record.`,
                field: "status_key",
            },
        ];
    }

    const result = await validateStatusTransition({
        supabase: input.supabase,
        orgId: input.orgId,
        entityType: input.entityType,
        entityId: input.entityId,
        departmentId: input.departmentId,
        workUnitId: input.workUnitId,
        actionKey: input.actionKey,
        fromStatusKey: input.fromStatusKey,
        toStatusKey: target,
        currentMetadata: input.metadata,
        payload: input.payload,
    });
    if (!result.ok) {
        return [
            {
                code: "transition_blocked",
                message: result.message,
                field: "status_key",
            },
        ];
    }
    return [];
}
