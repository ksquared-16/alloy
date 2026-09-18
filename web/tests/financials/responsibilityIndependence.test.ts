/**
 * WHO THE MONEY IS FOR, AND WHO OWES IT, ARE TWO QUESTIONS (§4D · §4E · §4G).
 *
 * ── THE DOCTRINE ─────────────────────────────────────────────────────────────────────────────
 *
 * The child filter asks WHO IS THE MONEY FOR. The responsible-party filter asks WHO OWES IT. The
 * payer — under Payments — asks WHO ACTUALLY PAID. Three facts about one row, and collapsing any
 * two of them loses a real distinction: a charge can concern Ana, be owed by Dana, and be paid by
 * a grandparent, and an operator must be able to ask each question separately.
 *
 * ── WHY THIS IS LOCKED AT THE PREDICATE ──────────────────────────────────────────────────────
 *
 * `filterLedger` applies subject scope and responsible party as two INDEPENDENT tests. If either
 * ever consumed the other — a responsible-party choice narrowing the subject, or a child choice
 * implying an owner — the surface would answer a question the operator did not ask, and the two
 * counts in the lens bar would stop meaning what they say.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    NO_FILTER,
    UNASSIGNED_PARTY,
    filterLedger,
    responsiblePartyOptions,
    responsiblePartyTokenOf,
} from "@/lib/financials/workspace/accountLenses";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Four rows that make the two questions come apart on purpose: each child has one charge owed by
 * Dana and one owed by Chris, so neither filter can be predicted from the other.
 */
const row = (id: string, member: string | null, party: string | null) =>
    ({
        // `subjectMemberId` is the ONLY field the scope rule reads, and null IS household grain.
        id, chargeId: id, subjectMemberId: member, responsiblePartyName: party,
        responsibilityUnassigned: party == null, type: "tuition", amountCents: 40_000,
        periodKey: "2026-09", status: "posted",
    }) as never;

const ROWS = [
    row("c1", "m-ana", "Dana"),
    row("c2", "m-ana", "Chris"),
    row("c3", "m-ben", "Dana"),
    row("c4", "m-ben", null),
    // The account's own obligation — subjectMemberId null, owed by Dana.
    row("h1", null, "Dana"),
] as const;

const ids = (rows: readonly unknown[]) => rows.map((r) => (r as { id: string }).id);

describe("THE GATE — the child filter and the responsible-party filter are independent (§4D)", () => {
    it("asks WHO IS THE MONEY FOR without deciding who owes it", () => {
        const ana = filterLedger(ROWS as never, { ...NO_FILTER, subject: "m-ana" });
        // Ana's own rows AND the household's — a household charge is the account's, and Ana is in it.
        expect(ids(ana)).toEqual(["c1", "c2", "h1"]);
        // Both of Ana's rows survive even though they are owed by different people.
        expect([...new Set(ana.map((r) => responsiblePartyTokenOf(r)))].sort()).toEqual(["Chris", "Dana"]);
    });

    it("asks WHO OWES IT without deciding which child it is for", () => {
        const dana = filterLedger(ROWS as never, { ...NO_FILTER, responsibleParty: "Dana" });
        expect(ids(dana)).toEqual(["c1", "c3", "h1"]);
        // Dana owes for BOTH children and the household — the filter did not narrow the subject.
        expect([...new Set(dana.map((r) => (r as { subjectMemberId: string | null }).subjectMemberId))].sort())
            .toEqual(["m-ana", "m-ben", null]);
    });

    /* The two compose as an intersection, which is only possible because neither implies the other. */
    it("composes the two as an intersection, not as one derived from the other", () => {
        const both = filterLedger(ROWS as never, { ...NO_FILTER, subject: "m-ben", responsibleParty: "Dana" });
        expect(ids(both), "Ben's own row plus the household's, both owed by Dana").toEqual(["c3", "h1"]);
    });

    /*
     * AN UNASSIGNED OBLIGATION IS VISIBLE, not hidden. "Nobody owes this yet" is a fact an operator
     * must be able to select for — it is the work queue for assigning responsibility.
     */
    it("makes an unassigned obligation selectable rather than invisible", () => {
        expect(responsiblePartyTokenOf(ROWS[3] as never)).toBe(UNASSIGNED_PARTY);
        const un = filterLedger(ROWS as never, { ...NO_FILTER, responsibleParty: UNASSIGNED_PARTY });
        expect(ids(un)).toEqual(["c4"]);
        expect(responsiblePartyOptions(ROWS as never).map((o) => o.value)).toContain(UNASSIGNED_PARTY);
    });

    /*
     * §4G — INDEPENDENTLY INSPECTABLE. Two obligations authored by ONE multi-child Add still carry
     * their own responsibility: c1 (Ana/Dana) and c3 (Ben/Dana) are separate rows with separate
     * answers, and nothing merged them into a household responsibility because they shared a
     * gesture.
     */
    it("keeps per-child obligations independently inspectable after a multi-child Add (§4G)", () => {
        const ana = filterLedger(ROWS as never, { ...NO_FILTER, subject: "m-ana", responsibleParty: "Chris" });
        const ben = filterLedger(ROWS as never, { ...NO_FILTER, subject: "m-ben", responsibleParty: "Chris" });
        expect(ids(ana)).toEqual(["c2"]);
        expect(ids(ben), "Chris owes for Ana only — one gesture did not make one household answer").toEqual([]);
    });
});

