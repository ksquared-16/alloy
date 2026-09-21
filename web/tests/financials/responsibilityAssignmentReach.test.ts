/**
 * §4B — WHAT NAMING A RESPONSIBLE PARTY ACTUALLY REACHES.
 *
 * ── WHAT THE MOUNTED ASSIGNMENT ESTABLISHED ──────────────────────────────────────────────────
 *
 * A responsible party was named through the canonical surface (Financials → Charges → charge detail
 * → Manage responsibility) and committed. The arrangement changed and persisted: the account moved
 * from "1 responsible party from Sep 6, 2026" to "1 responsible party from Sep 18, 2026",
 * $18.00 · Cert Certhouse, read back through the normal projection rather than believed from the
 * form.
 *
 * The $18.00 obligation `f089a3f4` nevertheless still reads "Unassigned". That is not the
 * assignment failing. It is TWO separate facts, and this file locks both so the next pass does not
 * re-discover them as a defect:
 *
 *   1. AN ARRANGEMENT IS ACCOUNT-GRAIN AND EFFECTIVE-DATED. `billing.configure_responsibility`
 *      records who owes the ACCOUNT from a date. It does not divide an individual charge, and it
 *      does not reach backwards over money that has already posted.
 *
 *   2. DIVIDING A CHARGE IS A DIFFERENT COMMAND, AND IT HAS NO OPERATOR SURFACE.
 *      `billing.resolve_responsibility` and `billing.reallocate_responsibility` are charge-grain,
 *      registered, and in the capability registry — and nothing in `app/` or `components/` invokes
 *      either. The responsibility panel says so itself: they "belong to a different intent and are
 *      deliberately not here."
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    NO_FILTER,
    UNASSIGNED_PARTY,
    filterLedger,
    hasChoice,
    responsiblePartyOptions,
} from "@/lib/financials/workspace/accountLenses";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/*
 * CODE, NOT PROSE. The responsibility panel NAMES the charge-grain commands in its own doc-comment,
 * to explain why they are deliberately absent. A plain substring search cannot tell that apart from
 * an invocation — the first draft of the reachability test failed on the comment that documents the
 * very fact it was asserting. Comments are stripped before asking what the file CALLS.
 */
const code = (rel: string) =>
    src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const row = (id: string, member: string | null, party: string | null, unassigned: boolean) =>
    ({ id, chargeId: id, subjectMemberId: member, responsiblePartyName: party,
       responsibilityUnassigned: unassigned, amountCents: 1800, periodKey: "2026-09", status: "posted" }) as never;

describe("THE GATE — the two commands are different grains (§4B)", () => {
    /*
     * The account-grain panel must keep invoking the account-grain action. If it ever reached for
     * the charge-grain one, "Manage responsibility" would silently start changing the charge the
     * operator happened to be looking at — which is exactly what its own doc-comment refuses.
     */
    it("keeps Manage responsibility on the account-grain command", () => {
        const panel = src("app/adminV2/financials/FinancialsResponsibilityPanel.tsx");
        expect(panel).toContain('"billing.configure_responsibility"');
        expect(panel, "the charge-grain commands stay out of this panel")
            .not.toMatch(/callAction[\s\S]{0,400}resolve_responsibility/);
        /*
         * The arrangement's grain is the operator's STATED scope — it was pinned to the household
         * while that was the only authorable kind, and a child-grain arrangement could therefore
         * decide who owed a child's charges while being impossible to create or supersede. What
         * must never return is the old defect: the grain being inherited from whichever charge
         * happened to be open.
         */
        expect(panel).toContain("customer_member_id: args.arrangementMemberId");
        /*
         * The stated scope now reaches the payload through `effectiveMemberId`, because account
         * administration also has to say WHICH child. Both of its branches are stated: the explicit
         * member select when administering, and the operator's household/child choice otherwise.
         * Neither reads the open charge, which is the defect this guards.
         */
        expect(panel).toContain("arrangementMemberId: effectiveMemberId");
        expect(panel).toMatch(/effectiveMemberId = administering[\s\S]{0,200}scope === "child" \? customerMemberId : null/);
    });

    /*
     * THE GAP IS CLOSED, AND THIS IS THE TEST THAT SAID SO FIRST.
     *
     * Its previous form asserted that NOTHING invoked the charge-grain commands, and it was written
     * to fail the day someone added the surface — with a note telling that person to delete it and
     * prove the flow instead. That day is this one, so the expectation is inverted rather than
     * quietly deleted: both deep hosts now raise the canonical commands, and the account-grain
     * panel still does not.
     */
    it("has both deep hosts reaching charge-grain resolution now that the surface exists", () => {
        for (const r of ["components/operationalCards/FinancialsDetailCard.tsx",
                         "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx"]) {
            expect(code(r), `${r} raises Resolve`).toContain("billing.resolve_responsibility");
            expect(code(r), `${r} raises Reallocate`).toContain("billing.reallocate_responsibility");
        }
        // The account-grain panel keeps its own intent and does not grow a charge-grain command.
        expect(code("app/adminV2/financials/FinancialsResponsibilityPanel.tsx"))
            .not.toContain("billing.resolve_responsibility");
    });

    it("keeps both authorities registered and distinct", () => {
        const actions = src("lib/adminV2/actions/definitions/financialResponsibilityActions.ts");
        expect(actions).toContain("billing.resolve_responsibility");
        expect(actions).toContain("billing.reallocate_responsibility");
        expect(actions).toContain("billing.configure_responsibility");
    });
});

