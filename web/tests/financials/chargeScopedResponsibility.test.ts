/**
 * CHARGE > CHILD > HOUSEHOLD — the ladder, driven through the shared specificity authority.
 *
 * These run the real `pickGoverningArrangement`, because the whole point of the extension is that
 * ONE authority decides which arrangement governs a charge. A component that ranked these itself
 * would be a second opinion about who owes money, and two consumers asking the same question
 * would eventually get two answers.
 */
import { describe, expect, it } from "vitest";

import {
    arrangementAppliesTo,
    arrangementSpecificityRank,
    pickGoverningArrangement,
    type ArrangementCandidate,
} from "@/lib/financials/responsibility/arrangementSpecificity";

const CHILD = "cm-certa";
const OTHER_CHILD = "cm-certb";
const CHARGE = "chg-1";
const OTHER_CHARGE = "chg-2";

/*
 * Typed as the shared candidate rather than inferred from the first literal: inference gave
 * `customerMemberId: null` and `chargeId: null` LITERAL types, so the child and charge-scoped
 * fixtures would not fit their own helper. Invisible to vitest, which never typechecks.
 */
const household: ArrangementCandidate = { id: "arr-household", customerMemberId: null, chargeId: null, effectiveStart: "2026-01-01", effectiveEnd: null };
const child: ArrangementCandidate = { id: "arr-child", customerMemberId: CHILD, chargeId: null, effectiveStart: "2026-02-01", effectiveEnd: null };
const chargeScoped: ArrangementCandidate = { id: "arr-charge", customerMemberId: CHILD, chargeId: CHARGE, effectiveStart: "2026-03-01", effectiveEnd: null };

const govern = (candidates: ArrangementCandidate[], customerMemberId: string | null, chargeId: string | null = null) =>
    pickGoverningArrangement(candidates, { customerMemberId, chargeId, onDate: "2026-09-22" });

describe("the specificity ladder", () => {
    it("household governs when nothing more specific exists", () => {
        expect(govern([household], CHILD, CHARGE)?.id).toBe("arr-household");
    });

    it("a child arrangement overrides household for that child's charges", () => {
        expect(govern([household, child], CHILD, CHARGE)?.id).toBe("arr-child");
    });

    it("a charge arrangement overrides child and household for exactly that charge", () => {
        expect(govern([household, child, chargeScoped], CHILD, CHARGE)?.id).toBe("arr-charge");
    });

    it("ANOTHER charge still resolves through child and household", () => {
        /* The defect this exists to catch: one charge's arrangement leaking onto its siblings. */
        expect(govern([household, child, chargeScoped], CHILD, OTHER_CHARGE)?.id).toBe("arr-child");
        expect(govern([household, chargeScoped], CHILD, OTHER_CHARGE)?.id).toBe("arr-household");
    });

    it("a charge arrangement is not an answer to a standing question", () => {
        // Asking "what does this household arrange" must never be handed one charge's answer.
        expect(govern([chargeScoped], CHILD, null)).toBeNull();
        expect(govern([household, chargeScoped], null, null)?.id).toBe("arr-household");
    });

    it("another child's charge does not reach this child's arrangement", () => {
        expect(govern([child, chargeScoped], OTHER_CHILD, CHARGE)).toBeNull();
    });

    it("the rank is stated once, and charge outranks child outranks household", () => {
        expect(arrangementSpecificityRank(chargeScoped)).toBeGreaterThan(arrangementSpecificityRank(child));
        expect(arrangementSpecificityRank(child)).toBeGreaterThan(arrangementSpecificityRank(household));
    });

    it("applicability is asked of the charge, not inferred", () => {
        expect(arrangementAppliesTo(chargeScoped, CHILD, CHARGE)).toBe(true);
        expect(arrangementAppliesTo(chargeScoped, CHILD, OTHER_CHARGE)).toBe(false);
        expect(arrangementAppliesTo(chargeScoped, CHILD, null)).toBe(false);
    });

    it("a charge arrangement still respects its effective window", () => {
        const future = { ...chargeScoped, effectiveStart: "2027-01-01" };
        expect(pickGoverningArrangement([household, future], { customerMemberId: CHILD, chargeId: CHARGE, onDate: "2026-09-22" })?.id)
            .toBe("arr-household");
    });
});