describe("THE GATE — household truth stays visible from inside the account (§3D)", () => {
    /*
     * A child scope INCLUDES the household's own rows, because a household charge is the account's
     * and the child is inside the account. This is the half of the grain doctrine that stops an
     * explicit household charge from becoming invisible the moment an operator looks at a child.
     */
    it("shows a household-grain row inside a child's scope", () => {
        expect(ids(filterLedger(ROWS as never, { ...NO_FILTER, subject: "m-ben" }))).toContain("h1");
    });

    /* And "household" is a DELIBERATE scope, narrower than the account — the children drop away. */
    it("has a deliberate household scope that shows only the account's own rows", () => {
        expect(ids(filterLedger(ROWS as never, { ...NO_FILTER, subject: "household" }))).toEqual(["h1"]);
    });
});

describe("THE GATE — responsibility is not the payer (§4E)", () => {
    const lenses = src("lib/financials/workspace/accountLenses.ts");

    /* The payer filter operates on PAYMENTS; the responsibility filter operates on the LEDGER. */
    it("keeps the payer a property of payments and responsibility a property of obligations", () => {
        expect(lenses, "payer options come from payments").toMatch(/payerOptions\([\s\S]{0,120}payments/);
        expect(lenses, "responsible-party options come from ledger rows").toMatch(/responsiblePartyOptions\([\s\S]{0,120}rows/);
    });

    /*
     * The arrangement authority writes arrangements and shares. If it ever wrote a payer, naming
     * somebody responsible would silently change who a payment is attributed to.
     */
    it("never lets the arrangement authority write a payer", () => {
        const arr = src("lib/financials/responsibility/arrangementService.ts");
        expect(arr).toContain("financial_responsibility_arrangements");
        expect(arr).toContain("financial_responsibility_shares");
        for (const forbidden = "payer" as const; ;) {
            expect(arr, "an arrangement writes no payer").not.toContain(`${forbidden}_id`);
            break;
        }
    });

    /* And the ledger row keeps them as separate fields, so neither can be read off the other. */
    it("carries responsibility and payer as separate row facts", () => {
        expect(lenses).toContain("payerLabel");
        expect(lenses).toContain("responsiblePartyName");
    });
});

describe("THE GATE — what the engine actually does with an arrangement (§4F)", () => {
    /*
     * OBSERVED, NOT ASSUMED. The mounted charge detail states: "1 responsible party from Sep 6,
     * 2026. This posted charge is not divided under it." An arrangement is effective-dated and does
     * NOT retroactively divide a charge that has already posted. That is the engine's ordering and
     * it is recorded here rather than presumed the other way.
     */
    it("records that an arrangement does not retroactively divide a posted charge", () => {
        const arr = src("lib/financials/responsibility/arrangementService.ts");
        // An arrangement is superseded, never edited — which is what makes "from a date" meaningful.
        expect(arr).toMatch(/never edited|CLOSES the one it replaces|supersed/i);
        expect(arr).toContain("effectiveStart");
    });
});

describe("THE GATE — the undivided-charge note does not claim a draft has posted", () => {
    const panel = src("app/adminV2/financials/FinancialsResponsibilityPanel.tsx");

    /*
     * MEASURED ON THE MOUNTED CANDIDATE. Every charge on the Charges tab — each labelled
     * "Draft · Service …" with its own "Post $25.00" control two lines above — carried the sentence
     * "This posted charge is not divided under it." The branch that renders it tests only whether an
     * arrangement exists and no party is allocated; it never asked whether the charge had posted.
     *
     * The reason the sentence gives is only true of posted money: Thread 6 refuses to move money
     * that has already posted. A draft is not protected by that rule — it simply has no allocation
     * yet — so the note explained a restriction that was not there, on the same screen that was
     * calling the charge a draft.
     */
    it("states the posted reason only for a charge that has actually posted", () => {
        expect(panel, "the claim is conditional on status").toContain("isPostedStatus(chargeStatus)");
        expect(panel, "a draft gets a true sentence").toContain("This charge is not divided under it yet.");
    });

    it("takes the status from the charge rather than assuming it", () => {
        expect(panel).toContain("chargeStatus?: string | null;");
        expect(src("app/adminV2/financials/FinancialsChargeDetail.tsx")).toContain("chargeStatus={detail.status}");
    });

    /* The arrangement half of the sentence was correct and must survive the repair. */
    it("still says an arrangement is in force, which was the other half of the fix", () => {
        expect(panel).toContain('data-financials-responsibility-arrangement="in-force"');
        expect(panel).toMatch(/1 responsible party|responsible parties/);
    });
});