describe("THE GATE — the Responsible Party filter divides only when it can (§4B)", () => {
    /*
     * MEASURED: after the assignment, every ledger row was `unassigned`, `not-allocated` or
     * `not-applicable` — no row carried a NAME. `responsiblePartyOptions` therefore yields a single
     * token, and a one-choice filter is not rendered. That is the settled doctrine (a control whose
     * dropdown holds one option divides nothing), not a missing filter.
     */
    it("offers no choice while nothing is divided by a named party", () => {
        const rows = [row("c1", "m-ana", null, true), row("c2", "m-ben", null, false)];
        const opts = responsiblePartyOptions(rows as never);
        expect(opts.map((o) => o.value)).toEqual([UNASSIGNED_PARTY]);
        expect(hasChoice(opts), "one option divides nothing").toBe(false);
    });

    /* And the moment one row carries a name, the filter has something to do. */
    it("offers the choice as soon as an obligation names a party", () => {
        const rows = [row("c1", "m-ana", "Cert Certhouse", false), row("c2", "m-ben", null, true)];
        const opts = responsiblePartyOptions(rows as never);
        expect(opts.map((o) => o.value).sort()).toEqual([UNASSIGNED_PARTY, "Cert Certhouse"].sort());
        expect(hasChoice(opts)).toBe(true);
        expect(filterLedger(rows as never, { ...NO_FILTER, responsibleParty: "Cert Certhouse" })
            .map((r) => (r as unknown as { id: string }).id)).toEqual(["c1"]);
    });

    /* The control exists and is wired; it is its CHOICES that were empty. */
    it("keeps the responsible-party filter wired on the deep surface", () => {
        const detail = src("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail).toContain('testId="responsible-party"');
        expect(detail).toContain("responsiblePartyChoices.length > 1");
        expect(detail, "and it is absent under Payments, where Payer owns the question")
            .toMatch(/lens !== "payments" && responsiblePartyChoices/);
    });
});

describe("THE GATE — naming a party rewrites nothing else (§4B)", () => {
    /* Subject identity is not the arrangement's to change; measured identical before and after. */
    it("never lets the arrangement authority touch a charge's subject", () => {
        const arr = src("lib/financials/responsibility/arrangementService.ts");
        for (const forbidden of ["subject_member_id", "customer_member_id: row", "charges"]) {
            expect(arr, `an arrangement does not write ${forbidden}`).not.toContain(forbidden);
        }
    });

    /* Payer non-mutation, by write boundary rather than by creating money to prove it. */
    it("never lets the arrangement authority write a payer", () => {
        const arr = src("lib/financials/responsibility/arrangementService.ts");
        expect(arr).toContain("financial_responsibility_arrangements");
        expect(arr).toContain("financial_responsibility_shares");
        expect(arr, "no payment table is written here").not.toContain("payments");
        expect(arr, "no payer column is written here").not.toContain("payer");
    });
});
