/**
 * Which site owns a piece of financial work — and what the workspace refuses to guess.
 *
 * Most financial tables carry no location, and every convenient fix is a lie of a different kind:
 * denormalising a site for the filter's benefit, inferring one from whichever child is easiest to
 * find, or showing org-wide rows under a site heading. These cases hold the honest line.
 */
import { describe, expect, it } from "vitest";

import {
    isFinancialWorkVisible,
    resolveFinancialWorkLocation,
} from "@/lib/financials/workspace/financialWorkLocation";

const SITE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SITE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("resolveFinancialWorkLocation", () => {
    it("locates an enrolment-backed charge at its own agreement's site", () => {
        const location = resolveFinancialWorkLocation({
            billableSourceType: "enrollment_agreement",
            agreementSiteLocationId: SITE_A,
        });
        expect(location).toEqual({ scope: "site", siteLocationId: SITE_A, provenance: "enrollment_agreement" });
    });

    it("treats a household charge as org-scoped rather than guessing a site for it", () => {
        // A registration or waitlist fee is incurred before, across or outside any one enrolment.
        const location = resolveFinancialWorkLocation({
            billableSourceType: "customer",
            agreementSiteLocationId: null,
        });
        expect(location).toEqual({ scope: "org", siteLocationId: null, provenance: "household_account" });
    });

    it("withholds an enrolment charge whose agreement names no site, rather than widening it to the org", () => {
        // A missing site is a broken agreement, not an org-wide charge. Resolving it to "everywhere"
        // would quietly widen who can act on a family's money.
        expect(
            resolveFinancialWorkLocation({ billableSourceType: "enrollment_agreement", agreementSiteLocationId: null }),
        ).toBeNull();
    });

    it("excludes the job vertical entirely", () => {
        expect(resolveFinancialWorkLocation({ billableSourceType: "job", agreementSiteLocationId: SITE_A })).toBeNull();
        expect(resolveFinancialWorkLocation({ billableSourceType: null, agreementSiteLocationId: SITE_A })).toBeNull();
    });
});

describe("isFinancialWorkVisible", () => {
    const siteWork = { scope: "site" as const, siteLocationId: SITE_A, provenance: "enrollment_agreement" as const };
    const otherSiteWork = { scope: "site" as const, siteLocationId: SITE_B, provenance: "enrollment_agreement" as const };
    const orgWork = { scope: "org" as const, siteLocationId: null, provenance: "household_account" as const };

    it("shows an org-wide operator everything at org scope", () => {
        for (const location of [siteWork, otherSiteWork, orgWork]) {
            expect(
                isFinancialWorkVisible({ location, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null }),
            ).toBe(true);
        }
    });

    it("narrows to the selected site, and org-scoped work is not shown under a site heading", () => {
        expect(isFinancialWorkVisible({ location: siteWork, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: SITE_A })).toBe(true);
        expect(isFinancialWorkVisible({ location: otherSiteWork, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: SITE_A })).toBe(false);
        // The honest one: a household fee belongs to no site, so it does not appear inside one.
        expect(isFinancialWorkVisible({ location: orgWork, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: SITE_A })).toBe(false);
    });

    it("refuses a restricted operator another site's work, even with no filter selected", () => {
        expect(
            isFinancialWorkVisible({ location: otherSiteWork, siteScope: "restricted", allowedSiteLocationIds: [SITE_A], activeSiteLocationId: null }),
        ).toBe(false);
        expect(
            isFinancialWorkVisible({ location: siteWork, siteScope: "restricted", allowedSiteLocationIds: [SITE_A], activeSiteLocationId: null }),
        ).toBe(true);
    });

    it("refuses a restricted operator another site's work even when they ask for it directly", () => {
        // The filter narrows; it never widens.
        expect(
            isFinancialWorkVisible({ location: otherSiteWork, siteScope: "restricted", allowedSiteLocationIds: [SITE_A], activeSiteLocationId: SITE_B }),
        ).toBe(false);
    });

    /*
     * THE DELIBERATE CHOICE, stated as a test so it cannot drift into an accident.
     *
     * Work belonging to NO site is not inside any site a restricted operator holds. Showing it to
     * them would widen their reach on the grounds that the row was hard to place; hiding it from
     * everyone would lose it. It appears at org scope, to operators whose rights are org-wide.
     */
    it("keeps org-scoped work out of a site-restricted operator's queue", () => {
        expect(
            isFinancialWorkVisible({ location: orgWork, siteScope: "restricted", allowedSiteLocationIds: [SITE_A], activeSiteLocationId: null }),
        ).toBe(false);
        expect(
            isFinancialWorkVisible({ location: orgWork, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null }),
        ).toBe(true);
    });

    it("divides a multi-site household per charge, so one child's work never appears under the other's site", () => {
        // Each charge carries its own agreement, and `site_location_id` is NOT NULL — so this holds
        // by construction rather than by a rule the queue has to remember to apply.
        const childAtA = resolveFinancialWorkLocation({ billableSourceType: "enrollment_agreement", agreementSiteLocationId: SITE_A })!;
        const childAtB = resolveFinancialWorkLocation({ billableSourceType: "enrollment_agreement", agreementSiteLocationId: SITE_B })!;
        expect(isFinancialWorkVisible({ location: childAtA, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: SITE_A })).toBe(true);
        expect(isFinancialWorkVisible({ location: childAtB, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: SITE_A })).toBe(false);
        expect(isFinancialWorkVisible({ location: childAtB, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: SITE_B })).toBe(true);
    });
});
