import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateOpportunityActionPreflight } from "@/lib/completion/evaluateEffectiveRequirements";
import {
    isLifecyclePreflightActionKey,
    lifecycleActionTargetStatus,
} from "@/lib/completion/lifecycleActionRequirementCatalog";
import { buildActionPreflightUiPayload, type ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { ExecuteAdminActionResult } from "@/lib/admin/actions/executeAdminAction";
import type { EffectiveRequirementsResult } from "@/lib/completion/effectiveRequirementsTypes";

export type AdminActionPreflightInput = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    actionKey: string;
    payload?: Record<string, unknown>;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export async function runOpportunityActionPreflight(
    input: AdminActionPreflightInput
): Promise<EffectiveRequirementsResult> {
    return evaluateOpportunityActionPreflight(input.supabase, {
        orgId: input.orgId,
        opportunityId: input.opportunityId,
        actionKey: input.actionKey,
        payload: input.payload,
        departmentId: input.departmentId,
        workUnitId: input.workUnitId,
        statusTo: lifecycleActionTargetStatus(input.actionKey),
    });
}

export function adminActionPreflightFailure(
    correlationId: string,
    actionKey: string,
    result: EffectiveRequirementsResult,
    context?: {
        orgId?: string;
        opportunityId?: string;
        departmentId?: string | null;
    }
): Extract<ExecuteAdminActionResult, { ok: false }> {
    const ui = buildActionPreflightUiPayload(actionKey, result, context);
    return {
        ok: false,
        correlation_id: correlationId,
        error: ui.summary,
        status: 400,
        completion_requirements: ui.completion_requirements,
        effective_requirements: ui.effective_requirements,
        action_preflight: ui,
        ...(ui.readiness ? { readiness: ui.readiness } : {}),
    };
}

export async function preflightOpportunityActionOrNull(
    correlationId: string,
    input: AdminActionPreflightInput
): Promise<Extract<ExecuteAdminActionResult, { ok: false }> | null> {
    if (!isLifecyclePreflightActionKey(input.actionKey)) return null;
    const result = await runOpportunityActionPreflight(input);
    if (result.ok) return null;
    return adminActionPreflightFailure(correlationId, input.actionKey, result, {
        orgId: input.orgId,
        opportunityId: input.opportunityId,
        departmentId: input.departmentId,
    });
}
