/**
 * MAY THIS ACTOR READ THIS ONE PIECE OF FINANCIAL TRUTH — the detail-read half of the location contract.
 *
 * `financialWorkLocation.ts` decides which financial work an operator may see, and every LIST reader
 * applies it before reading money (position, work queue, payment flow, activity, subjects, Billing's
 * projections). The DETAIL reads — one charge, one household's card, one payment, one ledger row —
 * stopped at org + `fin.read`. So a site-restricted operator who was correctly shown nothing for a
 * household in every list could still read that household's amounts by asking for it by id (BP V2 D4,
 * measured on hosted staging, run `qar_58463703cedd`).
 *
 * This module adds NO visibility rule. It resolves the location of the thing asked for exactly the
 * way the list readers do — a money row's billable source: an agreement's site, or the org-scoped
 * household account — and asks `isFinancialWorkVisible`. The org-wide view of the actor is always
 * `activeSiteLocationId: null`: a detail read is not filtered by a site picker, only bounded by rights.
 *
 * ── TWO GRAINS, ONE RULE ──
 *
 * ONE ITEM (a charge, payment, collection attempt, ledger row): readable when its own location is
 * visible. Exactly the per-row decision the lists make.
 *
 * ONE HOUSEHOLD'S FINANCIAL PRESENTATION (the Financials card and the household-keyed reads it is built
 * from: balances, shares, discounts, autopay, payment methods): readable when EVERY location the
 * household's money occupies is visible. These presentations total and summarise across the whole
 * account and cannot be narrowed item by item without redesigning them, and "a total is the one place a
 * leaked row is invisible" (`resolveFinancialPosition`). So a household with money at a site the actor
 * does not hold, or household-sourced (org-scoped) money, is refused to a site-restricted actor as a
 * whole rather than shown with a subtotal that includes what they may not see.
 *
 * This is deliberately NOT household record visibility. Being able to open a family, a child or an
 * Enrollment case (CRM scope, `accessScope.ts`) grants nothing here, and the household's financial
 * SUBJECT appearing in an Accounts list (`isFinancialSubjectVisible`: any location visible) is a
 * listing decision, not permission to read every amount on the account.
 *
 * Unrestricted actors (`siteScope: "all"`) are answered without a read: org + `fin.read` already
 * decided them. Everything here fails CLOSED for restricted actors — an unresolvable location is
 * withheld, as the lists withhold it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isFinancialWorkVisible, resolveFinancialWorkLocation, type FinancialWorkLocation } from "@/lib/financials/workspace/financialWorkLocation";

/** The actor's own site rights, resolved server-side from the access context. Never from a request. */
export type FinancialReadScope = {
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
};

export function financialReadScopeFromAccess(access: {
    siteScope?: string | null;
    allowedSiteLocationIds?: readonly string[] | null;
}): FinancialReadScope {
    // Anything other than an explicit "all" is treated as restricted: an unknown mode never widens.
    return access.siteScope === "all"
        ? { siteScope: "all", allowedSiteLocationIds: [] }
        : { siteScope: "restricted", allowedSiteLocationIds: [...(access.allowedSiteLocationIds ?? [])] };
}

const visible = (location: FinancialWorkLocation | null, scope: FinancialReadScope) =>
    Boolean(location) &&
    isFinancialWorkVisible({
        location: location as FinancialWorkLocation,
        siteScope: scope.siteScope,
        allowedSiteLocationIds: scope.allowedSiteLocationIds,
        activeSiteLocationId: null,
    });

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The location of one money row, from its billable source — the list readers' resolution, unchanged. */
async function sourceLocation(
    supabase: SupabaseClient,
    orgId: string,
    source: { billable_source_type?: unknown; billable_source_id?: unknown },
): Promise<FinancialWorkLocation | null> {
    const type = t(source.billable_source_type);
    let agreementSiteLocationId: string | null = null;
    if (type === "enrollment_agreement") {
        const id = t(source.billable_source_id);
        if (!id) return null;
        const { data, error } = await supabase
            .from("child_enrollment_agreements")
            .select("site_location_id")
            .eq("org_id", orgId)
            .eq("id", id)
            .maybeSingle();
        if (error || !data) return null;
        agreementSiteLocationId = ((data as { site_location_id?: string | null }).site_location_id ?? null) || null;
    }
    return resolveFinancialWorkLocation({ billableSourceType: type || null, agreementSiteLocationId });
}

/** Tables whose rows carry a billable source and so locate themselves. */
export type FinancialItemTable = "charges" | "payments" | "payment_collection_attempts" | "ledger_transactions";

/** The billable sources the location contract governs. Anything else (`job`: the services vertical) is outside it. */
const GOVERNED_SOURCES = new Set(["enrollment_agreement", "customer"]);

export type FinancialReadVerdict =
    | "readable"
    /** Does not exist in the org. Callers answer this and `out_of_scope` identically, so ids can't be probed. */
    | "missing"
    | "out_of_scope"
    /**
     * A money row whose source the childcare location contract does not govern (a `job` source). The
     * contract excludes such work from Financials entirely; it keeps whatever authorization it had
     * before, unchanged here, rather than being newly refused or newly widened.
     */
    | "not_governed";

