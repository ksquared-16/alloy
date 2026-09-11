/**
 * WHERE A FUNDING SOURCE'S IDENTITY COMES FROM.
 *
 * ── WHAT IS CANONICAL, AND WHAT IS NOT ──
 *
 * `configureExpectedFunding` takes a `funding_source_type` from a closed five-value vocabulary, a
 * `funding_source_label`, and an optional `funding_source_reference` — which `toFundingPlan` hands
 * to Commercial Execution as the funding party's `partyId`. So the reference is where a canonical
 * identity travels, and the label is what a human reads.
 *
 * For `government_subsidy` a canonical registry already exists: `financial_funding_agencies`, the
 * agencies Thread 9 claims and reconciles against. An operator naming a state agency must pick from
 * it, so that the expectation, the authorization, the claim and the remittance are all about the
 * same agency rather than four spellings of its name.
 *
 * For `employer_sponsorship`, `scholarship`, `corporate_program` and `private_pay` there is NO such
 * registry in this platform — no employers table, no scholarships table. That is reported rather
 * than papered over: inventing a Financials-local funding-source registry would create a second
 * system of record for parties the platform may later identify properly, and the cost of unpicking
 * that is much higher than the cost of a typed label today.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** The capability's own vocabulary, quoted — not a second list that can drift from it. */
export const FUNDING_SOURCE_TYPES = [
    "government_subsidy",
    "employer_sponsorship",
    "scholarship",
    "corporate_program",
    "private_pay",
] as const;

export type FundingSourceTypeKey = (typeof FUNDING_SOURCE_TYPES)[number];

/** The one type whose identity is canonical here. Everything else names itself. */
export const CANONICALLY_IDENTIFIED_TYPES: readonly string[] = ["government_subsidy"];

export const FUNDING_SOURCE_TYPE_LABELS: Record<string, string> = {
    government_subsidy: "Government subsidy",
    employer_sponsorship: "Employer sponsorship",
    scholarship: "Scholarship",
    corporate_program: "Corporate program",
    private_pay: "Private pay",
};

export type FundingAgencyOption = {
    id: string;
    name: string;
    jurisdiction: string | null;
};

/**
 * The org's funding agencies, for the one source type that has canonical identity.
 *
 * Active only — an agency the org has retired is not something new money should be expected from,
 * and the expectations already naming it keep their reference regardless.
 */
export async function readFundingAgencies(
    supabase: SupabaseClient,
    args: { orgId: string },
): Promise<FundingAgencyOption[]> {
    const { data, error } = await supabase
        .from("financial_funding_agencies")
        .select("id, name, jurisdiction, is_active")
        .eq("org_id", args.orgId)
        .eq("is_active", true)
        .order("name", { ascending: true });
    /*
     * FAIL CLOSED. An empty list is read by the operator as "this org has no agencies", which is a
     * reason to type a name into a free-text box. It may only be said about a registry that was
     * actually read.
     */
    if (error) throw new Error(`funding agencies could not be read (${error.message.trim()})`);

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: row.name != null ? String(row.name).trim() : "Funding agency",
        jurisdiction: row.jurisdiction != null ? String(row.jurisdiction).trim() || null : null,
    }));
}
