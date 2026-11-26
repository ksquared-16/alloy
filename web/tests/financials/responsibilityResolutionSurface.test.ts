/**
 * AN OPERATOR CAN NOW FINISH THE SENTENCE THEY WERE ALLOWED TO START.
 *
 * ── WHAT WAS MISSING ─────────────────────────────────────────────────────────────────────────
 *
 * `billing.configure_responsibility` let an operator say WHO SHOULD BE RESPONSIBLE.
 * `billing.resolve_responsibility` and `billing.reallocate_responsibility` — the charge-grain half —
 * were registered, permissioned and in the capability registry, and NOTHING in the product invoked
 * either. So responsibility could be authored and never applied to a single obligation.
 *
 * ── WHAT IS LOCKED ───────────────────────────────────────────────────────────────────────────
 *
 * That both deep hosts reach the SAME canonical commands, that the three responsibility states map
 * to the right offer, and that the two intents never collapse into one. What is deliberately NOT
 * locked here is the resolution arithmetic: that belongs to `responsibilityService` and is its own
 * authority. This file is about REACHABILITY and INTENT.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    FINANCIAL_TRANSACTION_ACTIONS,
    financialResponsibilityEligibility,
} from "@/lib/financials/commands/financialTransactionCommands";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
/* Comments name these commands to explain them; only what a file CALLS counts as reachability. */
const code = (rel: string) =>
    src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("THE GATE — the three states map to the right offer", () => {
    /* Nobody owes it yet. Both absence states mean the same thing to an operator: resolve it. */
    it("offers Resolve on an unassigned or unallocated obligation", () => {
        expect(financialResponsibilityEligibility({ chargeId: "c1", responsibleParty: null }))
            .toEqual({ resolve: true, reallocate: false });
        expect(financialResponsibilityEligibility({ chargeId: "c1", responsibleParty: "   " }))
            .toEqual({ resolve: true, reallocate: false });
    });

    /*
     * A DIVIDED CHARGE IS NOT RESOLVED AGAIN. Changing it moves what one real person owes another,
     * which is a different act with a different permission and a required reason.
     */
    it("offers Reallocate — and never Resolve — once a party is named", () => {
        expect(financialResponsibilityEligibility({ chargeId: "c1", responsibleParty: "Cert Certhouse" }))
            .toEqual({ resolve: false, reallocate: true });
    });

    /* A reduction's responsibility belongs to the charge it reduces. Dividing a discount is not a thing. */
    it("offers neither on a row where responsibility does not arise", () => {
        expect(financialResponsibilityEligibility({ chargeId: "c1", responsibilityApplies: false }))
            .toEqual({ resolve: false, reallocate: false });
        expect(financialResponsibilityEligibility({ chargeId: null }))
            .toEqual({ resolve: false, reallocate: false });
    });

    /* Exactly one is ever offered — the operator reads the question from which control is there. */
    it("never offers both at once", () => {
        for (const party of [null, "", "Dana"]) {
            const e = financialResponsibilityEligibility({ chargeId: "c1", responsibleParty: party });
            expect(e.resolve && e.reallocate).toBe(false);
        }
    });
});

