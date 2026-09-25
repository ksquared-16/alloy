import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ONE ACQUISITION FOR THE ACCOUNT-LIST COHORT.
 *
 * The deployed instrumentation decomposed the subjects branch into six sequential remote waves
 * over a cohort of twelve households — a mean 113 ms per wave, while row assembly measured 0.2 ms.
 * The cost follows the NUMBER OF ROUND TRIPS, not the number of rows.
 *
 * This is the transport seam for `financials_account_subject_facts`. It carries rows and nothing
 * else: every column the application rules read travels with them, and every rule stays where it
 * already lives. `is_active`, `role_type`, `status`, `end_date`, the placement status and both
 * `label` and `key` are here precisely so that `childNamesFrom`, `readContactNames`,
 * `readCurrentPlacements` and `isFinancialSubjectVisible` keep deciding what they decide today.
 *
 * It fails CLOSED. A cohort that cannot be acquired is not an empty cohort — an empty account list
 * and an unavailable one look identical on screen and mean opposite things, so the caller gets a
 * throw rather than a rail that quietly claims this organisation has no households.
 */

export type SubjectHouseholdRow = { id: string; name: string | null };
export type SubjectMemberRow = {
    id: string | null;
    customer_id: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean | null;
};
export type SubjectContactRow = {
    customer_id: string | null;
    role_type: string | null;
    status: string | null;
    end_date: string | null;
    first_name: string | null;
    last_name: string | null;
};
export type SubjectPlacementRow = {
    customer_member_id: string | null;
    program_category_id: string | null;
    room_location_id: string | null;
    status: string | null;
};

export type SubjectFactRows = {
    /** Up to `scanCap + 1` rows. The extra row is how the caller learns the cohort was truncated. */
    households: SubjectHouseholdRow[];
    members: SubjectMemberRow[];
    agreement_sites_direct: Array<{ customer_id: string | null; site_location_id: string | null }>;
    agreement_sites_orphan: Array<{ customer_member_id: string | null; site_location_id: string | null }>;
    orphan_members: Array<{ id: string | null; customer_id: string | null }>;
    contacts: SubjectContactRow[];
    placements: SubjectPlacementRow[];
    /** For EVERY member, unfiltered: the placement-first precedence rule belongs to the caller. */
    enrolment_intents: Array<{ subject_id: string | null; metadata: unknown }>;
    program_labels: Array<{ id: string; label: string | null; key: string | null }>;
    room_labels: Array<{ id: string; label: string | null }>;
};

const EMPTY: SubjectFactRows = {
    households: [],
    members: [],
    agreement_sites_direct: [],
    agreement_sites_orphan: [],
    orphan_members: [],
    contacts: [],
    placements: [],
    enrolment_intents: [],
    program_labels: [],
    room_labels: [],
};

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Every declared fact set, so a field the function stops returning reads as empty, never as absent. */
export function subjectFactsFrom(payload: unknown): SubjectFactRows {
    const bundle = (payload ?? {}) as Record<string, unknown>;
    return {
        households: asArray<SubjectHouseholdRow>(bundle.households),
        members: asArray<SubjectMemberRow>(bundle.members),
        agreement_sites_direct: asArray(bundle.agreement_sites_direct),
        agreement_sites_orphan: asArray(bundle.agreement_sites_orphan),
        orphan_members: asArray(bundle.orphan_members),
        contacts: asArray<SubjectContactRow>(bundle.contacts),
        placements: asArray<SubjectPlacementRow>(bundle.placements),
        enrolment_intents: asArray(bundle.enrolment_intents),
        program_labels: asArray(bundle.program_labels),
        room_labels: asArray(bundle.room_labels),
    };
}

export const EMPTY_SUBJECT_FACTS: SubjectFactRows = EMPTY;

export async function readAccountSubjectFacts(
    supabase: SupabaseClient,
    args: { orgId: string; scanCap: number; enrollmentProcessKey: string },
): Promise<SubjectFactRows> {
    const { data, error } = await supabase.rpc("financials_account_subject_facts", {
        p_org_id: args.orgId,
        p_scan_cap: args.scanCap,
        p_enrollment_process_key: args.enrollmentProcessKey,
    });
    if (error) {
        throw new Error(`financial subjects: the account cohort is unavailable (${error.message.trim()})`);
    }
    return subjectFactsFrom(data);
}
