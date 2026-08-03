/**
 * Light Assignment attention signals for Assignments Workspace Overview.
 * Derived from operational assignment rows — not a new calculation engine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES,
    SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

function addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

export type AssignmentAttention = {
    /** Children with 2+ concurrent operational assignments. */
    multipleAssignments: number;
    /** Assignments with start_date after today (upcoming windows). */
    upcomingAssignments: number;
    /** Planned/active primary rows whose start is still in the future. */
    futurePrimaryChanges: number;
    /** Operational rows missing an Assignment Type. */
    missingAssignmentTypes: number;
    /** Children at site with no operational assignment (same cohort as unplaced when placement-driven). */
    childrenMissingAssignments: number;
    /** Overlapping or conflicting assignments — projection not yet live. */
    assignmentConflicts: number;
    /** Assignments ending within the next 14 days. */
    expiringSoon: number;
    /** Changes proposed but not yet reviewed — feed not yet live. */
    changesAwaitingReview: number;
};

type AssignmentRow = {
    id: string;
    enrollment_agreement_id: string | null;
    is_primary: boolean | null;
    operational_assignment_type_id: string | null;
    start_date: string;
    end_date: string | null;
    status: string;
};

export async function computeAssignmentAttention(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    todayYmd: string,
    childrenMissingAssignments: number
): Promise<AssignmentAttention> {
    const { data: agreementRows, error: agreementErr } = await supabase
        .from("child_enrollment_agreements")
        .select("id")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", [...CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES]);
    if (agreementErr) throw new OperationalEnrollmentServiceError("db_error", agreementErr.message);
    const agreementIds = ((agreementRows ?? []) as { id: string }[]).map((r) => r.id);
    if (agreementIds.length === 0) {
        return {
            multipleAssignments: 0,
            upcomingAssignments: 0,
            futurePrimaryChanges: 0,
            missingAssignmentTypes: 0,
            childrenMissingAssignments,
            assignmentConflicts: 0,
            expiringSoon: 0,
            changesAwaitingReview: 0,
        };
    }

    const { data, error } = await supabase
        .from("schedule_assignments")
        .select(
            "id, enrollment_agreement_id, is_primary, operational_assignment_type_id, start_date, end_date, status"
        )
        .eq("org_id", orgId)
        .eq("subject_type", "child")
        .in("enrollment_agreement_id", agreementIds)
        .in("status", [...SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES]);
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);

    const rows = (data ?? []) as AssignmentRow[];
    const byAgreement = new Map<string, AssignmentRow[]>();
    let upcomingAssignments = 0;
    let futurePrimaryChanges = 0;
    let missingAssignmentTypes = 0;
    let expiringSoon = 0;
    const expireThreshold = addDaysYmd(todayYmd, 14);

    for (const row of rows) {
        const aid = row.enrollment_agreement_id;
        if (aid) {
            const list = byAgreement.get(aid) ?? [];
            list.push(row);
            byAgreement.set(aid, list);
        }
        if (row.start_date > todayYmd) {
            upcomingAssignments += 1;
            if (row.is_primary) futurePrimaryChanges += 1;
        }
        if (!row.operational_assignment_type_id) missingAssignmentTypes += 1;
        if (row.end_date && row.end_date >= todayYmd && row.end_date <= expireThreshold) expiringSoon += 1;
    }

    let multipleAssignments = 0;
    for (const list of byAgreement.values()) {
        if (list.length >= 2) multipleAssignments += 1;
    }

    return {
        multipleAssignments,
        upcomingAssignments,
        futurePrimaryChanges,
        missingAssignmentTypes,
        childrenMissingAssignments,
        assignmentConflicts: 0,
        expiringSoon,
        changesAwaitingReview: 0,
    };
}
