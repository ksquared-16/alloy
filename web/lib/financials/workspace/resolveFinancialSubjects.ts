/**
 * WHO HAS A FINANCIAL ACCOUNT — the cohort BEFORE any money exists.
 *
 * ── WHY THIS IS A SEPARATE READ FROM POSITION ──────────────────────────────────────────────────
 *
 * `resolveFinancialPositionCohort` answers "what is posted money doing". It discovers households by
 * scanning charges, so a household appears on it only once somebody has billed them. Accounts was
 * built on that cohort alone, and it therefore answered a question nobody asked: *which households
 * already have posted financial activity*. The question Accounts exists for is *which household
 * financial accounts can I understand or operate* — and a family with no transaction yet is a
 * perfectly ordinary answer to it. The household is a financial subject before its first charge;
 * that is when an operator most needs to reach it, because adding the first charge is the work.
 *
 * So the rail is `eligible financial subjects LEFT JOIN current financial position`. This module is
 * the left side. It reports NO money and computes none: it answers only who exists and where their
 * money would be located.
 *
 * ── THE ELIGIBILITY PREDICATE IS NOT INVENTED HERE ─────────────────────────────────────────────
 *
 * It was censused, and the codebase already owns it in two places that agree:
 *
 *   · `financialSubjectIdentity.ts` — "ONE RULE FOR 'does this subject have a financial account?'"
 *     resolves the household customer id and nothing else. Its own words: "Not an eligibility
 *     policy, and not a permission… This answers only the identity question: is there an account
 *     for this subject to be about." The account IS the household.
 *
 *   · `buildFinancialsCardVM` — "AN ENROLMENT IS ONE BILLABLE SOURCE, NOT ELIGIBILITY FOR
 *     FINANCIALS… a family incurs charges BEFORE they enrol — a waitlist fee, a registration or
 *     application fee, a deposit… A household with no enrolment still HAS an account. Financials
 *     answers for it."
 *
 * That is why this file does NOT gate on an active agreement. Gating on one is the exact product
 * assumption the canonical account reader removed and documented, and re-introducing it here would
 * put a second, contradictory eligibility system under the same word "account". Whether a
 * PARTICULAR charge needs an agreement stays where it already lives: the charge template and the
 * `charge.add` resolver.
 *
 * ── AND IT IS STILL NOT "EVERY ROW IN THE CRM" ─────────────────────────────────────────────────
 *
 * Eligibility is identity; VISIBILITY is the location contract, and it is applied here unchanged.
 * `financialWorkLocation.ts` already decides which financial work an operator may see, and this
 * lifts that decision from the charge grain to the subject grain by asking it of the very same
 * function, for every source the household can be charged against:
 *
 *   · each of its enrolment agreements  → `site` scope, that agreement's site
 *   · the household account itself      → `org` scope, no site
 *
 * A subject is in the cohort when AT LEAST ONE of those locations is visible. The consequences fall
 * out of the existing rule rather than being restated: a site filter admits only households with an
 * enrolment at that site; a site-restricted operator never sees an org-scoped household account,
 * because a household that belongs to no site is not inside any of the sites they hold. Site scope
 * can only narrow here, exactly as it can only narrow there.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    isFinancialWorkVisible,
    resolveFinancialWorkLocation,
    type FinancialWorkLocation,
} from "@/lib/financials/workspace/financialWorkLocation";
import { ID_BATCH, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";

/** How many households one subject read will look at. Mirrors the position scan cap deliberately. */
export const FINANCIAL_SUBJECT_SCAN_CAP = 2000;

/** One page of a PostgREST read. Stated, not assumed — `db-max-rows` is 1000 on this deployment. */
const PAGE = 1000;

