import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReadinessPrimaryState, ReadinessResult } from "@/lib/completion/readinessTypes";
import {
    resolveEffectiveQualificationRequirements,
    resolveRequirementSatisfaction,
    type StaffQualificationRow,
} from "@/lib/staffQualifications/staffQualificationModel";
import {
    listQualificationRequirements,
    listQualificationTypes,
} from "@/lib/staffQualifications/staffQualificationService";
import { isOpenEmploymentStatus } from "@/lib/employment/employmentTypes";
import { evaluateStaffReadiness } from "@/lib/staffReadiness/staffReadinessModel";

/**
 * STAFF READINESS AS AN OPERATIONAL SIGNAL — ADVISORY, AND ONLY ADVISORY.
 *
 * Slice 5 answers readiness for ONE employment. Operations asks about a
 * population: a staff list, a chooser, a roster. Asking the single-employment
 * question once per row is six queries per person, so this composes the same
 * answer for many employments with a fixed number of reads.
 *
 * ── IT IS THE SAME EVALUATION, NOT A FASTER ONE ──
 *
 * Every verdict here comes from `evaluateStaffReadiness`, over satisfaction from
 * `resolveRequirementSatisfaction`, over requirements from
 * `resolveEffectiveQualificationRequirements` — the three functions the
 * single-employment service calls, in the same order, with the same inputs. What
 * is batched is the I/O, never the arithmetic. `staffReadinessSignals.test.ts`
 * asserts the two paths agree employment by employment, so a second evaluator
 * cannot grow here unnoticed.
 *
 * ── WHY IT CANNOT BLOCK ──
 *
 * The trigger is `record_view`, exactly as the card's. `isReadinessBlockingTrigger`
 * admits only action_execute, form_submit and status_transition, so `blocking` is
 * false for every gap this module can produce — including an enforced one. A
 * caller who wanted to stop an operator could not use this to do it, which is the
 * V1 product rule expressed as a data path rather than as a promise.
 *
 * Nothing here is stored. There is no signal table, no `is_ready`, no
 * `readiness_status`: the signal is recomputed per read, so it is right on the
 * morning a credential expires.
 */

/** What an operational surface renders. Deliberately small — a chip, not a card. */
export type StaffReadinessSignal = {
    employment_id: string;
    state: ReadinessPrimaryState;
    /** Advisory presentation only. Never an authority to prevent work. */
    tone: "ready" | "attention" | "expired";
    /** Operator copy: factual, and never "cannot" or "blocked". */
    summary: string;
    /** How many canonical gaps stand behind the summary. */
    concern_count: number;
};

type EmploymentRow = {
    id: string;
    person_id: string;
    employment_status: string | null;
    position_id: string | null;
    primary_location_id: string | null;
    start_date: string | null;
    end_date: string | null;
};

/**
 * The summary line.
 *
 * One concern names itself, because "CPR expired" is actionable and "1 issue" is
 * not. Several are counted, because four labels in a roster row is a paragraph.
 */
export function summariseStaffReadiness(readiness: ReadinessResult): StaffReadinessSignal["summary"] {
    const gaps = readiness.gaps;
    if (gaps.length === 0) return "";
    if (gaps.length === 1) {
        const gap = gaps[0]!;
        if (gap.requirement_id === "staff_employment:open_period") return gap.label;
        return gap.failure_kind === "expired" ? `${gap.label} expired`
            : gap.failure_kind === "incomplete" ? `${gap.label} documentation missing`
            : `${gap.label} missing`;
    }
    return `${gaps.length} staff requirements need attention`;
}

function toneFor(state: ReadinessPrimaryState): StaffReadinessSignal["tone"] {
    return state === "ready" ? "ready" : state === "expired" ? "expired" : "attention";
}

/**
 * Readiness for many employments, with a fixed number of reads.
 *
 * Returns a map keyed by employment id. An employment that does not belong to
 * this organization is simply absent — the same answer the single read gives, and
 * for the same reason: a foreign id must never come back as "ready".
 */