describe("THE GATE — the two intents stay two commands", () => {
    it("spells both canonical commands once, in the shared vocabulary", () => {
        expect(FINANCIAL_TRANSACTION_ACTIONS.resolveResponsibility).toBe("billing.resolve_responsibility");
        expect(FINANCIAL_TRANSACTION_ACTIONS.reallocateResponsibility).toBe("billing.reallocate_responsibility");
    });

    /*
     * CONFIGURE IS NOT RESOLVE. The account-grain arrangement command must stay out of the
     * charge-grain shell, or "Resolve responsibility" would quietly start authoring arrangements.
     */
    it("keeps the arrangement command out of the charge-grain surface", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "the row commands are the charge-grain pair").toContain("resolveResponsibility");
        expect(card).toContain("reallocateResponsibility");
        /*
         * WHAT "OUT OF THE CHARGE-GRAIN SURFACE" MEANS, now that the file has a second legitimate
         * caller. A charge-scoped arrangement is authored when a charge is CREATED — the operator
         * says who owes this one, and the host writes it against the charge id the create returned.
         * That is the narrowest scope of CHARGE > CHILD > HOUSEHOLD and is the approved model.
         *
         * The rule this lock exists for is unchanged: a LEDGER ROW's resolve/reallocate must not
         * quietly author arrangements, or "Resolve responsibility" becomes a second authoring
         * surface with none of the authoring rules. So the command may appear exactly once, in the
         * post-charge orchestration, and nowhere near the row action.
         */
        const configures = [...card.matchAll(/billing\.configure_responsibility/g)].map((m) => m.index ?? -1);
        expect(configures.length, "one caller, not a family of them").toBe(1);
        const orchestration = card.indexOf("const applyChargeDecisions");
        const rowAction = card.indexOf("const runRowAction");
        expect(orchestration, "the post-charge orchestration exists").toBeGreaterThan(-1);
        expect(configures[0], "and the only configure call is inside it").toBeGreaterThan(orchestration);
        if (rowAction > orchestration) {
            expect(configures[0], "before the row action, never inside it").toBeLessThan(rowAction);
        }
    });

    /* Reallocation demands a stated reason before the operator can commit it. */
    it("will not let a reallocation commit without a reason", () => {
        const card = src("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toMatch(/reallocating && reallocationReason\.trim\(\)\.length < 3/);
        expect(card, "and the reason is never defaulted for the operator")
            .toMatch(/reallocate" \? \{ reason: reallocationReason \}/);
    });
});

describe("THE GATE — both deep hosts reach the SAME command (§13)", () => {
    const fp = src("components/operationalCards/FinancialsDetailCard.tsx");
    const ws = src("app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx");

    it("raises the same two canonical commands from both hosts' rows", () => {
        for (const file of [fp, ws]) {
            expect(file).toContain('command="billing.resolve_responsibility"');
            expect(file).toContain('command="billing.reallocate_responsibility"');
        }
    });

    /* One eligibility rule, imported by both — not two readings of the same three states. */
    it("decides eligibility from the one shared rule on both hosts", () => {
        for (const file of [fp, ws]) expect(file).toContain("financialResponsibilityEligibility");
    });

    /*
     * THE WORKSPACE ASKS; THE CARD PERFORMS. A workspace-owned executor would be the second writer
     * the command channel exists to prevent.
     */
    it("has the workspace request on the channel rather than execute", () => {
        expect(code("app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx"))
            .not.toContain("executeFinancialCommand");
        expect(ws).toContain('request({ kind: "resolveResponsibility"');
        expect(ws).toContain('request({ kind: "reallocateResponsibility"');
        const card = src("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "and the host performs both kinds it is asked for")
            .toMatch(/request\.kind === "resolveResponsibility"/);
        expect(card).toMatch(/request\.kind === "reallocateResponsibility"/);
    });

    /* No second API and no direct table write anywhere in the new path. */
    it("adds no second responsibility API and no direct write", () => {
        for (const rel of ["components/operationalCards/FinancialsDetailCard.tsx",
                           "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx",
                           "components/admin/focusPanel/cards/FinancialsCard.tsx"]) {
            expect(code(rel), `${rel} writes no allocation table`).not.toContain("financial_responsibility_allocations");
            expect(code(rel), `${rel} invents no responsibility route`).not.toContain("/api/financials/responsibility");
        }
    });
});

describe("THE GATE — Summary reports, Details administers", () => {
    /* The doctrine, kept at the component boundary: the compact card is given neither command. */
    it("keeps responsibility administration off the Summary card", () => {
        const compact = src("components/operationalCards/FinancialsCard.tsx");
        for (const f of ["onResolveResponsibility", "onReallocateResponsibility",
                         "billing.resolve_responsibility", "billing.reallocate_responsibility"]) {
            expect(compact, `Summary does not administer responsibility (${f})`).not.toContain(f);
        }
    });

    /* And the deep surface does carry them, under its own marker. */
    it("puts the command shell on the deep surface", () => {
        const card = src("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toContain('data-financials-overlay="responsibility"');
        expect(card).toContain("data-financials-responsibility-mode={surface.mode}");
    });
});
