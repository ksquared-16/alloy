import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import { evaluateCompletionRequirements } from "@/lib/completion/evaluateCompletionRequirements";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import { COMPLETION_REQUIREMENT_VALIDATION_ERROR } from "@/lib/completion/requirementValidationTypes";
import { mergeRequirementValidationResults } from "@/lib/completion/requirementValidationResult";
import { validateStatusTransitionStructured } from "@/lib/completion/enforcePersonCompletionOnPatch";

export type EnforceOpportunityCompletionOnStatusTransitionInput = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    fromStatusKey?: string | null;
    toStatusKey: string;
    existingRow: Record<string, unknown>;
    body: Record<string, unknown>;
    departmentId?: string | null;
    workUnitId?: string | null;
    actionKey?: string | null;
};

export type EnforceOpportunityCompletionResult =
    | { ok: true; validation: RequirementValidationResult }
    | { ok: false; validation: RequirementValidationResult; message: string };

async function loadInquiryChildrenForOpportunity(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
) {
    const { data: ocmRows } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, location_id, program_category_id, program_room_cohort_key, schedule_type, start_date, outcome_status_key"
        )
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    const ocms = (ocmRows ?? []) as Array<{
        id?: string;
        customer_member_id?: string | null;
        location_id?: string | null;
        program_category_id?: string | null;
        program_room_cohort_key?: string | null;
        schedule_type?: string | null;
        start_date?: string | null;
        outcome_status_key?: string | null;
    }>;

    if (!ocms.length) return [];

    const memberIds = ocms
        .map((r) => r.customer_member_id)
        .filter((id): id is string => typeof id === "string" && id.trim() !== "");

    let membersById = new Map<string, { person_id?: string | null; first_name?: string | null; last_name?: string | null }>();
    if (memberIds.length) {
        const { data: members } = await supabase
            .from("customer_members")
            .select("id, person_id, first_name, last_name")
            .eq("org_id", orgId)
            .in("id", memberIds);

        for (const m of members ?? []) {
            const row = m as {
                id?: string;
                person_id?: string | null;
                first_name?: string | null;
                last_name?: string | null;
            };
            if (row.id) membersById.set(row.id, row);
        }
    }

    return ocms.map((ocm) => {
        const member = ocm.customer_member_id ? membersById.get(ocm.customer_member_id) : undefined;
        return {
            id: ocm.id,
            person_id: member?.person_id ?? null,
            first_name: member?.first_name ?? null,
            last_name: member?.last_name ?? null,
            location_id: ocm.location_id ?? null,
            program_category_id: ocm.program_category_id ?? null,
            program_room_cohort_key: ocm.program_room_cohort_key ?? null,
            schedule_type: ocm.schedule_type ?? null,
            start_date: ocm.start_date ?? null,
            outcome_status_key: ocm.outcome_status_key ?? null,
        };
    });
}

/** Status transition guardrails for opportunities — structured + legacy rules. */
export async function enforceOpportunityCompletionOnStatusTransition(
    input: EnforceOpportunityCompletionOnStatusTransitionInput
): Promise<EnforceOpportunityCompletionResult> {
    const merged: Record<string, unknown> = { ...input.existingRow, ...input.body };
    const inquiry_children = await loadInquiryChildrenForOpportunity(
        input.supabase,
        input.orgId,
        input.opportunityId
    );

    const ctx: CompletionEvaluationContext = {
        phase: "status_change",
        org_id: input.orgId,
        entity_type: "opportunity",
        entity_id: input.opportunityId,
        surface: "opportunity_drawer",
        status_from: input.fromStatusKey,
        status_to: input.toStatusKey,
        action_key: input.actionKey,
        values: merged,
        related: { inquiry_children },
    };

    const codeRules = evaluateCompletionRequirements(ctx);
    const legacyRules = await validateStatusTransitionStructured({
        supabase: input.supabase,
        orgId: input.orgId,
        entityType: "opportunities",
        entityId: input.opportunityId,
        departmentId: input.departmentId,
        workUnitId: input.workUnitId,
        actionKey: input.actionKey,
        fromStatusKey: input.fromStatusKey,
        toStatusKey: input.toStatusKey,
        currentMetadata: (input.existingRow.metadata as Record<string, unknown> | null) ?? null,
        payload: input.body,
    });

    const validation = mergeRequirementValidationResults(codeRules, legacyRules);
    if (validation.ok) return { ok: true, validation };

    return {
        ok: false,
        validation,
        message: formatRequirementValidationSummary(validation) || COMPLETION_REQUIREMENT_VALIDATION_ERROR,
    };
}

export { COMPLETION_REQUIREMENT_VALIDATION_ERROR };
