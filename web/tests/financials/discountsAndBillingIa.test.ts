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

describe("one primary action treatment across configuration", () => {
    const PRIMITIVES = "components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives.tsx";
    const CANONICAL = "components/adminV2/settings/configurationRuntime/ConfigurationModeLayout.tsx";

    it("the canonical configuration action is Bend Pine", () => {
        const canonical = code(CANONICAL);
        const at = canonical.indexOf("export function ConfigurationPrimaryButton");
        expect(at).toBeGreaterThan(-1);
        expect(canonical.slice(at, at + 800)).toContain("bg-alloy-bend-pine");
    });

    it("no second primary action treatment is hand-rolled beside it", () => {
        /*
         * MEASURED on deployed staging: "Create future version" on Policies painted
         * rgb(39, 63, 82) — alloy-pine, a dark navy — while eleven Bend Pine elements sat on the
         * same screen. The page was wearing two different answers to "this is the primary action",
         * which is what reads as "not Alloy" long before anyone can name the token.
         *
         * The rule is ACTION hierarchy, not colour policing: semantic status colours are untouched
         * and deliberately not asserted here.
         */
        const primitives = code(PRIMITIVES);
        const at = primitives.indexOf("export function ConfigPrimaryButton");
        expect(at).toBeGreaterThan(-1);
        const body = primitives.slice(at, at + 900);
        expect(body, "the navy primary is gone").not.toContain("bg-alloy-pine");
        expect(body, "and it defers to the canonical one").toContain("ConfigurationPrimaryButton");
    });

    it("status colour is still allowed to mean status", () => {
        /* The read-only badge is semantic, not an action, and must survive the convergence. */
        const designed = code("components/adminV2/settings/financials/DesignedConfigurationSurface.tsx");
        expect(designed).toMatch(/read_only[\s\S]{0,120}sky-/);
    });
});

describe("the family Discount position renders canonical truth and computes none of it", () => {
    const PANEL = "app/adminV2/financials/FinancialsDiscountPanel.tsx";
    const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
    const HOST = "components/admin/focusPanel/cards/FinancialsCard.tsx";

    it("reads the canonical family position and nothing else", () => {
        const panel = code(PANEL);
        expect(panel).toContain("/api/admin/financials/family-discount-position");
        /* One read. It does not also ask the assignment route and reconcile two answers. */
        expect(panel).not.toContain("reduction-forecast");
    });

    it("performs no percentage arithmetic of its own", () => {
        /*
         * THE DEFECT THIS FORBIDS: rendering "10% of $1,450" by multiplying in the component. That
         * figure would be blind to exceptions, effective windows and category scoping, and would
         * disagree with the applied ledger the moment any changed.
         */
        const panel = code(PANEL);
        expect(panel).not.toMatch(/percent|basisPoints|\*\s*0?\.\d|\/\s*100\s*\)?\s*\*/);
        /* Dividing by 100 to render cents as currency is formatting, and is the only such use. */
        expect((panel.match(/\/ 100/g) ?? []).length).toBeLessThanOrEqual(1);
    });

    it("carries the forecast's own expected amount", () => {
        expect(code(PANEL)).toContain("s.expectedCents");
    });

    it("uses the certified exception actions, and supplies no economics to them", () => {
        const panel = code(PANEL);
        expect(panel).toContain("billing.except_commercial_policy");
        expect(panel).toContain("billing.end_commercial_policy_exception");
        /* A reason and an identity. Never an amount, a rate, or a boolean. */
        expect(panel).not.toMatch(/discount_enabled|amount_cents|percent:/);
    });

    it("requires a reason before an exception can be confirmed", () => {
        /* An exception carries provenance or it is not one. */
        expect(code(PANEL)).toMatch(/disabled=\{busy \|\| draft\.reason\.trim\(\)\.length === 0\}/);
    });

    it("exception is not a toggle", () => {
        const panel = code(PANEL);
        expect(panel).not.toMatch(/type="checkbox"|role="switch"|<Toggle|onToggleDiscount/);
    });

    it("excluded never becomes absent", () => {
        /*
         * "No policy configured" and "a policy exists and this relationship is excluded" have
         * different remedies. An operator told the first goes to configuration to create something
         * that is already there.
         */
        const panel = code(PANEL);
        expect(panel).toContain("excluded_by_exception");
        expect(panel).toMatch(/Excluded — an exception applies/);
        expect(panel).toMatch(/No discount policy is configured/);
    });

    it("the depth card owns its own Escape and returns focus to the gear", () => {
        const panel = code(PANEL);
        expect(panel).toContain('data-financials-manage-discounts="depth-card"');
        expect(panel).toMatch(/e\.key !== "Escape"/);
        expect(panel).toContain("stopPropagation");
        expect(panel).toMatch(/gearRef\.current\?\.focus\(\)/);
    });

    it("sits in the administration region, not on the transaction row", () => {
        const detail = code(DETAIL);
        const discounts = detail.indexOf('data-financials-discounts="detail"');
        const methods = detail.indexOf('data-financials-payment-methods="detail"');
        expect(discounts).toBeGreaterThan(-1);
        /* Beside payer administration, below the command row — never inside it. */
        expect(methods).toBeGreaterThan(discounts);
        expect(detail).not.toMatch(/ActionRow[\s\S]{0,200}FinancialsDiscountPanel/);
    });

    it("the host supplies the canonical re-read, not optimistic state", () => {
        const host = code(HOST);
        expect(host).toMatch(/discountAdmin=\{[\s\S]{0,700}await load\(\)/);
    });
});

