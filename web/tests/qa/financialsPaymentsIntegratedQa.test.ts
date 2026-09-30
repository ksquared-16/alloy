/**
 * ONE FINANCIALS V1 ACCEPTANCE, WITH PAYMENTS INSIDE IT.
 *
 * Payments was built as its own programme and wrote its own acceptance packet. That packet was a
 * specification, never a second QA system — and the danger at the moment of integration is not
 * that scenarios go missing, it is that they get STAPLED ON: a Financials list, then a Payments
 * list underneath, asking a Director to record the same operator act twice under two headings.
 *
 * These cases hold the shape of the convergence:
 *
 *   every Payments capability is asked about, ONCE;
 *   nothing certified is pre-marked as accepted;
 *   the boundaries engineering stopped at are carried, keyed to the scenario that meets each;
 *   and the scenarios a human must drive are reachable from the surface they are rendered on.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    CATALOG_VERSION,
    CORE_DEFERRALS,
    EVIDENCE_BOUNDARIES,
    FIXTURE_DOCTRINE,
    NO_AUTOMATIC_PASS,
    SCENARIOS,
    SCENARIO_EVIDENCE,
    SCENARIO_PROGRAM,
    scenarioByKey,
    scenarioEvidence,
} from "@/lib/qa/financialsDirectorQa/scenarioCatalog";

const key = (k: string) => scenarioByKey(k)!;

/* ── THE PAYMENTS SURFACE IS ASKED ABOUT ──────────────────────────────────────────────────── */

