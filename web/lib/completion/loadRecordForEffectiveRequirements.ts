import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import { resolveOpportunityDepartmentId } from "@/lib/opportunities/resolveOpportunityDepartmentId";
import { listEnrollmentInstancesForLead } from "@/lib/process/processInstances";
import {
    resolveRequestedDaysPerWeek,
    resolvePreferredWeekdays,
} from "@/lib/enrollment/effectiveDateAuthority";
import { activeAssignmentQuoteSnapshot } from "@/lib/enrollment/assignmentQuoteSnapshot";

function overlayParticipationOntoChild(
    child: Record<string, unknown>,
    meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    if (!meta || typeof meta !== "object") return child;
    const next = { ...child };
    // PI draft wins for assignment proposal facts when present (pre-materialization authority).
    const pick = (key: string) => {
        if (meta[key] !== undefined && meta[key] !== null && meta[key] !== "") {
            next[key] = meta[key];
        }
    };
    pick("start_date");
    pick("schedule_type");
    pick("program_category_id");
    pick("location_id");
    pick("program_room_cohort_key");
    pick("tuition_plan_id");
    pick("enrollment_date");
    if (meta.requested_days_per_week !== undefined) {
        next.requested_days_per_week = meta.requested_days_per_week;
    } else {
        const days = resolveRequestedDaysPerWeek(meta);
        if (days != null) next.requested_days_per_week = days;
    }
    const weekdays = resolvePreferredWeekdays(meta);
    if (weekdays.length > 0) next.weekdays = weekdays;
    else if (Array.isArray(meta.weekdays)) next.weekdays = meta.weekdays;

    if (meta.quote_accepted === true || meta.quote_accepted === "true") {
        next.quote_accepted = true;
    } else {
        const snap = activeAssignmentQuoteSnapshot(meta);
        if (snap?.status === "accepted") next.quote_accepted = true;
    }
    if (meta.assignment_quote_snapshots !== undefined) {
        next.assignment_quote_snapshots = meta.assignment_quote_snapshots;
    }
    // Keep raw participation metadata for card assemblers.
    next.participation_metadata = meta;
    return next;
}

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

    // Also load enrollment process instances — children may exist only on PI (no OCM).
    const instances = await listEnrollmentInstancesForLead(supabase, { orgId, opportunityId });
    const metaByMember = new Map<string, Record<string, unknown>>();
    for (const pi of instances) {
        const sid = String(pi.subject_id ?? "").trim();
        if (!sid) continue;
        metaByMember.set(sid, (pi.metadata && typeof pi.metadata === "object" ? pi.metadata : {}) as Record<string, unknown>);
    }

    if (!ocms.length && metaByMember.size === 0) return [];

    const memberIds = [
        ...new Set([
            ...ocms.map((r) => r.customer_member_id).filter((id): id is string => typeof id === "string" && id.trim() !== ""),
            ...metaByMember.keys(),
        ]),
    ];

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

    const fromOcm = ocms.map((ocm) => {
        const member = ocm.customer_member_id ? membersById.get(ocm.customer_member_id) : undefined;
        const base = {
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
        const meta = ocm.customer_member_id ? metaByMember.get(ocm.customer_member_id) : undefined;
        return overlayParticipationOntoChild(base, meta);
    });

    // PI-only children (no OCM row) — still evaluate requirements at child grain.
    const seen = new Set(fromOcm.map((c) => String(c.customer_member_id ?? "")));
    for (const [memberId, meta] of metaByMember) {
        if (seen.has(memberId)) continue;
        const member = membersById.get(memberId);
        fromOcm.push(
            overlayParticipationOntoChild(
                {
                    id: memberId,
                    customer_member_id: memberId,
                    person_id: member?.person_id ?? null,
                    first_name: member?.first_name ?? null,
                    last_name: member?.last_name ?? null,
                    location_id: null,
                    program_category_id: null,
                    program_room_cohort_key: null,
                    schedule_type: null,
                    start_date: null,
                    outcome_status_key: null,
                },
                meta,
            ),
        );
    }

    return fromOcm;
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