describe("one policy identity across every surface", () => {
    /*
     * A policy is the same policy because its ID is the same, never because two screens render the
     * same words. Display text is a label an operator can change; matching on it would silently
     * pair unrelated policies and, worse, would look right on the QA fixture where only one
     * discount exists.
     */
    const SURFACES: [string, string][] = [
        ["family position", "app/adminV2/financials/FinancialsDiscountPanel.tsx"],
        ["family read", "app/api/admin/financials/family-discount-position/route.ts"],
        ["assignment", "components/admin/focusPanel/cards/SchedulingCard.tsx"],
        ["ledger provenance", "lib/financials/reductions/reductionProvenance.ts"],
    ];

    it.each(SURFACES)("%s carries the policy id", (_name, rel) => {
        expect(code(rel)).toMatch(/policyId|commercialPolicyId/);
    });

    it("the exception is scoped by policy id, not by label", () => {
        const panel = code("app/adminV2/financials/FinancialsDiscountPanel.tsx");
        expect(panel).toContain("commercial_policy_id: args.policyId");
        /* Never keyed by the rendered name. */
        expect(panel).not.toMatch(/commercial_policy_(id|label):\s*\w*[Ll]abel/);
    });

    it("no surface pairs policies by matching display text", () => {
        for (const [, rel] of SURFACES) {
            const s = code(rel);
            expect(s, `${rel} must not compare labels to identify a policy`)
                .not.toMatch(/policyLabel\s*===\s*\w*[Ll]abel|label\s*===\s*policy/);
        }
    });

    it("the family position groups by id, and the label is only carried along", () => {
        const route = code("app/api/admin/financials/family-discount-position/route.ts");
        expect(route).toContain("byPolicy.get(outcome.policyId)");
        expect(route).toContain("byPolicy.set(outcome.policyId");
    });
});

describe("no automatic-execution claim outruns the scheduler", () => {
    it("no Financials surface promises automatic billing", () => {
        /*
         * MEASURED on this candidate: no billing handler is wired to Governed Scheduled Work, and
         * no Financials surface claims automatic execution. The distinction the product must keep
         * is Recurring Billing Engine (configured recurrence, executed on request) from Automatic
         * Periodic Billing Execution (a scheduler firing it), and today only the first is true.
         */
        const surfaces = [
            "components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel.tsx",
            "app/adminV2/financials/FinancialsDiscountPanel.tsx",
            "lib/financials/tuitionPlans/billingPeriodPreview.ts",
        ];
        for (const rel of surfaces) {
            expect(src(rel), `${rel} must not claim automatic execution`)
                .not.toMatch(/automatically bill|bills automatically|runs automatically|next automatic|scheduled billing/i);
        }
    });
});
