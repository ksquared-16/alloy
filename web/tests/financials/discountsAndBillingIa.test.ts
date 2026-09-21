/**
 * 11C slice 3 — the family discount position and the Billing IA, locked at their effects.
 *
 * The rule these all serve: there is ONE discount authority and ONE period authority, and a
 * surface that answers either question itself is a second opinion that will drift from the money.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { previewBillingPeriods } from "@/lib/financials/tuitionPlans/billingPeriodPreview";

const ROOT = join(__dirname, "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FAMILY_ROUTE = "app/api/admin/financials/family-discount-position/route.ts";
const ASSIGNMENT_ROUTE = "app/api/admin/financials/reduction-forecast/route.ts";
const READER = "lib/financials/reductions/readAssignmentDiscountPosition.ts";
const PANEL = "components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel.tsx";

describe("the family discount position uses the canonical forecast, and only it", () => {
    it("both grains go through ONE reader", () => {
        expect(code(ASSIGNMENT_ROUTE)).toContain("readAssignmentDiscountPosition");
        expect(code(FAMILY_ROUTE)).toContain("readAssignmentDiscountPosition");
        /* And the reader is the only thing that calls the forecast authority. */
        expect(code(READER)).toContain("forecastAssignmentReductions");
        expect(code(FAMILY_ROUTE)).not.toContain("forecastAssignmentReductions(");
        expect(code(ASSIGNMENT_ROUTE)).not.toContain("forecastAssignmentReductions(");
    });

    it("the family route resolves no eligibility and derives no rate of its own", () => {
        const family = code(FAMILY_ROUTE);
        /*
         * THE DEFECT THIS FORBIDS: a family surface that multiplies a policy rate by a gross to
         * show "10% of $1,450". That figure would not know about exceptions, effective windows or
         * category scoping, and would disagree with the applied truth the moment any changed.
         */
        expect(family).not.toMatch(/percent|basisPoints|\*\s*0\.1|\/\s*100\b/);
        expect(family).not.toMatch(/reduce\(\s*\(?\w+,\s*\w+\)?\s*=>\s*\w+\s*\+/);
    });

    it("carries the forecast's own amounts through untouched", () => {
        expect(code(FAMILY_ROUTE)).toContain("expectedCents: outcome.amountCents");
    });

    it("says why a relationship expects nothing, rather than showing silence", () => {
        const family = code(FAMILY_ROUTE);
        expect(family).toContain("notExpected");
        expect(family).toContain("withoutForecast");
    });

    it("no parallel discount writer is introduced", () => {
        for (const forbidden of ["family_discount_settings", "child_discount_settings", "discountEnabled"]) {
            expect(code(FAMILY_ROUTE)).not.toContain(forbidden);
        }
    });
});

describe("the billing period preview is the period authority, not prose", () => {
    it("derives from billingPeriodFor rather than describing intervals", () => {
        const preview = code("lib/financials/tuitionPlans/billingPeriodPreview.ts");
        expect(preview).toContain("billingPeriodFor");
        expect(preview).toContain("isPeriodBillableCadence");
        /* No hand-written interval sentences that could outlive the derivation. */
        expect(preview).not.toMatch(/"7-day|"Every 7 days"|"calendar month"/);
    });

    it("weekly produces a 7-day interval anchored to the agreement, not a calendar week", () => {
        /*
         * THE PLANT THIS CATCHES: a preview that snapped to Monday–Sunday. The anchor is the
         * agreement's start, so a 3rd-of-the-month anchor yields the 3rd–9th, not the week's Monday.
         */
        const p = previewBillingPeriods({ cadenceKey: "weekly", anchorYmd: "2026-09-03", todayYmd: "2026-09-05" });
        expect(p.billable).toBe(true);
        expect(p.current?.start).toBe("2026-09-03");
        expect(p.current?.end).toBe("2026-09-09");
        expect(p.next?.start).toBe("2026-09-10");
    });

    it("monthly produces the calendar month", () => {
        const p = previewBillingPeriods({ cadenceKey: "monthly", anchorYmd: "2026-09-01", todayYmd: "2026-09-18" });
        expect(p.current?.start).toBe("2026-09-01");
        expect(p.current?.end).toBe("2026-09-30");
        expect(p.next?.start).toBe("2026-10-01");
    });

    it("an unsupported cadence cannot masquerade as billable", () => {
        /*
         * Semi-Annual is authored and active in this tenant and the platform derives no periods for
         * it. It must not receive an invented six-month interval: configuration and generation give
         * the operator the same answer, and generation refuses.
         */
        const p = previewBillingPeriods({ cadenceKey: "semi_annual", anchorYmd: "2026-01-01", todayYmd: "2026-09-18" });
        expect(p.billable).toBe(false);
        expect(p.current).toBeNull();
        expect(p.next).toBeNull();
        expect(p.recurrence).toMatch(/no recurring periods/i);
    });

    it("the panel shows the derived period and marks an unsupported cadence honestly", () => {
        const panel = code(PANEL);
        expect(panel).toContain("previewBillingPeriods");
        expect(panel).toContain("data-billing-period-preview-billable");
        expect(panel).toContain("No billing periods");
        /* And it does not do its own date arithmetic to get there. */
        expect(panel).not.toMatch(/setDate\(|addDays\(|\+ 7 \* 24/);
    });
});

describe("Billing Period stays distinct from Accounting Period", () => {
    it("the preview never speaks of accounting attribution", () => {
        const preview = src("lib/financials/tuitionPlans/billingPeriodPreview.ts");
        expect(preview).not.toMatch(/accounting[_ ]?period/i);
        expect(code(PANEL)).not.toMatch(/accounting[_ ]?period/i);
    });
});