export async function composeStaffReadinessSignals(
    supabase: SupabaseClient,
    orgId: string,
    employmentIds: string[],
    asOf: string,
): Promise<Map<string, StaffReadinessSignal>> {
    const out = new Map<string, StaffReadinessSignal>();
    const ids = [...new Set(employmentIds.filter(Boolean))];
    if (!orgId || ids.length === 0) return out;

    // Org ownership is a filter on the read, not a check after it.
    const { data: empData } = await supabase
        .from("employments")
        .select("id, person_id, employment_status, position_id, primary_location_id, start_date, end_date")
        .eq("org_id", orgId)
        .in("id", ids);
    const employments = (empData ?? []) as EmploymentRow[];
    if (employments.length === 0) return out;

    const personIds = [...new Set(employments.map((e) => e.person_id).filter(Boolean))];

    const [requirementRows, types, assignmentData, heldData, locationData] = await Promise.all([
        listQualificationRequirements(supabase, orgId),
        listQualificationTypes(supabase, orgId, { includeInactive: true }),
        supabase
            .from("schedule_assignments")
            .select("subject_person_id, operational_assignment_type_id, end_date")
            .eq("org_id", orgId)
            .eq("subject_type", "staff")
            .in("subject_person_id", personIds.length > 0 ? personIds : ["00000000-0000-0000-0000-000000000000"])
            .in("status", ["planned", "active", "ending"])
            .lte("start_date", asOf),
        supabase
            .from("staff_qualifications")
            .select("*")
            .eq("org_id", orgId)
            .in("employment_id", ids),
        supabase
            .from("locations")
            .select("id, label")
            .eq("org_id", orgId),
    ]);

    const labelById = new Map((types as { id: string; label: string }[]).map((t) => [t.id, t.label]));
    const locationLabelById = new Map(
        ((locationData.data ?? []) as { id: string; label: string | null }[]).map((l) => [l.id, l.label ?? ""]),
    );

    const assignmentTypesByPerson = new Map<string, string[]>();
    for (const a of (assignmentData.data ?? []) as {
        subject_person_id: string; operational_assignment_type_id: string | null; end_date: string | null;
    }[]) {
        if (a.end_date != null && a.end_date < asOf) continue;
        if (!a.operational_assignment_type_id) continue;
        const list = assignmentTypesByPerson.get(a.subject_person_id) ?? [];
        if (!list.includes(a.operational_assignment_type_id)) list.push(a.operational_assignment_type_id);
        assignmentTypesByPerson.set(a.subject_person_id, list);
    }

    const heldRows = (heldData.data ?? []) as unknown as StaffQualificationRow[];
    const heldByEmployment = new Map<string, StaffQualificationRow[]>();
    for (const row of heldRows) {
        const key = (row as unknown as { employment_id: string }).employment_id;
        const list = heldByEmployment.get(key) ?? [];
        list.push(row);
        heldByEmployment.set(key, list);
    }

    // Evidence counts, for the same reason the single-employment read fetches them:
    // `resolveRequirementSatisfaction` consults this map whenever a requirement sets
    // `evidenceRequired`, and an empty one reports `evidence_missing` for credentials
    // that DO have evidence. A false compliance warning is worse than none.
    const evidenceCounts = new Map<string, number>();
    if (heldRows.length > 0) {
        const { data: ev } = await supabase
            .from("staff_qualification_evidence")
            .select("staff_qualification_id")
            .eq("org_id", orgId)
            .in("staff_qualification_id", heldRows.map((r) => r.id));
        for (const e of (ev ?? []) as { staff_qualification_id: string }[]) {
            evidenceCounts.set(e.staff_qualification_id, (evidenceCounts.get(e.staff_qualification_id) ?? 0) + 1);
        }
    }

    for (const employment of employments) {
        const context = {
            employmentId: employment.id,
            positionId: employment.position_id,
            siteLocationId: employment.primary_location_id,
            siteLabel: employment.primary_location_id
                ? locationLabelById.get(employment.primary_location_id) || null
                : null,
            assignmentTypeIds: assignmentTypesByPerson.get(employment.person_id) ?? [],
            asOf,
        };
        const held = heldByEmployment.get(employment.id) ?? [];
        // The SAME two model calls the single-employment service makes.
        const requirements = resolveEffectiveQualificationRequirements(requirementRows, context);
        const satisfaction = resolveRequirementSatisfaction(requirements, held, context, evidenceCounts);

        const readiness = evaluateStaffReadiness({
            orgId,
            trigger: "record_view",
            context,
            employment: {
                status: employment.employment_status,
                isOpen: isOpenEmploymentStatus(employment.employment_status),
                startDate: employment.start_date,
                endDate: employment.end_date,
            },
            satisfaction,
            typeLabel: (id) => labelById.get(id) ?? "Qualification",
            scopeLabel: (scopeType, scopeId) =>
                scopeType === "site" && scopeId && scopeId === employment.primary_location_id && context.siteLabel
                    ? `at ${context.siteLabel}`
                    : "",
        });

        out.set(employment.id, {
            employment_id: employment.id,
            state: readiness.primary_state,
            tone: toneFor(readiness.primary_state),
            summary: summariseStaffReadiness(readiness),
            concern_count: readiness.gaps.length,
        });
    }
    return out;
}