export type FinancialSubjectRow = {
    customerId: string;
    /** The household's own name. Never an id on screen. */
    householdName: string | null;
    /** The sites this household's enrolment-backed money can belong to. Possibly empty. */
    siteLocationIds: string[];
    /**
     * True when the household holds at least one enrolment agreement.
     *
     * Reported, never used as a gate — see the eligibility note above. It exists so a surface can
     * say WHY an account is org-scoped rather than leaving an operator to guess.
     */
    hasEnrollmentAgreement: boolean;
};

export type FinancialSubjectCohort = {
    subjects: FinancialSubjectRow[];
    scope: { siteLocationId: string | null; siteScope: "all" | "restricted" };
    /** True when the household scan cap was reached — there are more subjects than this carries. */
    truncated: boolean;
    scanCap: number;
};

export type FinancialSubjectArgs = {
    orgId: string;
    /** The operator's own rights, resolved server-side. Never taken from a client. */
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
    /** The site the operator selected, or null for org scope. */
    activeSiteLocationId?: string | null;
    scanCap?: number;
};

/**
 * Every location a household's money can occupy, resolved through the charge-grain contract.
 *
 * The household account location is unconditional because it is unconditional in the data: a
 * household can always be the billable source of a registration or waitlist fee, whether or not one
 * has been raised. Nothing here invents a site for a household that has none.
 */
function locationsForSubject(siteLocationIds: readonly string[]): FinancialWorkLocation[] {
    const out: FinancialWorkLocation[] = [];
    for (const site of siteLocationIds) {
        const located = resolveFinancialWorkLocation({
            billableSourceType: "enrollment_agreement",
            agreementSiteLocationId: site,
        });
        if (located) out.push(located);
    }
    const household = resolveFinancialWorkLocation({
        billableSourceType: "customer",
        agreementSiteLocationId: null,
    });
    if (household) out.push(household);
    return out;
}

/** Visible when any one of the household's locations is visible. Narrowing only, never widening. */
export function isFinancialSubjectVisible(args: {
    siteLocationIds: readonly string[];
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
    activeSiteLocationId: string | null;
}): boolean {
    return locationsForSubject(args.siteLocationIds).some((location) =>
        isFinancialWorkVisible({
            location,
            siteScope: args.siteScope,
            allowedSiteLocationIds: args.allowedSiteLocationIds,
            activeSiteLocationId: args.activeSiteLocationId,
        }),
    );
}

export async function resolveFinancialSubjectCohort(
    supabase: SupabaseClient,
    args: FinancialSubjectArgs,
): Promise<FinancialSubjectCohort> {
    const activeSiteLocationId = args.activeSiteLocationId?.trim() || null;
    const scanCap = Math.min(Math.max(args.scanCap ?? FINANCIAL_SUBJECT_SCAN_CAP, 1), FINANCIAL_SUBJECT_SCAN_CAP);
    const scope = { siteLocationId: activeSiteLocationId, siteScope: args.siteScope };

    /*
     * THE HOUSEHOLDS. Paged by `.range()` for the same reason the position scan is: a `.limit()`
     * larger than `db-max-rows` is answered with a silent short page, and a rail that quietly loses
     * families is worse than one that fails. Ordered by (name, id) — the id is the tiebreaker that
     * keeps paging stable when many households share a name.
     */
    const households: Array<{ id: string; name: string | null }> = [];
    let reachedEnd = false;
    while (households.length < scanCap) {
        const want = Math.min(PAGE, scanCap - households.length);
        const { data, error } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", args.orgId)
            .order("name", { ascending: true })
            .order("id", { ascending: true })
            .range(households.length, households.length + want - 1);
        if (error) throw new Error(`financial subjects: households could not be read (${error.message.trim()})`);
        const page = (data ?? []) as Array<{ id: string; name: string | null }>;
        for (const row of page) households.push(row);
        if (page.length < want) {
            reachedEnd = true;
            break;
        }
    }
    const truncated = !reachedEnd && households.length >= scanCap;

    const customerIds = households.map((h) => h.id).filter(Boolean);
    const sitesByCustomer = await readAgreementSites(supabase, args.orgId, customerIds);

    const subjects: FinancialSubjectRow[] = [];
    for (const household of households) {
        const siteLocationIds = [...(sitesByCustomer.get(household.id) ?? new Set<string>())];
        const visible = isFinancialSubjectVisible({
            siteLocationIds,
            siteScope: args.siteScope,
            allowedSiteLocationIds: args.allowedSiteLocationIds,
            activeSiteLocationId,
        });
        if (!visible) continue;
        subjects.push({
            customerId: household.id,
            householdName: typeof household.name === "string" && household.name.trim() ? household.name.trim() : null,
            siteLocationIds,
            hasEnrollmentAgreement: siteLocationIds.length > 0,
        });
    }

    return { subjects, scope, truncated, scanCap };
}

