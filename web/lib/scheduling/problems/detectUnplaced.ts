/**
 * Unplaced-child detector — the Place-a-Child queue for the Scheduling Overview.
 *
 * An unplaced child is an operational enrollment agreement at a site that has no
 * operational schedule assignment (the `needs-placement` state of the canonical
 * projection). Derived, not stored; pure diff core + thin I/O.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES,
    SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export type UnplacedAgreementLite = {
    id: string;
    customer_member_id: string;
    person_id: string | null;
    site_location_id: string;
    start_date: string | null;
};

export type UnplacedChild = {
    agreementId: string;
    customerMemberId: string;
    personId: string | null;
    siteLocationId: string;
    name: string;
    startDate: string | null;
};

/** Pure: agreements with no operational schedule assignment. */
export function selectUnplacedAgreements(
    agreements: readonly UnplacedAgreementLite[],
    operationalAssignmentAgreementIds: ReadonlySet<string>
): UnplacedAgreementLite[] {
    return agreements.filter((a) => !operationalAssignmentAgreementIds.has(a.id));
}

/** Thin I/O: resolve the unplaced-child queue for a site. */
export async function detectUnplacedChildren(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string
): Promise<UnplacedChild[]> {
    const { data: agreementData, error: agreementError } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, person_id, site_location_id, start_date")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", [...CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES]);
    if (agreementError) throw new OperationalEnrollmentServiceError("db_error", agreementError.message);

    const agreements = (agreementData ?? []) as UnplacedAgreementLite[];
    if (agreements.length === 0) return [];

    const agreementIds = agreements.map((a) => a.id);
    const { data: assignmentData, error: assignmentError } = await supabase
        .from("schedule_assignments")
        .select("enrollment_agreement_id")
        .eq("org_id", orgId)
        .in("status", [...SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES])
        .in("enrollment_agreement_id", agreementIds);
    if (assignmentError) throw new OperationalEnrollmentServiceError("db_error", assignmentError.message);

    const placedAgreementIds = new Set(
        ((assignmentData ?? []) as { enrollment_agreement_id: string }[]).map(
            (r) => r.enrollment_agreement_id
        )
    );

    const unplaced = selectUnplacedAgreements(agreements, placedAgreementIds);
    if (unplaced.length === 0) return [];

    // Resolve display names via person_id → persons.display_name.
    const personIds = [...new Set(unplaced.map((a) => a.person_id).filter((id): id is string => !!id))];
    const nameByPersonId = new Map<string, string>();
    if (personIds.length > 0) {
        const { data: personData } = await supabase
            .from("persons")
            .select("id, display_name")
            .eq("org_id", orgId)
            .in("id", personIds);
        for (const p of (personData ?? []) as { id: string; display_name: string | null }[]) {
            if (p.display_name) nameByPersonId.set(p.id, p.display_name);
        }
    }

    return unplaced.map((a) => ({
        agreementId: a.id,
        customerMemberId: a.customer_member_id,
        personId: a.person_id,
        siteLocationId: a.site_location_id,
        name: (a.person_id && nameByPersonId.get(a.person_id)) || "Unnamed child",
        startDate: a.start_date,
    }));
}