/** May this actor read this one financial item? */
export async function financialItemReadable(
    supabase: SupabaseClient,
    args: { orgId: string; scope: FinancialReadScope; table: FinancialItemTable; id: string },
): Promise<FinancialReadVerdict> {
    if (args.scope.siteScope === "all") return "readable";
    const id = t(args.id);
    if (!id) return "missing";
    const { data, error } = await supabase
        .from(args.table)
        .select("billable_source_type, billable_source_id")
        .eq("org_id", args.orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) return "out_of_scope";
    if (!data) return "missing";
    return financialSourceReadable(supabase, { orgId: args.orgId, scope: args.scope, source: data as Record<string, unknown> });
}

/** The same decision for a money row the caller has already read (its billable source columns). */
export async function financialSourceReadable(
    supabase: SupabaseClient,
    args: { orgId: string; scope: FinancialReadScope; source: { billable_source_type?: unknown; billable_source_id?: unknown } },
): Promise<FinancialReadVerdict> {
    if (args.scope.siteScope === "all") return "readable";
    const type = t(args.source.billable_source_type);
    if (type && !GOVERNED_SOURCES.has(type)) return "not_governed";
    return visible(await sourceLocation(supabase, args.orgId, args.source), args.scope) ? "readable" : "out_of_scope";
}

/** Resolve the household behind a household / child / opportunity-child key, inside the org. */
export async function resolveFinancialHouseholdId(
    supabase: SupabaseClient,
    args: { orgId: string; customerId?: string | null; customerMemberId?: string | null; opportunityCustomerMemberId?: string | null },
): Promise<string | null> {
    let memberId = t(args.customerMemberId);
    const ocm = t(args.opportunityCustomerMemberId);
    if (!memberId && ocm) {
        const { data } = await supabase
            .from("opportunity_customer_members")
            .select("customer_member_id")
            .eq("org_id", args.orgId)
            .eq("id", ocm)
            .maybeSingle();
        memberId = t((data as { customer_member_id?: string } | null)?.customer_member_id);
        if (!memberId) return null;
    }
    const memberHousehold = memberId
        ? t(
              (
                  (
                      await supabase.from("customer_members").select("customer_id").eq("org_id", args.orgId).eq("id", memberId).maybeSingle()
                  ).data as { customer_id?: string } | null
              )?.customer_id,
          ) || null
        : null;
    const customerId = t(args.customerId) || null;
    // Two keys naming two different households is a forged request, not an ambiguity to resolve.
    if (customerId && memberHousehold && customerId !== memberHousehold) return null;
    if (memberId && !memberHousehold) return null;
    const household = customerId || memberHousehold;
    if (!household) return null;
    const { data } = await supabase.from("customers").select("id").eq("org_id", args.orgId).eq("id", household).maybeSingle();
    return data ? household : null;
}

/**
 * May this actor read this household's financial presentation? Every location its money occupies must
 * be visible: each enrolment agreement's site, and the household account itself when any charge or
 * payment is household-sourced. A household with no location at all is not inside any site.
 */
export async function householdFinancialsReadable(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        scope: FinancialReadScope;
        customerId?: string | null;
        customerMemberId?: string | null;
        opportunityCustomerMemberId?: string | null;
    },
): Promise<FinancialReadVerdict> {
    if (args.scope.siteScope === "all") return "readable";
    const household = await resolveFinancialHouseholdId(supabase, args);
    if (!household) return "missing";

    const [agreements, householdCharge, householdPayment] = await Promise.all([
        supabase.from("child_enrollment_agreements").select("site_location_id").eq("org_id", args.orgId).eq("customer_id", household),
        supabase
            .from("charges")
            .select("id")
            .eq("org_id", args.orgId)
            .eq("billable_source_type", "customer")
            .eq("billable_source_id", household)
            .limit(1),
        supabase
            .from("payments")
            .select("id")
            .eq("org_id", args.orgId)
            .eq("billable_source_type", "customer")
            .eq("billable_source_id", household)
            .limit(1),
    ]);
    if (agreements.error || householdCharge.error || householdPayment.error) return "out_of_scope";

    const locations: Array<FinancialWorkLocation | null> = ((agreements.data ?? []) as Array<{ site_location_id: string | null }>).map((a) =>
        resolveFinancialWorkLocation({ billableSourceType: "enrollment_agreement", agreementSiteLocationId: a.site_location_id ?? null }),
    );
    if ((householdCharge.data ?? []).length || (householdPayment.data ?? []).length) {
        locations.push(resolveFinancialWorkLocation({ billableSourceType: "customer", agreementSiteLocationId: null }));
    }
    if (!locations.length) return "out_of_scope";
    return locations.every((l) => visible(l, args.scope)) ? "readable" : "out_of_scope";
}