/**
 * The sites each household's enrolments sit at.
 *
 * `child_enrollment_agreements.customer_id` is NULLABLE — `resolveBillableSourceHouseholdId` exists
 * because of it, and takes the same second hop this does. An agreement that names only the child is
 * still that household's enrolment, and dropping it would silently place a family at org scope and
 * then hide them from the site they actually attend.
 */
async function readAgreementSites(
    supabase: SupabaseClient,
    orgId: string,
    customerIds: string[],
): Promise<Map<string, Set<string>>> {
    const byCustomer = new Map<string, Set<string>>();
    const add = (customerId: string, siteLocationId: string | null) => {
        const site = typeof siteLocationId === "string" ? siteLocationId.trim() : "";
        if (!customerId || !site) return;
        const set = byCustomer.get(customerId) ?? new Set<string>();
        set.add(site);
        byCustomer.set(customerId, set);
    };

    if (customerIds.length === 0) return byCustomer;

    const direct = await readInBatches<{ customer_id: string | null; site_location_id: string | null }>(
        "enrolment sites",
        customerIds,
        (batch) =>
            supabase
                .from("child_enrollment_agreements")
                .select("customer_id, site_location_id")
                .eq("org_id", orgId)
                .in("customer_id", batch),
    );
    for (const row of direct) add(String(row.customer_id ?? ""), row.site_location_id);

    /*
     * The second hop, for agreements carrying no household id. Bounded by one paged read of exactly
     * those rows rather than by the org's whole agreement history.
     */
    const orphans: Array<{ customer_member_id: string | null; site_location_id: string | null }> = [];
    while (orphans.length < FINANCIAL_SUBJECT_SCAN_CAP) {
        const want = Math.min(PAGE, FINANCIAL_SUBJECT_SCAN_CAP - orphans.length);
        const { data, error } = await supabase
            .from("child_enrollment_agreements")
            .select("customer_member_id, site_location_id")
            .eq("org_id", orgId)
            .is("customer_id", null)
            .order("id", { ascending: true })
            .range(orphans.length, orphans.length + want - 1);
        if (error) {
            throw new Error(`financial subjects: enrolment sites could not be read (${error.message.trim()})`);
        }
        const page = (data ?? []) as Array<{ customer_member_id: string | null; site_location_id: string | null }>;
        for (const row of page) orphans.push(row);
        if (page.length < want) break;
    }
    if (orphans.length === 0) return byCustomer;

    const memberIds = orphans.map((o) => String(o.customer_member_id ?? "")).filter(Boolean);
    const members = await readInBatches<{ id: string; customer_id: string | null }>(
        "enrolment households",
        memberIds,
        (batch) =>
            supabase
                .from("customer_members")
                .select("id, customer_id")
                .eq("org_id", orgId)
                .in("id", batch),
    );
    const customerByMember = new Map(members.map((m) => [String(m.id), String(m.customer_id ?? "")]));
    for (const row of orphans) {
        const customerId = customerByMember.get(String(row.customer_member_id ?? "")) ?? "";
        add(customerId, row.site_location_id);
    }
    return byCustomer;
}

/** Re-exported so callers batching alongside this module use one batch size, not two. */
export { ID_BATCH };
