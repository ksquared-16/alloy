import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import {
    APPROVE_ENROLLMENT_ACTION_KEY,
    ENROLLED_STATUS_KEY,
    OPPORTUNITY_ENROLLMENT_DATE_METADATA_KEY,
} from "@/lib/admin/actions/enrollmentApprovalConstants";
import type { ExecuteAdminActionCtx } from "@/lib/admin/actions/executeAdminAction";
import {
    effectiveRequirementsToValidationResult,
    evaluateOpportunityActionPreflight,
} from "@/lib/completion/evaluateEffectiveRequirements";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import {
    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY,
    personDrawerChildDateIsoFromRecord,
} from "@/lib/admin/person/personDrawerChildLifecycleFields";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/** ISO date (YYYY-MM-DD) for enrollment_date stamping. */
export function todayEnrollmentDateIso(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function mergeEnrollmentDateMetadata(
    existingMetadata: Record<string, unknown> | null | undefined,
    today: string
): Record<string, unknown> {
    const meta = { ...(existingMetadata && typeof existingMetadata === "object" ? existingMetadata : {}) };
    if (!trimOrNull(meta[OPPORTUNITY_ENROLLMENT_DATE_METADATA_KEY])) {
        meta[OPPORTUNITY_ENROLLMENT_DATE_METADATA_KEY] = today;
    }
    return meta;
}

export type AssertApproveEnrollmentAllowedInput = {
    supabase: SupabaseClient;
    ctx: ExecuteAdminActionCtx;
    opportunityId: string;
    existing: Record<string, unknown>;
    merged: Record<string, unknown>;
    context?: { department_id?: string | null; work_unit_id?: string | null };
};

export type EnforceOpportunityCompletionResult =
    | { ok: true; validation: RequirementValidationResult }
    | { ok: false; validation: RequirementValidationResult; message: string };

export async function assertApproveEnrollmentAllowed(
    input: AssertApproveEnrollmentAllowedInput
): Promise<EnforceOpportunityCompletionResult> {
    const effective = await evaluateOpportunityActionPreflight(input.supabase, {
        orgId: input.ctx.orgId,
        opportunityId: input.opportunityId,
        actionKey: APPROVE_ENROLLMENT_ACTION_KEY,
        payload: input.merged,
        departmentId: input.context?.department_id ?? null,
        workUnitId: input.context?.work_unit_id ?? null,
        statusTo: ENROLLED_STATUS_KEY,
    });
    const validation = effectiveRequirementsToValidationResult(effective);
    if (effective.ok) return { ok: true, validation };
    return {
        ok: false,
        validation,
        message: formatRequirementValidationSummary(validation) || "Completion requirements not met",
    };
}

type ChildEnrollmentStampRow = {
    person_id?: string | null;
};

async function loadInquiryChildPersonIds(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<ChildEnrollmentStampRow[]> {
    const { data: ocmRows } = await supabase
        .from("opportunity_customer_members")
        .select("customer_member_id")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    const memberIds = (ocmRows ?? [])
        .map((r) => (r as { customer_member_id?: string | null }).customer_member_id)
        .filter((id): id is string => typeof id === "string" && id.trim() !== "");

    if (!memberIds.length) return [];

    const { data: members } = await supabase
        .from("customer_members")
        .select("person_id")
        .eq("org_id", orgId)
        .in("id", memberIds);

    return (members ?? []) as ChildEnrollmentStampRow[];
}

/** Set person-level enrollment_date custom field when blank (best-effort; field def may not exist). */
export async function stampChildEnrollmentDatesIfBlank(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    enrollmentDate: string
): Promise<void> {
    const children = await loadInquiryChildPersonIds(supabase, orgId, opportunityId);
    for (const child of children) {
        const personId = trimOrNull(child.person_id);
        if (!personId) continue;

        const { data: personRow } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("id", personId)
            .maybeSingle();
        if (!personRow) continue;

        const { data: defRow } = await supabase
            .from("field_definitions")
            .select("id")
            .eq("org_id", orgId)
            .eq("entity_type", "person")
            .eq("field_key", PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY)
            .eq("is_system", false)
            .maybeSingle();
        const defId = (defRow as { id?: string } | null)?.id;
        if (!defId) continue;

        const { data: existingValue } = await supabase
            .from("field_values")
            .select("value_text, value_date")
            .eq("field_definition_id", defId)
            .eq("entity_id", personId)
            .maybeSingle();

        const record: Record<string, unknown> = {};
        if (existingValue) {
            const row = existingValue as { value_text?: string | null; value_date?: string | null };
            record[PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY] = row.value_date ?? row.value_text ?? "";
        }
        if (personDrawerChildDateIsoFromRecord(record, PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY)) continue;

        await upsertFieldValuesFromBody(
            supabase,
            orgId,
            "person",
            personId,
            { [PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY]: enrollmentDate },
            []
        );
    }
}

export type ApproveEnrollmentCompletionFailure = {
    ok: false;
    error: string;
    status: number;
    completion_requirements: RequirementValidationResult;
};

export function approveEnrollmentCompletionFailure(
    result: Extract<EnforceOpportunityCompletionResult, { ok: false }>
): ApproveEnrollmentCompletionFailure {
    return {
        ok: false,
        error: result.message,
        status: 400,
        completion_requirements: result.validation,
    };
}