describe("every Payments capability has exactly one scenario", () => {
    const REQUIRED = [
        "payment_method_on_file",
        "bank_setup_request",
        "bank_setup_payer_authorization",
        "bank_method_operator_projection",
        "card_collection",
        "ach_processing",
        "ach_uncovered_obligation",
        "refund",
        "provider_return",
        "held_deposit_take_and_hold",
        "held_deposit_apply",
        "held_deposit_release",
        "held_deposit_refund",
        "held_deposit_non_refundable",
        "held_deposit_card_rail_refund",
        "duplicate_charge_notice",
        "financial_activity_language",
        "provider_readiness",
        "autopay_enrollment",
    ];

    it("names each of them", () => {
        for (const k of REQUIRED) expect(scenarioByKey(k), k).toBeTruthy();
    });

    it("asks about each of them once — no Payments heading duplicating a Financials act", () => {
        /*
         * THE CONVERGENCE, STATED AS A TEST. The Payments packet had its own parts for financial
         * position, charges, responsibility and manual payments, and every one of those is an act
         * this catalog already asked a human to drive. A second scenario for the same act is the
         * failure this exists to catch — not a missing scenario, a doubled one.
         */
        const titles = SCENARIOS.map((s) => s.title.toLowerCase());
        expect(new Set(titles).size, "two scenarios with one title").toBe(titles.length);
        const keys = SCENARIOS.map((s) => s.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("gives every scenario a unique place in the walk", () => {
        const orders = SCENARIOS.map((s) => s.order);
        expect(new Set(orders).size, "two scenarios at one position").toBe(orders.length);
    });

    it("leaves no scenario waiting on a programme that already landed", () => {
        const stale = Object.entries(SCENARIO_PROGRAM).filter(([, v]) => String(v) === "PAYMENTS_PHASE");
        expect(stale.map(([k]) => k)).toEqual([]);
    });
});

/* ── NOTHING IS ACCEPTED BECAUSE SOMETHING WAS CERTIFIED ──────────────────────────────────── */

describe("certified is not accepted", () => {
    it("states the rule where a walker will read it", () => {
        expect(NO_AUTOMATIC_PASS).toMatch(/still reads NOT RUN|does not answer for you/i);
    });

    it("never ships a result — the catalog describes questions, not answers", () => {
        const source = JSON.stringify(SCENARIOS);
        for (const word of ['"pass"', '"PASS"', '"accepted"']) {
            expect(source, `${word} has no business in a question`).not.toContain(word);
        }
    });

    it("offers the Autopay scenarios to a human despite their suites", () => {
        /*
         * Nine Autopay scenarios were AUTOMATED_CERTIFIED_HUMAN_PENDING and the surface filtered
         * that disposition OUT of the walkthrough, so certification quietly removed them from human
         * acceptance — the "no automatic pass" rule inverted into an automatic skip.
         */
        for (const k of ["autopay_enrollment", "autopay_pause", "autopay_revoke"]) {
            const s = key(k);
            expect(s.disposition).toBe("AUTOMATED_CERTIFIED_HUMAN_PENDING");
            expect(scenarioEvidence(k)).toContain("AUTOMATED_CERTIFIED");
            expect(scenarioEvidence(k), "and a human still drives it").toContain("HUMAN_WALKTHROUGH");
        }
    });
});

/* ── WHAT EACH PROOF IS MADE OF ───────────────────────────────────────────────────────────── */

describe("a Director is told what a scenario will cost before they start it", () => {
    it("classifies every scenario", () => {
        for (const s of SCENARIOS) {
            expect(SCENARIO_EVIDENCE[s.key], `${s.key} has no evidence class`).toBeTruthy();
            expect(scenarioEvidence(s.key).length, s.key).toBeGreaterThan(0);
        }
    });

    it("warns where a real provider act is required", () => {
        for (const k of ["card_collection", "ach_processing", "bank_setup_payer_authorization", "payment_method_on_file"]) {
            expect(scenarioEvidence(k), k).toContain("REAL_STRIPE_TEST_ACT");
        }
    });

    it("warns where a fixture will be spent", () => {
        for (const k of ["held_deposit_take_and_hold", "held_deposit_apply", "bank_setup_request"]) {
            expect(scenarioEvidence(k), k).toContain("CONTROLLED_FIXTURE");
        }
    });

    it("marks a read as a read, so nobody braces for a mutation", () => {
        for (const k of ["bank_method_operator_projection", "financial_activity_language", "held_deposit_non_refundable"]) {
            expect(scenarioEvidence(k), k).toContain("READ_ONLY_EVIDENCE");
        }
    });
});

/* ── THE BOUNDARIES ENGINEERING STOPPED AT ────────────────────────────────────────────────── */

describe("the evidence boundaries are carried, not buried", () => {
    it("names all five", () => {
        expect(EVIDENCE_BOUNDARIES.map((b) => b.key).sort()).toEqual([
            "ACH_PROVIDER_RETURN",
            "CARD_RAIL_HELD_DEPOSIT_REFUND",
            "DEPLOYED_ACH_COLLECTION_UNCOVERED",
            "DUPLICATE_CHARGE_NOTICE",
            "PARTICIPANT_BANK_VISUAL",
        ]);
    });

    it("keys each one to a scenario that actually exists", () => {
        for (const b of EVIDENCE_BOUNDARIES) {
            expect(scenarioByKey(b.scenarioKey), `${b.key} points at ${b.scenarioKey}`).toBeTruthy();
        }
    });

    it("says why, in each case, rather than only that", () => {
        for (const b of EVIDENCE_BOUNDARIES) {
            expect(b.statement.length, b.key).toBeGreaterThan(80);
        }
    });

    it("calls the unreachable ones deferred and not failed", () => {
        for (const k of ["provider_return", "held_deposit_card_rail_refund"]) {
            const s = key(k);
            expect(s.disposition).toBe("EXPLICITLY_DEFERRED");
            expect(s.dispositionReason, k).toBeTruthy();
            expect(scenarioEvidence(k)).toContain("DEFERRED_PROVIDER_DEPENDENT");
        }
    });

    it("carries the visual nit as a question for a human, not a defect", () => {
        const s = key("bank_setup_visual_review");
        expect(s.disposition).toBe("HUMAN_WALKTHROUGH");
        expect(s.dispositionReason).toMatch(/NOT repaired|human decides/i);
    });
});

/* ── THE SURFACE LOOKS LIKE THE PRODUCT IT IS JUDGING ────────────────────────────────────── */

describe("the QA surface's own chrome", () => {
    /*
     * THE SURFACE THIS ASSERTS AGAINST IS THE EXTERNAL ONE.
     *
     * `/dev/core-financials-qa` is the Financials human QA the Director has always used: beside
     * the product rather than inside the operator shell. The authenticated harness under
     * `adminV2/system/qa` was a second surface that grew the integrated catalog first; it is not
     * the destination, so these assertions follow the catalog to where it is actually walked.
     */
    const client = fs.readFileSync(
        path.join(process.cwd(), "app/dev/core-financials-qa/CoreFinancialsQaReader.tsx"), "utf8",
    );

    it("records acceptance on a Bend Pine primary, not a midnight one", () => {
        /*
         * Measured on the deployed surface before this: PASS rendered rgb(24, 39, 58). Every other
         * primary a Director meets while walking Financials is Bend Pine, so the one button that
         * records their acceptance was the odd one out.
         */
        const btn = client.slice(client.indexOf("function Btn"));
        expect(btn).toMatch(/bg-alloy-bend-pine/);
        expect(btn, "no navy primary").not.toMatch(/bg-alloy-midnight px/);
    });

    it("gives the controls the test id they were always passed", () => {
        /* `data-qa-action` alone meant every selector written against data-testid matched nothing. */
        const btn = client.slice(client.indexOf("function Btn"));
        expect(btn).toMatch(/data-testid=\{id\}/);
    });

    it("offers all five answers", () => {
        for (const label of [">PASS<", ">FAIL<", ">BLOCKED<", ">DEFERRED<", ">NOT RUN<"]) {
            expect(client, label).toContain(label);
        }
    });

    it("walks the certified and the deferred, not only the human-driven", () => {
        /*
         * THE DEFECT THIS SURFACE CARRIED TOO. Filtering to HUMAN_WALKTHROUGH removed nine
         * suite-certified Autopay scenarios from the walk — the "no automatic pass" rule
         * inverted into an automatic absence.
         */
        const walk = client.slice(client.indexOf("const walkthrough"), client.indexOf("const resultOf"));
        expect(walk).toContain("AUTOMATED_CERTIFIED_HUMAN_PENDING");
        expect(walk).toContain("EXPLICITLY_DEFERRED");
    });

    it("shows a scenario what it will cost before it is driven", () => {
        expect(client).toContain("EVIDENCE_LABELS");
        expect(client).toMatch(/data-qa-evidence-class/);
    });

    it("meets a deferral with the boundary that explains it", () => {
        expect(client).toContain("evidenceBoundaries");
        expect(client).toMatch(/data-qa-evidence-boundary/);
    });

    it("states which accounts may be spent before the walk begins", () => {
        expect(client).toContain("fixtureDoctrine");
        expect(client).toMatch(/data-qa-fixture-doctrine/);
    });

    it("keeps the notes that make it a human QA surface", () => {
        /* Observation, expectation and classification — the testimony, not just the verdict. */
        expect(client).toMatch(/data-qa-observation/);
        expect(client).toContain("qa-expected");
        expect(client).toMatch(/data-qa-classification/);
        expect(client).toMatch(/survive a reload/);
    });
});

/* ── WHICH ACCOUNT MAY BE SPENT ───────────────────────────────────────────────────────────── */

describe("the fixture doctrine is on the surface, not only in a document", () => {
    it("names all three", () => {
        expect(FIXTURE_DOCTRINE.map((f) => f.fixture)).toEqual([
            "Certhouse", "Certopp", "A disposable household you create",
        ]);
    });

    it("says Certhouse is read-only, and why that is not pedantry", () => {
        const f = FIXTURE_DOCTRINE.find((x) => x.fixture === "Certhouse")!;
        expect(f.rule).toMatch(/READ ONLY/);
        /* The reason has to survive somebody being helpful. */
        expect(f.why).toMatch(/IS the certification|destroy what it is evidence of/i);
    });

    it("protects the bank method a real payer authorized", () => {
        const f = FIXTURE_DOCTRINE.find((x) => x.fixture === "Certopp")!;
        expect(f.rule).toMatch(/bank method is READ ONLY/i);
        expect(f.why).toMatch(/real payer|real mandate/i);
    });

    it("gives destructive work somewhere to go", () => {
        const f = FIXTURE_DOCTRINE.find((x) => x.fixture.startsWith("A disposable"))!;
        expect(f.rule).toMatch(/destructive|repeatable/i);
    });
});

/* ── THE DEFERRAL PAYMENTS CLOSED ─────────────────────────────────────────────────────────── */

describe("the held-deposit gap Core recorded", () => {
    it("is kept with its closure rather than deleted", () => {
        const d = CORE_DEFERRALS.find((x) => x.key === "DEPOSIT_OPERATOR_PRODUCTIZATION_GAP")!;
        expect(d, "a deferral that vanishes leaves no record it was accepted").toBeTruthy();
        expect(d.closedBy).toMatch(/CLOSED/);
        expect(d.closedBy).toMatch(/held_deposit_take_and_hold/);
    });

    it("has scenarios that actually close it", () => {
        for (const k of ["held_deposit_take_and_hold", "held_deposit_apply", "held_deposit_release", "held_deposit_refund"]) {
            expect(key(k).disposition).toBe("HUMAN_WALKTHROUGH");
        }
    });
});

/* ── THE QUESTIONS CHANGED, SO THE ANSWERS MUST KNOW ──────────────────────────────────────── */

describe("the catalog version", () => {
    it("moved past the Core freeze, because the meaning of this list changed", () => {
        expect(CATALOG_VERSION).not.toBe("2026-09-20.3");
        expect(CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    });
});

/* ── EVERY WALKTHROUGH SAYS WHERE TO GO AND WHAT MUST NOT MOVE ───────────────────────────── */

describe("no scenario is a placeholder wearing a disposition", () => {
    it("gives every human walkthrough steps and an invariant", () => {
        for (const s of SCENARIOS) {
            if (s.disposition !== "HUMAN_WALKTHROUGH") continue;
            expect(s.navigate.length, `${s.key} navigate`).toBeGreaterThan(0);
            expect(s.doThis.length, `${s.key} doThis`).toBeGreaterThan(0);
            expect(s.invariant.length, `${s.key} invariant`).toBeGreaterThan(0);
            expect(s.failSymptoms.length, `${s.key} failSymptoms`).toBeGreaterThan(0);
        }
    });

    it("requires a stated reason wherever a human is NOT the proof", () => {
        for (const s of SCENARIOS) {
            if (s.disposition === "HUMAN_WALKTHROUGH") continue;
            expect(s.dispositionReason, `${s.key} must say why not`).toBeTruthy();
        }
    });
});
