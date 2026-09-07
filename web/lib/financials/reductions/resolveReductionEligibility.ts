/**
 * ELIGIBILITY, PROVEN FROM CANONICAL FACTS — never asserted by a caller.
 *
 * A sibling discount is a claim about a household; an employee discount is a claim about
 * employment. Both are checkable, and a surface that could declare either would be a surface that
 * could grant itself money. So nothing here reads a payload: it reads the enrolment agreements the
 * household actually holds and the employments the org actually recorded.
 *
 * ── WHAT MAKES A SIBLING ──
 *
 * Children of the same `customers` account with an enrolment agreement that COVERS THE SERVICE
 * PERIOD. Not "has an agreement" — a sibling who left in June is not a sibling for September, and
 * an agreement that starts in October does not discount August. Rank is by enrolment start then id,
 * so the same household produces the same ranking on every run; a discount whose recipient depends
 * on row order is a discount that moves between children for no reason a parent could accept.
 *
 * ── WHAT MAKES AN EMPLOYEE HOUSEHOLD ──
 *
 * A person linked to the account (`customer_persons`, live over the period) who holds an
 * `employments` row covering it. `employments` is the canonical, effective-dated employment fact
 * and is already the owner of employment status elsewhere in the platform; this reads it and adds
 * nothing to it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EligibilityFacts } from "@/lib/financials/reductions/resolveFinancialReductions";

/** An enrolment covers a period when it starts on/before the end and has not ended before the start. */
function coversPeriod(start: string | null, end: string | null, periodStart: string, periodEnd: string): boolean {
    if (start && start > periodEnd) return false;
    if (end && end < periodStart) return false;
    return true;
}

export type HouseholdEligibility = {
    customerId: string | null;
    /** Facts keyed by `customer_members.id`, for every concurrently enrolled child. */
    byMember: Map<string, EligibilityFacts>;
    employeeHousehold: boolean;
};

/**
 * Resolve one household's reduction facts for one service period.
 *
 * Returns facts for EVERY concurrently enrolled child, not only the one asked about, because a
 * sibling discount is relational: the second child's benefit is a fact about the first child's
 * enrolment, and resolving them one at a time would ask the database the same question N times to
 * get N answers that must agree.
 */
export async function resolveHouseholdEligibility(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; periodStart: string; periodEnd: string },
): Promise<HouseholdEligibility> {
    const { orgId, customerId, periodStart, periodEnd } = args;

    const { data: agreementRows, error: agreementError } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, status, start_date, end_date")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    if (agreementError) throw new Error(`enrolment read failed: ${agreementError.message}`);

    /*
     * ACTIVE, AND COVERING THE PERIOD. A withdrawn agreement is not an enrolment, and an agreement
     * outside the month is not concurrent — both would inflate the sibling count and hand a family
     * a discount they are not owed.
     */
    const enrolled = ((agreementRows ?? []) as Array<{
        id: string;
        customer_member_id: string | null;
        status: string | null;
        start_date: string | null;
        end_date: string | null;
    }>)
        .filter((a) => (a.status ?? "") === "active")
        .filter((a) => coversPeriod(a.start_date, a.end_date, periodStart, periodEnd))
        .filter((a) => !!a.customer_member_id);

    // One child, one place in the ranking, however many agreements they hold.
    const earliestByMember = new Map<string, { start: string; agreementId: string }>();
    for (const a of enrolled) {
        const memberId = a.customer_member_id as string;
        const start = a.start_date ?? "";
        const seen = earliestByMember.get(memberId);
        if (!seen || start < seen.start || (start === seen.start && a.id < seen.agreementId)) {
            earliestByMember.set(memberId, { start, agreementId: a.id });
        }
    }

    const ranked = [...earliestByMember.entries()].sort((a, b) => {
        if (a[1].start !== b[1].start) return a[1].start < b[1].start ? -1 : 1;
        return a[0] < b[0] ? -1 : 1; // a total order, so the ranking never moves between runs
    });

    const employeeHousehold = await resolveEmployeeHousehold(supabase, {
        orgId,
        customerId,
        periodStart,
        periodEnd,
    });

    const byMember = new Map<string, EligibilityFacts>();
    ranked.forEach(([memberId], index) => {
        byMember.set(memberId, {
            siblingRank: index + 1,
            siblingCount: ranked.length,
            employeeHousehold,
        });
    });

    return { customerId, byMember, employeeHousehold };
}

/** Does anyone on this account hold an employment covering the period? */
export async function resolveEmployeeHousehold(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; periodStart: string; periodEnd: string },
): Promise<boolean> {
    const { data: linkRows, error: linkError } = await supabase
        .from("customer_persons")
        .select("person_id, status, start_date, end_date")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId);
    if (linkError) throw new Error(`household person read failed: ${linkError.message}`);

    const personIds = ((linkRows ?? []) as Array<{
        person_id: string | null;
        status: string | null;
        start_date: string | null;
        end_date: string | null;
    }>)
        .filter((p) => (p.status ?? "active") !== "inactive")
        .filter((p) => coversPeriod(p.start_date, p.end_date, args.periodStart, args.periodEnd))
        .map((p) => p.person_id)
        .filter((id): id is string => !!id);
    if (personIds.length === 0) return false;

    const { data: employmentRows, error: employmentError } = await supabase
        .from("employments")
        .select("person_id, employment_status, start_date, end_date")
        .eq("org_id", args.orgId)
        .in("person_id", personIds);
    if (employmentError) throw new Error(`employment read failed: ${employmentError.message}`);

    return ((employmentRows ?? []) as Array<{
        employment_status: string | null;
        start_date: string | null;
        end_date: string | null;
    }>).some(
        (e) =>
            (e.employment_status ?? "") === "active"
            && coversPeriod(e.start_date, e.end_date, args.periodStart, args.periodEnd),
    );
}
