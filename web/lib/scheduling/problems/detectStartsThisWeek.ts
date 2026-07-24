/**
 * Upcoming starts detector — children whose operational start date falls within a
 * date window at a site. Powers the Overview "Starts this week" launch surface.
 *
 * Reads committed enrollment agreements (the operational foundation). Proposed
 * pre-enrollment drafts (process_instances.metadata) are NOT counted here — they
 * materialize at enrollment; surfacing them is a V2 seam. Derived, not stored.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export type UpcomingStart = {
    agreementId: string;
    customerMemberId: string;
    personId: string | null;
    name: string;
    startDate: string;
};

/** Thin I/O: agreements at a site whose start_date is within [dateStart, dateEnd]. */
export async function detectStartsInWindow(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    dateStart: string,
    dateEnd: string
): Promise<UpcomingStart[]> {
    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, person_id, start_date")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", [...CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES])
        .gte("start_date", dateStart)
        .lte("start_date", dateEnd)
        .order("start_date", { ascending: true });
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);

    const rows = (data ?? []) as {
        id: string;
        customer_member_id: string;
        person_id: string | null;
        start_date: string | null;
    }[];
    const withDates = rows.filter((r): r is typeof r & { start_date: string } => !!r.start_date);
    if (withDates.length === 0) return [];

    const personIds = [...new Set(withDates.map((r) => r.person_id).filter((id): id is string => !!id))];
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

    return withDates.map((r) => ({
        agreementId: r.id,
        customerMemberId: r.customer_member_id,
        personId: r.person_id,
        name: (r.person_id && nameByPersonId.get(r.person_id)) || "Unnamed child",
        startDate: r.start_date,
    }));
}
