/**
 * Staff-subject eligibility for operational assignments.
 *
 * One question, one authority: canonical EMPLOYMENT. This is a thin adapter over
 * `assertStaffPersonEligible` that re-raises in the scheduling error taxonomy so
 * existing assignment callers and route error mapping are unchanged.
 *
 * What it replaces: two copies of `persons.is_employee !== true`. That column is
 * a waitlist household-priority flag ("a parent who works here") — it is NULL for
 * every person in a real tenant, so leaving it in place after the database moved
 * to employment would have rejected every validly employed staff member before
 * the request ever reached Postgres.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { EmploymentServiceError } from "@/lib/employment/employmentErrors";
import { assertStaffPersonEligible } from "@/lib/employment/employmentService";

export async function assertStaffPersonEligibleForAssignment(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    onDate: string
): Promise<void> {
    try {
        await assertStaffPersonEligible(supabase, orgId, personId, onDate);
    } catch (err) {
        if (err instanceof EmploymentServiceError) {
            throw new OperationalEnrollmentServiceError(
                err.code === "db_error" ? "db_error" : "validation_failed",
                err.message,
                { person_id: personId, on_date: onDate, ...(err.details ?? {}) }
            );
        }
        throw err;
    }
}
