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
        /*
         * The sentences live in the SHARED vocabulary now, not in this surface. When each surface
         * kept its own, "Excluded — an exception applies to this relationship" and Assignment's
         * "Excluded for this assignment" were two spellings of one fact. The rule is asserted
         * where the words are.
         */
        const vocab = code("lib/financials/reductions/reductionReasonLabels.ts");
        expect(vocab).toMatch(/excluded_by_exception: "Excluded/);
        expect(vocab).toMatch(/no_policy_configured: "No discount policies configured"/);
        expect(panel, "and this surface keeps no private vocabulary").not.toMatch(/function reasonSentence/);
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

describe("the policy summary answers all five questions before selection", () => {
    const PAGE = "components/adminV2/settings/financials/policies/PoliciesConfigurationPage.tsx";

    it("states name, what it does, rate, active and scope in the row", () => {
        /*
         * §3's five facts. Four were already there; SCOPE was computed only for the SELECTED
         * policy, so "what does it apply to?" could not be answered before opening one.
         */
        const page = code(PAGE);
        const rowStart = page.indexOf("visible.map((row)");
        const row = page.slice(rowStart, page.indexOf("</aside>", rowStart));
        expect(row).toContain("policyTypeLabel(row.policy_type)");
        expect(row).toContain("commercialPolicyValueSummary(");
        expect(row).toMatch(/row\.is_active \? "Active"/);
        expect(row, "scope is stated before selection").toContain("scopeLabelFor(row)");
        expect(row).toContain("row.effective_start");
    });

    it("the rate is not hidden behind a secondary tab, or behind a dead guard", () => {
        /*
         * THIS LOCK DID NOT BIND AT FIRST, and the plant proved it: asserting only that the row
         * CONTAINS `commercialPolicyValueSummary(` stayed green when the call was disabled as
         * `false && commercialPolicyValueSummary(...)`. The string survived; the rate did not.
         *
         * So the rule is asserted as RENDERED: the call is there, and nothing in the row makes it
         * unreachable. A literal-false guard has no legitimate use in a summary row.
         */
        const page = code(PAGE);
        const rowStart = page.indexOf("visible.map((row)");
        const row = page.slice(rowStart, page.indexOf("</aside>", rowStart));
        expect(row, "the economic effect is in the summary itself").toContain("commercialPolicyValueSummary");
        expect(row, "and is not switched off").not.toMatch(/false\s*&&/);
        expect(row, "nor rendered only when some tab is open").not.toMatch(/tab\s*===\s*["'`]rules["'`][\s\S]{0,120}commercialPolicyValueSummary/);
    });

    it("there is ONE scope derivation and one value formatter", () => {
        const page = code(PAGE);
        /*
         * The detail reuses the row's derivation rather than keeping a private copy. Counting raw
         * `SCOPE_LABEL[` reads was too blunt: the detail also renders the scope TYPE ("Program"),
         * which is a different fact from the scope LABEL ("Preschool") and legitimately reads the
         * same dictionary. What must not exist twice is the DERIVATION.
         */
        expect(page).toContain("scopeLabelFor(selected)");
        expect(page).toContain("scopeLabelFor(row)");
        expect((page.match(/const scopeLabelFor/g) ?? []).length, "one derivation").toBe(1);
        expect(page, "and no second inline scope resolution").not.toMatch(
            /scope_type === "program"[\s\S]{0,400}scope_type === "program"/,
        );
        /* And the value comes from the canonical helper, never recomputed here. */
        expect(page).not.toMatch(/value\.percent|basis_points\s*\/\s*100/);
    });
});

describe("billing authoring states what the name decides", () => {
    const PANEL = "components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel.tsx";

    it("no field is required that the recurrence authority ignores", () => {
        /*
         * AUDITED: the form has three fields — Name (required), Description and Interval label
         * (both optional, both display-only). Only Name is required, and it is the one field the
         * authority actually consumes, because it becomes the cadence key. There is no
         * required-but-ignored field to remove.
         */
        const panel = code(PANEL);
        expect(panel).toMatch(/disabled=\{busy \|\| !name\.trim\(\)\}/);
        expect(panel, "description is not required").not.toMatch(/!description\.trim\(\)/);
        expect(panel, "interval label is not required").not.toMatch(/!intervalLabel\.trim\(\)/);
    });

    it("the consequence of the name is shown while it is typed, from the authority", () => {
        /*
         * The name BECOMES the cadence key, and the key decides whether periods can be derived at
         * all. An operator typing "Semi-Annual" was creating a non-billable frequency and learning
         * it only after saving.
         */
        const panel = code(PANEL);
        expect(panel).toContain('data-testid="billing-frequency-consequence"');
        expect(panel).toContain("billingFrequencyItemKeyFromLabel(name)");
        expect(panel).toContain("billingRecurrenceFor(cadenceKey)");
        expect(panel).toContain("data-billing-frequency-billable");
    });

    it("the consequence is derived, not described", () => {
        const panel = code(PANEL);
        /* No second cadence map in the component. */
        /* `[\s\S]` rather than the dotAll flag: the tsconfig target predates it. */
        expect(panel).not.toMatch(/weekly[\s\S]{0,40}7 days|monthly[\s\S]{0,40}calendar month/i);
    });
});

describe("one recurring model, three stages", () => {
    /*
     * CONFIGURE defines recurrence, ACCEPT binds a cadence to a relationship, EXECUTE asks which
     * periods to process. These are three views of ONE model, and the defect they exist to prevent
     * is three implementations of it — a configuration screen describing weekly in prose, an
     * Assignment adding seven days itself, and generation carrying its own cadence map. They would
     * agree on the fixture and diverge on a leap year, a mid-period start, or a cadence nobody
     * tested.
     */
    const AUTHORITY = "lib/financials/billingPeriod.ts";
    const CONFIGURE = "lib/financials/tuitionPlans/billingPeriodPreview.ts";
    const CONFIGURE_UI = "components/adminV2/settings/financials/tuitionPlans/TuitionBillingFrequenciesPanel.tsx";
    const ACCEPT = "components/admin/focusPanel/cards/SchedulingCard.tsx";
    const EXECUTE = "lib/financials/tuitionGeneration/generateTuitionCharges.ts";
    const EXECUTE_PREVIEW = "lib/financials/tuitionGeneration/previewTuitionGeneration.ts";

    it("every stage derives from the same authority", () => {
        expect(code(CONFIGURE)).toContain("billingPeriodFor");
        expect(code(ACCEPT)).toContain("acceptedTermBillingPeriods");
        expect(code(EXECUTE)).toContain("billingPeriodsBetween");
        /* And that authority derives Current/Next through the same function the preview uses. */
        const authority = code(AUTHORITY);
        expect(authority).toMatch(/acceptedTermBillingPeriods[\s\S]{0,900}billingPeriodFor\(cadence, anchor/);
    });

    it("every stage refuses an underivable cadence through the same gate", () => {
        for (const rel of [CONFIGURE, EXECUTE, EXECUTE_PREVIEW, "lib/financials/billingPeriod.ts"]) {
            expect(code(rel), `${rel} asks the billability authority`).toContain("isPeriodBillableCadence");
        }
    });

    it("no stage carries a second cadence map", () => {
        for (const rel of [CONFIGURE, CONFIGURE_UI, ACCEPT, EXECUTE]) {
            const s = code(rel);
            expect(s, `${rel} must not restate cadence strides`).not.toMatch(
                /weekly["']?\s*:\s*7|biweekly["']?\s*:\s*14|monthly["']?\s*:\s*30/,
            );
        }
    });

    it("Assignment performs no local period arithmetic", () => {
        const accept = code(ACCEPT);
        expect(accept).not.toMatch(/setDate\(|getTime\(\)\s*[+-]|\* 24 \* 60 \* 60|addDays\(/);
    });

    it("the cadence identity flows, rather than being matched by name", () => {
        /* Configuration's itemKey IS the cadence key the other stages consume. */
        expect(code(CONFIGURE_UI)).toContain("cadenceKey: row.itemKey");
        expect(code(EXECUTE)).toMatch(/const cadenceKey = \(args\.cadenceKey/);
        expect(code(ACCEPT), "Assignment passes the accepted term's own cadence")
            .toMatch(/cadenceKey/);
    });

    it("Billing Period never becomes Accounting Period", () => {
        for (const rel of [CONFIGURE, CONFIGURE_UI]) {
            expect(code(rel), `${rel} must not relabel the commercial period as accounting`)
                .not.toMatch(/accounting[_ ]?period/i);
        }
        /* And the accounting authority stays its own concept. */
        expect(code("lib/financials/accountingPeriod.ts")).not.toContain("billingRecurrenceFor");
    });
});


describe("family and Assignment speak one discount vocabulary", () => {
    const VOCAB = "lib/financials/reductions/reductionReasonLabels.ts";
    it("both surfaces read the same map", () => {
        for (const rel of [
            "app/adminV2/financials/FinancialsDiscountPanel.tsx",
            "components/admin/focusPanel/cards/SchedulingCard.tsx",
        ]) {
            expect(code(rel), `${rel} uses the shared vocabulary`).toContain("reductionReasonLabels");
        }
    });

    it("neither keeps a private reason map", () => {
        for (const rel of [
            "app/adminV2/financials/FinancialsDiscountPanel.tsx",
            "components/admin/focusPanel/cards/SchedulingCard.tsx",
        ]) {
            const s = code(rel);
            expect(s, `${rel} must not redefine the reasons`)
                .not.toMatch(/const \w*REASON\w*: Record<string, string> = \{/);
        }
    });

    it("an unmapped reason is spelled out rather than hidden", () => {
        expect(code(VOCAB)).toContain('reason.replace(/_/g, " ")');
    });
});

describe("the family position states a basis where the basis belongs", () => {
    const PANEL = "app/adminV2/financials/FinancialsDiscountPanel.tsx";
    const ROUTE = "app/api/admin/financials/family-discount-position/route.ts";

    it("the derivation is carried per relationship, not per policy", () => {
        /*
         * MEASURED on deployed 76a8f3fc8: the position rendered
         *   "discount · discount · 10% of $185.00"
         * for a policy affecting two children whose bases are $185.00 and $1,450.00. Two defects in
         * one line — the forecast's explanation already leads with the policy kind, so the label was
         * printed twice; and one child's basis was stated as though it were the policy's.
         */
        expect(code(ROUTE)).toContain("explanation: outcome.explanation");
        const panel = code(PANEL);
        expect(panel, "the subject line carries its own explanation").toMatch(
            /Expected \{money\(Math\.abs\(s\.expectedCents\), s\.currencyCode\)\}[\s\S]{0,200}s\.explanation/,
        );
    });

    it("the policy header is the name, not the name plus an echo of it", () => {
        const panel = code(PANEL);
        expect(panel, "no policy-level explanation beside the label")
            .not.toMatch(/\{p\.label\}[\s\S]{0,120}p\.explanation/);
    });
});

describe("one policy identity has one operator-facing name", () => {
    const PROJECTION = "lib/commercial/execution/export/readCommercialConfig.ts";
    const FORECAST = "lib/financials/reductions/forecastAssignmentReductions.ts";
    const READER = "lib/financials/reductions/readAssignmentDiscountPosition.ts";
    const DEF = "lib/commercial/execution/commercialExport.ts";

    it("the canonical projection carries the configured name", () => {
        /*
         * D3, ROOT CAUSE — classification A, READ PROJECTION OMISSION. `commercial_policies.label`
         * is where an operator's name for a policy lives. The Organization API selected it; this
         * projection did not, so every consumer downstream fell back to the policy KIND and one
         * policy wore two names: "Sibling discount (QA specimen)" in configuration and "discount"
         * on the family's own finances.
         */
        /*
         * SCOPED TO `readPolicies`. Asserted against the whole file this did NOT bind: the module
         * holds eleven `select(` calls and the regex happily matched `label` in a different one,
         * so removing it from the policy projection left every test green. A verified plant caught
         * it. Presence-style assertions over a whole file are the weakest kind of lock, and this
         * is the third one this slice.
         */
        const projection = code(PROJECTION);
        const at = projection.indexOf("export async function readPolicies");
        expect(at, "readPolicies exists").toBeGreaterThan(-1);
        const body = projection.slice(at, projection.indexOf("\nexport ", at + 10));
        expect(body, "label is selected by THIS projection").toMatch(/select\([^)]*\blabel\b/);
        expect(body, "and carried on the projection").toContain("label: nstr(r.label)");
        expect(code(DEF), "the type admits it").toMatch(/label: string \| null/);
    });

    it("every consumer prefers the configured name over the kind", () => {
        /*
         * The kind is a LAST resort, not the usual answer. A consumer that reaches for it while a
         * configured name exists is the defect, wherever it sits.
         */
        for (const rel of [FORECAST, READER]) {
            expect(code(rel), `${rel} prefers the configured name`).toMatch(
                /p\.label \?\?[\s\S]{0,80}\?\? p\.kind/,
            );
        }
    });

    it("no consumer performs a second policy lookup or a display-text join", () => {
        /*
         * The architecture is: configured identity -> canonical projection -> forecast outcome
         * carries identity AND name -> family and Assignment consume it. A component that fetched
         * the policy again to learn its name would be a second read of the same fact.
         */
        const panel = code("app/adminV2/financials/FinancialsDiscountPanel.tsx");
        expect(panel).not.toContain("commercial/policies");
        expect(panel, "the name arrives with the outcome").toContain("p.label");
        expect(panel, "and is never matched as text").not.toMatch(/label\s*===\s*["'`]/);
    });
});

describe("the policy name is stated once, not once per line", () => {
    const PANEL = "app/adminV2/financials/FinancialsDiscountPanel.tsx";

    it("the relationship line carries the basis without the name in front of it", () => {
        /*
         * MEASURED on deployed cfd4168b8, and only mounting showed it: two correct fixes
         * interacted. D2 moved the basis onto the relationship line; D3 gave the forecast's
         * explanation the policy's real name — and the explanation is built as
         * "<policy name> · <basis>", so the line read
         *   "Certa Certhouse · Expected $18.50 · Sibling discount (QA specimen) · 10% of $185.00"
         * with the name already sitting in the header above it.
         */
        const panel = code(PANEL);
        expect(panel).toContain("function basisWithoutPolicyName");
        expect(panel, "the raw explanation is never rendered beside the name")
            .not.toMatch(/·\s*\{s\.explanation\}/);
        expect(panel, "only an exact leading name is removed").toContain("explanation.startsWith(prefix)");
        expect(panel, "and nothing is recomputed").not.toMatch(/percent|basisPoints/);
    });
});

describe("one money format per line", () => {
    it("the forecast explanation formats currency the way the rest of admin does", () => {
        /*
         * MEASURED on deployed f160bb907: "Certb Certhouse · Expected $145.00 · Sibling discount
         * (QA specimen) · 10% of $1450.00". The amount and its basis sat on one line in two
         * conventions, because the surface formats through Intl and the explanation used
         * toFixed(2), which has no thousands separator.
         */
        const src = code("lib/financials/reductions/resolveFinancialReductions.ts");
        expect(src).toContain("formatMoneyFromCents");
        expect(src, "no hand-rolled currency in the explanation")
            .not.toMatch(/\$\$\{|\$\{\([^)]*\/ 100\)\.toFixed\(2\)\}/);
    });
});
