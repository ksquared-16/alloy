import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import { resolveOpportunityDepartmentId } from "@/lib/opportunities/resolveOpportunityDepartmentId";

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

    const membersById = new Map<
        string,
        { person_id?: string | null; first_name?: string | null; last_name?: string | null }
    >();
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
            customer_member_id: ocm.customer_member_id ?? null,
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

export async function loadOpportunityRecordForEffectiveRequirements(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("opportunities")
        .select(
            "id, org_id, status_key, metadata, primary_person_id, customer_id, location_id, work_unit_id"
        )
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    const department_id = await resolveOpportunityDepartmentId(supabase, orgId, {
        metadata: row.metadata,
        work_unit_id: row.work_unit_id,
    });
    const inquiry_children = await loadInquiryChildrenForOpportunity(supabase, orgId, opportunityId);

    const primaryPersonId =
        typeof row.primary_person_id === "string" && row.primary_person_id.trim()
            ? row.primary_person_id.trim()
            : null;
    let _primary_person: Record<string, unknown> | null = null;
    if (primaryPersonId) {
        const { data: personRow } = await supabase
            .from("persons")
            .select("id, first_name, last_name, email, phone")
            .eq("id", primaryPersonId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (personRow) {
            const p = personRow as {
                id?: string;
                first_name?: string | null;
                last_name?: string | null;
                email?: string | null;
                phone?: string | null;
            };
            _primary_person = {
                person_id: p.id ?? primaryPersonId,
                first_name: p.first_name ?? null,
                last_name: p.last_name ?? null,
                email: p.email ?? null,
                phone: p.phone ?? null,
            };
        }
    }

    return {
        ...row,
        ...(department_id ? { department_id } : {}),
        _inquiry_children: inquiry_children,
        ...(_primary_person ? { _primary_person } : {}),
    };
}

export async function buildOpportunityCompletionContextFromDb(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        opportunityId: string;
        phase: CompletionEvaluationContext["phase"];
        status_from?: string | null;
        status_to?: string | null;
        action_key?: string | null;
        body?: Record<string, unknown>;
        department_id?: string | null;
        work_unit_id?: string | null;
    }
): Promise<CompletionEvaluationContext | null> {
    const record = await loadOpportunityRecordForEffectiveRequirements(
        supabase,
        input.orgId,
        input.opportunityId
    );
    if (!record) return null;

    const merged = { ...record, ...(input.body ?? {}) };
    const ctx = buildCompletionContextFromRecord({
        entity_type: "opportunity",
        entity_id: input.opportunityId,
        phase: input.phase,
        record: merged,
        surface: "opportunity_drawer",
        status_from: input.status_from ?? (record.status_key as string | null),
        status_to: input.status_to,
        action_key: input.action_key,
    });
    ctx.org_id = input.orgId;
    return ctx;
}
