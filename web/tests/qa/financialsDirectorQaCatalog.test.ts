/**
 * THE CATALOG IS THE ACCEPTANCE PROGRAM, SO ITS INTEGRITY IS NOT A MATTER OF CARE.
 *
 * Results are persisted against scenario KEYS and read back across deployments. A duplicated key
 * silently merges two scenarios' results; a precondition naming a scenario that does not exist
 * blocks a Director forever with no way to satisfy it; a non-walkthrough disposition with no stated
 * reason is exactly the silent omission this catalog exists to prevent.
 */
import { describe, expect, it } from "vitest";
import {
    CATALOG_VERSION,
    CORE_DEFERRALS,
    SCENARIOS,
    SCENARIO_PROGRAM,
    WALKTHROUGH_SCENARIOS,
    scenarioByKey,
    MONEY_INVARIANTS,
} from "@/lib/qa/financialsDirectorQa/scenarioCatalog";

describe("the Director QA scenario catalog", () => {
    it("has unique, stable keys", () => {
        const keys = SCENARIOS.map((s) => s.key);
        expect(new Set(keys).size, `duplicate scenario key: ${keys.join(", ")}`).toBe(keys.length);
        for (const k of keys) expect(k, "keys are snake_case and stable").toMatch(/^[a-z][a-z0-9_]*$/);
    });

    it("has a unique display order", () => {
        const orders = SCENARIOS.map((s) => s.order);
        expect(new Set(orders).size).toBe(orders.length);
    });

    /** NO SILENT OMISSIONS. Anything not walked through must say why, in words a human can weigh. */
    it("states a reason for every capability it does not walk through", () => {
        for (const s of SCENARIOS) {
            if (s.disposition === "HUMAN_WALKTHROUGH") continue;
            expect(s.dispositionReason ?? "", `${s.key} (${s.disposition}) must say why`).not.toBe("");
            expect((s.dispositionReason ?? "").length, `${s.key} reason is too thin to weigh`).toBeGreaterThan(40);
        }
    });

    it("never leaves a precondition pointing at a scenario that does not exist", () => {
        for (const s of SCENARIOS) {
            for (const req of s.requires) {
                if (req.kind !== "scenario_passed") continue;
                expect(scenarioByKey(req.scenarioKey), `${s.key} requires missing scenario ${req.scenarioKey}`).toBeTruthy();
                const other = scenarioByKey(req.scenarioKey)!;
                // A dependency must come EARLIER, or the Director can never satisfy it in order.
                expect(other.order, `${s.key} depends on ${other.key}, which comes later`).toBeLessThan(s.order);
            }
        }
    });

    it("gives every walkthrough scenario something to do and something to check", () => {
        for (const s of WALKTHROUGH_SCENARIOS) {
            expect(s.navigate.length, `${s.key} must say where to go`).toBeGreaterThan(0);
            expect(s.doThis.length, `${s.key} must say what to do`).toBeGreaterThan(0);
            expect(s.failSymptoms.length, `${s.key} must say what failure looks like`).toBeGreaterThan(0);
            expect(s.purpose.length, `${s.key} needs a plain-language purpose`).toBeGreaterThan(20);
            expect(s.whyItMatters.length, `${s.key} needs business meaning`).toBeGreaterThan(60);
            /*
             * WHAT MUST NOT CHANGE IS WHERE THE DEFECTS HIDE. A scenario that only says what should
             * happen cannot catch a step that also did something it should not have.
             */
            expect(
                s.expectChanges.length + s.expectUnchanged.length,
                `${s.key} must state an expectation`,
            ).toBeGreaterThan(0);
            expect(Object.values(MONEY_INVARIANTS)).toContain(s.invariant);
        }
    });

    /** The capabilities the mission requires an explicit disposition for. None may be missing. */
    it("dispositions every capability the acceptance program names", () => {
        const required = [
            "financial_subject", "add_charge_honours_review_boundary", "draft_moves_nothing", "post_charge",
            "charge_detail_attribution", "manage_responsibility", "responsibility_supersession",
            "expected_funding", "expected_funding_correction", "adjustment_draft", "adjustment_post",
            "reduction_zero_bound", "reverse_adjustment", "payment_receipt", "apply_payment",
            "partial_unapplied", "move_payment", "failed_reapply_recovery", "refund", "reverse_charge",
            "cross_surface_consistency", "reload_switch_viewport", "overview_smoke", "subsidy_exclusion",
            "tuition_chain", "discount_vs_adjustment", "multi_child_attribution",
            "card_collection", "ach_processing", "provider_return", "subsidy_processing",
        ];
        for (const key of required) {
            expect(scenarioByKey(key), `no disposition for ${key}`).toBeTruthy();
        }
    });

    /*
     * ── THE INSPECTION HALF IS PRODUCTIZED; THE LIFECYCLE HALF IS NOT ─────────────────────────
     *
     * This scenario carried MISSING_PRODUCTIZATION while the accounting period was enforced by the
     * database and visible to nobody. Pass 5F built the read surface — an Accounting calendar panel
     * with each period's dates and open/closed status, and the attributed period on a charge's own
     * detail — so a human can now accept what they can see, and the scenario became a walkthrough.
     *
     * What did NOT change is the honesty requirement, and the lock now guards the harder version of
     * it: the scenario must still refuse a database query as evidence, and must still RECORD that
     * opening and closing a period has no governed action. A walkthrough that quietly dropped the
     * limit would read as full acceptance of a half-built capability.
     */
    it("walks the accounting period through the product and still records what is missing", () => {
        const s = scenarioByKey("accounting_period")!;
        expect(s.disposition).toBe("HUMAN_WALKTHROUGH");
        expect(s.navigate.length, "there is somewhere to navigate to now").toBeGreaterThan(0);
        expect(s.navigate.join(" "), "the calendar surface is named").toMatch(/Accounting/i);
        expect(
            s.doThis.join(" "),
            "a database query must still be refused as evidence, in the scenario itself",
        ).toMatch(/database/i);
        /*
         * ── THE DOCTRINE MOVED, AND THIS IS WHAT REPLACED IT ─────────────────────────────────
         *
         * This lock previously required the scenario to RECORD that opening and closing a period
         * had no governed action. That was the honest limit for as long as it was true. Financials
         * 11B built the lifecycle half — `billing.adopt_accounting_calendar` and
         * `billing.close_accounting_period`, both behind `fin.write` — so the old assertion now
         * requires the catalog to tell a tester a falsehood.
         *
         * What the lock protects is unchanged: a walkthrough must WALK what exists and RECORD what
         * does not, and must never accept a database query as evidence. So the honesty requirement
         * moves to the limit that is still real — a closed period cannot be reopened — and the
         * capability that now exists must actually be walked, preview included.
         */
        expect(
            s.doThis.join(" "),
            "the lifecycle that now exists must be walked, not described",
        ).toMatch(/close the earliest open period/i);
        expect(
            s.doThis.join(" "),
            "closing states what it will do before it does it",
        ).toMatch(/preview/i);
        expect(
            s.doThis.join(" "),
            "and the limit that is still real is recorded rather than worked around",
        ).toMatch(/cannot be REOPENED/i);
        expect(
            s.doThis.join(" "),
            "a closed period defers rather than refusing, and the tester is asked to see it",
        ).toMatch(/defers/i);
        expect(s.dispositionReason, "the reason names both halves and what is still missing").toMatch(/Reopening is NOT supported/i);

        /* The two periods must never collapse into one scenario or one disposition. */
        expect(scenarioByKey("billing_period")!.disposition).toBe("HUMAN_WALKTHROUGH");
        expect(
            s.failSymptoms.join(" "),
            "and conflating them is itself a failure the tester is told to look for",
        ).toMatch(/one field|label for the other/i);
    });

    it("keeps subsidy PROCESSING out of scope while Expected Funding stays Core", () => {
        expect(scenarioByKey("subsidy_processing")!.disposition).toBe("OUT_OF_SCOPE_THREAD_11A");
        expect(scenarioByKey("expected_funding")!.disposition).toBe("HUMAN_WALKTHROUGH");
    });

    /** The provider trio is deferred on ENVIRONMENT, not waved away — the reason must say so. */
    it("defers the provider scenarios on stated environment evidence", () => {
        for (const key of ["card_collection", "ach_processing", "provider_return"]) {
            const s = scenarioByKey(key)!;
            expect(s.disposition).toBe("EXPLICITLY_DEFERRED");
            /*
             * The reason must cite what the environment actually SAYS, in whatever vocabulary the
             * account reader currently uses. It used to cite `paymentSetup: null` — a hardcoded
             * constant — which was accurate about the field and wrong about the world; the reader
             * now derives capability states, so the evidence is the merchant and the capability.
             */
            expect(s.dispositionReason).toMatch(
                /takePaymentCard|takePaymentAch|achAvailable|merchant|provider configuration/i,
            );
        }
    });
});

