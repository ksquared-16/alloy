import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReadinessResult, ReadinessTrigger } from "@/lib/completion/readinessTypes";
import { isOpenEmploymentStatus } from "@/lib/employment/employmentTypes";
import { listQualificationTypes, resolveQualificationStateForWorkContext } from "@/lib/staffQualifications/staffQualificationService";
import {
    evaluateStaffReadiness,
    type StaffReadinessWorkContext,
} from "@/lib/staffReadiness/staffReadinessModel";

/**
 * Staff readiness, composed server-side from canonical facts.
 *
 * READ ONLY BY CONSTRUCTION. There is no readiness table and nothing here writes
 * one: every call recomputes from the employment and the Slice 3 qualification
 * answer. A stored verdict would be wrong the morning a credential expired, which
 * is the whole reason readiness is a projection.
 */
export class StaffReadinessError extends Error {
    constructor(readonly code: "invalid_input" | "not_found" | "db_error", message: string) {
        super(message);
        this.name = "StaffReadinessError";
    }
}

export type StaffReadinessComposition = {
    readiness: ReadinessResult;
    /** What the evaluation was about, reported so an operator can see the context. */
    work_context: StaffReadinessWorkContext;
    employment: { id: string; status: string | null; start_date: string | null; end_date: string | null };
};

export async function composeStaffReadiness(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
    asOf: string,
    trigger: ReadinessTrigger = "record_view",
): Promise<StaffReadinessComposition> {
    if (!orgId || !employmentId) {
        throw new StaffReadinessError("invalid_input", "Organization and employment are required.");
    }

    // The employment must belong to this organization. Asked FIRST, so a foreign id
    // is `not_found` rather than an evaluation that quietly returns "ready".
    const { data: emp, error } = await supabase
        .from("employments")
        .select("id, org_id, person_id, employment_status, position_id, primary_location_id, start_date, end_date")
        .eq("id", employmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new StaffReadinessError("db_error", error.message);
    if (!emp) throw new StaffReadinessError("not_found", "That employment does not belong to this organization.");

    const employment = emp as {
        id: string; person_id: string; employment_status: string | null;
        position_id: string | null; primary_location_id: string | null;
        start_date: string | null; end_date: string | null;
    };

    // The assignment axis is what this person is assigned under on the evaluated
    // day — the same derivation the qualification read route uses, so readiness and
    // qualifications cannot disagree about which requirements apply.
    const { data: assignments } = await supabase
        .from("schedule_assignments")
        .select("operational_assignment_type_id, end_date")
        .eq("org_id", orgId)
        .eq("subject_type", "staff")
        .eq("subject_person_id", employment.person_id)
        .in("status", ["planned", "active", "ending"])
        .lte("start_date", asOf);
    const assignmentTypeIds = [
        ...new Set(
            ((assignments ?? []) as { operational_assignment_type_id: string | null; end_date: string | null }[])
                .filter((a) => a.end_date == null || a.end_date >= asOf)
                .map((a) => a.operational_assignment_type_id)
                .filter((v): v is string => Boolean(v)),
        ),
    ];

    const [state, types, siteLabel] = await Promise.all([
        resolveQualificationStateForWorkContext(supabase, orgId, {
            employmentId,
            positionId: employment.position_id,
            siteLocationId: employment.primary_location_id,
            assignmentTypeIds,
            asOf,
        }),
        listQualificationTypes(supabase, orgId, { includeInactive: true }),
        resolveLocationLabel(supabase, orgId, employment.primary_location_id),
    ]);

    const labelById = new Map(
        (types as { id: string; label: string }[]).map((t) => [t.id, t.label]),
    );

    const work_context: StaffReadinessWorkContext = {
        employmentId,
        positionId: employment.position_id,
        siteLocationId: employment.primary_location_id,
        siteLabel,
        assignmentTypeIds,
        asOf,
    };

    const readiness = evaluateStaffReadiness({
        orgId,
        trigger,
        context: work_context,
        employment: {
            status: employment.employment_status,
            // "Open" is the canonical employment reading, not a date comparison and
            // not a local list: `lib/employment` owns which statuses count, and a copy
            // here drifts from the Employment card the operator is looking at. It did —
            // a hand-written set omitted `pending_start`, so an employment the roster
            // and the Employment card both call open was reported as "not started yet",
            // and that enforced gap short-circuited every qualification requirement.
            isOpen: isOpenEmploymentStatus(employment.employment_status),
            startDate: employment.start_date,
            endDate: employment.end_date,
        },
        satisfaction: state.satisfaction,
        typeLabel: (id) => labelById.get(id) ?? "Qualification",
        // Naming the actual site is what turns "required at this site" into something
        // an operator can act on.
        scopeLabel: (scopeType, scopeId) =>
            scopeType === "site" && scopeId && scopeId === employment.primary_location_id && siteLabel
                ? siteLabel
                : "",
    });

    return {
        readiness,
        work_context,
        employment: {
            id: employment.id,
            status: employment.employment_status,
            start_date: employment.start_date,
            end_date: employment.end_date,
        },
    };
}

async function resolveLocationLabel(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string | null,
): Promise<string | null> {
    if (!locationId) return null;
    const { data } = await supabase
        .from("locations").select("label").eq("id", locationId).eq("org_id", orgId).maybeSingle();
    return (data as { label?: string } | null)?.label ?? null;
}
