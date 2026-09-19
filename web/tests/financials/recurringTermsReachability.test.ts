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

    /* It was always meant to be visible on an enrolment; only the grain kept it away. */
    it("stays in the enrolment default composition", () => {
        expect(ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS).toContain("billing_preview");
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
