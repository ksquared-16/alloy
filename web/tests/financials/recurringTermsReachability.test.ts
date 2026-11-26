/**
 * AN OPERATOR CAN REACH A CHILD'S RECURRING TUITION TERMS (§1).
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────────────────
 *
 * `billing_preview` (AssignmentTuitionCard) owns acceptance of recurring pricing terms through
 * `enrollment.pricing.accept`. It declared no grain, so it fell to the case-only default and was
 * omitted from every CHILD-grain panel — which is exactly where enrolment pricing gets decided. The
 * consequence was not cosmetic: recurring billing had no operator entry point at all, and the QA
 * tenant therefore had no accepted terms and could generate nothing.
 *
 * Two things were wrong and both had to change: the card's grain declaration (here), and the
 * tenant's published layout, which never placed the card (fixed by publishing v159 through the
 * canonical append-only path).
 */
import { describe, expect, it } from "vitest";

import { cardGrains } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { DEFAULT_CARD_GRAINS, declarationAppliesToGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrainConcern";
import { ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";

describe("THE GATE — the pricing card reaches the child", () => {
    /* The defect, stated as the rule it broke. */
    it("composes at child grain as well as the case", () => {
        const grains = cardGrains("billing_preview");
        expect(grains, "the child is where enrolment pricing is decided").toContain("child");
        expect(grains, "and the case still carries it").toContain("opportunity");
    });

    /*
     * SILENCE NEVER WIDENS APPLICABILITY — that rule is correct and stays. What was wrong was
     * relying on it for a card that genuinely composes at both grains.
     */
    it("leaves the case-only default intact for cards that declare nothing", () => {
        expect(DEFAULT_CARD_GRAINS).toEqual(["opportunity"]);
        expect(declarationAppliesToGrain(undefined, "child"), "an undeclared card is still case-only").toBe(false);
    });

    /*
     * ── THE REACH MOVED, AND THE REACH IS WHAT THIS GUARDS ───────────────────────────────────
     *
     * This asserted that `billing_preview` stayed in the enrolment default composition, which was
     * the right lock while that card was the only way to reach recurring terms. Financials 11B
     * settled the product question the other way: tuition is part of an Assignment, not an
     * independent operational concept, and Assignment now owns Accept, Override, the options, the
     * accepted-term read-back, Billing Frequency, the periods, responsibility and the discount
     * forecast. The card is retired to the library, not deleted, and a tenant may still place it.
     *
     * So the requirement is unchanged and the lock now states it where it is actually met: an
     * operator must be able to reach a child's recurring tuition terms from the default
     * composition. That is `scheduling`, at the child grain.
     */
    it("keeps recurring terms reachable from the default composition, through Assignment", () => {
        expect(ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS, "Assignment is composed by default").toContain("scheduling");
        expect(cardGrains("scheduling"), "and at the grain where pricing is decided").toContain("child");
        /*
         * The retirement is deliberate, and stated — so re-adding the card by accident is a
         * decision someone has to make again rather than a drift nobody notices.
         */
        expect(ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS, "billing_preview is retired to the library")
            .not.toContain("billing_preview");
    });

    /* Retired from composition is not deleted: every authority it consumed is still registered. */
    it("keeps the card and its authorities available to a tenant that places it", () => {
        expect(cardGrains("billing_preview"), "the card still declares its grains").toContain("child");
    });

    /*
     * THE CARDS THAT ANSWER FOR AN ENROLLED CHILD travel together. Financials says what is owed,
     * Assignments what the child is enrolled in, and Billing Preview whether that enrolment is
     * priced — one question each, all three at the child.
     */
    it("carries the same grains as the cards it sits beside", () => {
        for (const key of ["financials", "scheduling"] as const) {
            expect(cardGrains(key), `${key} composes at the child`).toContain("child");
        }
    });
});