/**
 * THE PROGRAM AXIS — added at the Core freeze, and locked for the same reason the keys are.
 *
 * A Core catalog whose Payments scenarios look runnable will be planned against, and the plan will
 * be wrong. A scenario with no classification at all is worse: it is neither in Core's scope nor
 * out of it, and nobody notices until someone tries to run it.
 */
describe("the program each scenario belongs to", () => {
    it("classifies every scenario, and classifies nothing that does not exist", () => {
        for (const s of SCENARIOS) {
            expect(SCENARIO_PROGRAM[s.key], `${s.key} has no program classification`).toBeTruthy();
        }
        for (const key of Object.keys(SCENARIO_PROGRAM)) {
            expect(scenarioByKey(key), `SCENARIO_PROGRAM names ${key}, which is not a scenario`).toBeTruthy();
        }
    });

    /*
     * THE PAYMENT PRIMITIVES STAY CORE. Payments EXTENDS them; it does not replace them, and moving
     * them out would leave the next program with no foundation to build on and this catalog with no
     * proof the foundation works.
     */
    it("keeps the payment foundation in Core", () => {
        for (const key of [
            "payment_receipt",
            "actual_payer_is_not_responsibility",
            "apply_payment",
            "partial_unapplied",
            "prepaid_available_and_applied",
        ]) {
            expect(SCENARIO_PROGRAM[key], `${key} is Core, not Payments`).toBe("CORE_RUNNABLE");
        }
    });

    /* And the provider-dependent ones are not pretending to be runnable Core QA. */
    it("moves provider-dependent scenarios to the Payments phase", () => {
        for (const key of ["card_collection", "ach_processing", "provider_return", "refund"]) {
            expect(SCENARIO_PROGRAM[key], `${key} needs Payments`).toBe("PAYMENTS_PHASE");
        }
    });

    /*
     * THE RECURRING CHAIN IS THE POINT OF THIS FREEZE. Section 7 certified it; if the catalog does
     * not ASK a human to drive it, the certification is the only thing that ever will.
     */
    it("asks a human to drive the recurring billing chain Section 7 certified", () => {
        for (const key of [
            "billing_preview_reachable",
            "accept_recurring_terms",
            "recurring_preview_is_the_run",
            "recurring_generation_bills_the_accepted_price",
            "recurring_rerun_is_honest",
            "recurring_term_lifecycle",
            "recurring_discount_reduces_net",
            "discount_rerun_and_veto",
            "recurring_due_date",
        ]) {
            const s = scenarioByKey(key);
            expect(s, `${key} is missing from the catalog`).toBeTruthy();
            expect(s!.disposition, `${key} must be walked through by a human`).toBe("HUMAN_WALKTHROUGH");
            expect(SCENARIO_PROGRAM[key]).toBe("CORE_RUNNABLE");
        }
    });

    /* The three deferrals are stated in the catalog, not only in a certification document. */
    it("states the three accepted Core deferrals in full", () => {
        expect(CORE_DEFERRALS.map((d) => d.key)).toEqual([
            "SHARE_METHODS_PERCENTAGE_REMAINDER_DEFERRED",
            "LEDGER_ROW_PROVENANCE_INSPECTION_DEFERRED",
            "DEPOSIT_OPERATOR_PRODUCTIZATION_GAP",
        ]);
        for (const d of CORE_DEFERRALS) {
            expect(d.statement.length, `${d.key} is too thin to weigh`).toBeGreaterThan(120);
        }
    });

    /*
     * A REWRITTEN QUESTION IS A NEW QUESTION. Results are persisted against the version they were
     * given under, so a catalog that gained twelve scenarios must not still claim the old version.
     */
    it("carries a version later than the one the previous catalog published", () => {
        expect(CATALOG_VERSION).not.toBe("2026-09-16.3");
        expect(CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    });
});
