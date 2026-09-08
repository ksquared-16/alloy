/**
 * WHICH SITE OWNS THIS PIECE OF FINANCIAL WORK — the Financials workspace's location contract.
 *
 * A workspace that offers a site picker has to answer this honestly or not offer one. Most financial
 * tables carry no `location_id`, and the tempting fixes are all wrong: denormalising a site onto
 * charges for the convenience of a filter, guessing from whichever child is easiest to find, or
 * quietly showing org-wide rows under a site heading. This resolves location the way the data
 * actually knows it — through provenance — and says plainly when there is none.
 *
 * ── THE LINEAGE ──
 *
 *   charge.billable_source_type = 'enrollment_agreement'
 *     → child_enrollment_agreements.site_location_id   (NOT NULL)
 *     → exactly one site
 *
 * That column is NOT NULL, and a charge names exactly one billable source, so an enrolment-backed
 * charge cannot span sites. It follows — without any extra rule — that a household with children at
 * two sites has its work divided per charge, and one child's tuition can never appear under the
 * other child's site.
 *
 *   charge.billable_source_type = 'customer'
 *     → a household, which has no site
 *
 * A registration or waitlist fee is incurred by a family before, across or outside any single
 * enrolment. It has no site provenance and is therefore ORG-SCOPED. It is not guessed into a site,
 * and it is not hidden either: it appears at org scope, labelled as what it is.
 *
 *   charge.billable_source_type = 'job'
 *     → the cleaning/services vertical, not childcare financial work at all
 *
 * Excluded from this workspace entirely rather than shown with an empty location.
 *
 * Pure. No I/O.
 */

/** How a piece of financial work is located — and it is a fact about provenance, not a preference. */
export type FinancialWorkLocationScope = "site" | "org";

export type FinancialWorkLocation = {
    scope: FinancialWorkLocationScope;
    /** The owning site, present only when the scope is `site`. */
    siteLocationId: string | null;
    /** Why it resolved this way, so a row can explain itself to an operator. */
    provenance: "enrollment_agreement" | "household_account";
};

/**
 * Resolve one charge's location from its billable source.
 *
 * `agreementSiteLocationId` must come from the charge's OWN agreement — not from the household, and
 * not from any other child. Passing a household-level site here would reintroduce exactly the guess
 * this contract exists to prevent.
 */
export function resolveFinancialWorkLocation(args: {
    billableSourceType: string | null;
    agreementSiteLocationId: string | null;
}): FinancialWorkLocation | null {
    if (args.billableSourceType === "enrollment_agreement") {
        // A missing site on an enrolment is not an org-scoped charge — it is a broken agreement, and
        // resolving it to "everywhere" would quietly widen who can act on the family's money.
        if (!args.agreementSiteLocationId) return null;
        return { scope: "site", siteLocationId: args.agreementSiteLocationId, provenance: "enrollment_agreement" };
    }
    if (args.billableSourceType === "customer") {
        return { scope: "org", siteLocationId: null, provenance: "household_account" };
    }
    return null;
}

/**
 * Is this work visible to an operator with these site rights, under this site filter?
 *
 * Two rules, and the second is the one worth stating out loud.
 *
 * SITE-SCOPED WORK is visible when the operator holds the site and the active filter admits it.
 *
 * ORG-SCOPED WORK — a household fee belonging to no site — is visible only at org scope, and only to
 * an operator whose rights are org-wide. A site-restricted operator's authority is bounded to the
 * sites they hold, and a charge that belongs to no site is not inside any of them. Showing it to
 * them would be widening their reach on the grounds that the row was hard to place; hiding it under
 * a site heading would be a lie about where it belongs. It appears where it actually lives.
 */
export function isFinancialWorkVisible(args: {
    location: FinancialWorkLocation;
    /** The operator's own rights: "all", or the sites they hold. */
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
    /** The site the operator has selected, or null for org scope. */
    activeSiteLocationId: string | null;
}): boolean {
    const { location, siteScope, allowedSiteLocationIds, activeSiteLocationId } = args;

    if (location.scope === "org") {
        if (activeSiteLocationId) return false;
        return siteScope === "all";
    }

    const site = location.siteLocationId as string;
    if (siteScope === "restricted" && !allowedSiteLocationIds.includes(site)) return false;
    if (activeSiteLocationId && activeSiteLocationId !== site) return false;
    return true;
}
