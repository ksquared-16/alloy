import { describe, expect, it } from "vitest";

import {
    composeContextualFocusAnswer,
    hasOperatorSelectedWorkView,
    type ContextualFocusInput,
} from "@/lib/runtime/provisioning/contextualFocusAnswer";

/**
 * OPENING A PERSON IS NOT ENTERING A COHORT.
 *
 * The live defect: `Kelly → Household` resolves the household case, whose host Work Unit is a
 * builder-owned stage unit, and the operator is shown `New` as selected. They chose a person, not a
 * cohort — but the runtime's lens resolution reads
 *
 *     findWorkViewById(views, requested) ?? firstVisibleWorkView(views)
 *
 * so "no lens requested" and "the first lens" are the same input. These pin the state that makes the
 * difference expressible.
 */

const base = (over: Partial<ContextualFocusInput> = {}): ContextualFocusInput => ({
    orgId: "org-1",
    workUnit: {
        // A builder-owned stage unit — valid HOSTING infrastructure. Hosting is not selection.
        id: "wu-1",
        key: "lifecycle_wu_lead",
        name: "New Leads",
        departmentId: "dept-1",
    },
    businessProcess: { key: "enrollment", name: "Enrollment" },
    lensSet: [
        { id: "new_leads", label: "New", displayOrder: 1 },
        { id: "all_work", label: "All", displayOrder: 2 },
    ],
    recordOfTruth: { entityType: "opportunities", id: "opp-kurzman" },
    subject: { id: "person-kelly", grain: "case", subjectType: "opportunity" },
    aspect: { cardKey: "household", itemId: "person-kelly" },
    startedAt: 0,
    now: () => 12,
    ...over,
});

const answerOf = (over: Partial<ContextualFocusInput> = {}) => {
    const result = composeContextualFocusAnswer(base(over));
    if (!result.ok) throw new Error(`expected a contextual answer: ${result.reason}`);
    return result.answer;
};

describe("contextual focus states the ABSENCE of a lens", () => {
    it("carries NO active Work View — explicitly null, never a placeholder", () => {
        // The single assertion this whole capability exists for.
        const answer = answerOf();
        expect(answer.terminal).toBe("contextual");
        expect(answer.activeWorkView).toBeNull();
    });

    it("does not fabricate a lens from the host unit's first view", () => {
        // `new_leads` is first in the lens set and is the unit's default. It must NOT leak in.
        const answer = answerOf();
        expect(JSON.stringify(answer)).not.toContain('"activeWorkView":{');
        expect(hasOperatorSelectedWorkView(answer)).toBe(false);
    });

    it("still offers the cohorts the operator MAY choose next", () => {
        // Offering a choice is not making it. Without this the operator would be stranded in a
        // context with no way into operational work.
        expect(answerOf().lensSet.map((l) => l.id)).toEqual(["new_leads", "all_work"]);
    });

    it("keeps the builder-owned unit as HOST without implying selection", () => {
        // Hosting truth and cohort truth are different facts. The unit is legitimately where the
        // record lives; that says nothing about what the operator selected.
        const answer = answerOf();
        expect(answer.workUnit.key).toBe("lifecycle_wu_lead");
        expect(answer.activeWorkView).toBeNull();
    });

    it("names the subject the operator asked for, not one chosen from a page", () => {
        // `recordOfAttention` is deliberately absent: it means "the subject the evaluated page
        // yielded". Here the operator named the subject, so there is no page and no strategy.
        const answer = answerOf();
        expect(answer.subject.id).toBe("person-kelly");
        expect(answer).not.toHaveProperty("recordOfAttention");
        expect(answer).not.toHaveProperty("rows");
        expect(answer).not.toHaveProperty("rowGrain");
        expect(answer).not.toHaveProperty("contextFrame");
    });

    it("separates host record from subject", () => {
        // Kelly is the subject; the Kurzman case is what the panel composes against. Collapsing them
        // is the same class of error the Work View row identity work removed.
        const answer = answerOf();
        expect(answer.recordOfTruth.id).toBe("opp-kurzman");
        expect(answer.subject.id).toBe("person-kelly");
        expect(answer.recordOfTruth.id).not.toBe(answer.subject.id);
    });

    it("carries the ASPECT the operator asked for", () => {
        expect(answerOf().aspect).toEqual({ cardKey: "household", itemId: "person-kelly" });
    });

    it("an ASPECT with no card is dropped rather than half-carried", () => {
        // The card is what makes the item addressable; an item alone is not an aspect, and passing a
        // shape the panel has to guess at is how silent mis-focus starts.
        expect(answerOf({ aspect: { cardKey: "  ", itemId: "person-kelly" } }).aspect).toBeNull();
        expect(answerOf({ aspect: null }).aspect).toBeNull();
    });

    it("a card with no item focuses the CARD", () => {
        expect(answerOf({ aspect: { cardKey: "household", itemId: null } }).aspect).toEqual({
            cardKey: "household",
            itemId: null,
        });
    });
});

describe("contextual focus refuses rather than degrades", () => {
    it("no host record ⇒ refusal, not a half-composed panel", () => {
        const result = composeContextualFocusAnswer(
            base({ recordOfTruth: { entityType: "opportunities", id: "  " } }),
        );
        expect(result.ok).toBe(false);
    });

    it("no named subject ⇒ refusal", () => {
        // Without a subject this would silently become "open the host", which is a different intent
        // and exactly the kind of substitution the runtime refuses elsewhere.
        const result = composeContextualFocusAnswer(
            base({ subject: { id: "", grain: "case", subjectType: "opportunity" } }),
        );
        expect(result.ok).toBe(false);
    });
});

describe("the selection predicate is a single reading", () => {
    it("an operational answer HAS a selected view; a contextual one does not", () => {
        // The pill strip, the URL projection and any surface chrome must not disagree about whether
        // to mark something selected, so they share this one predicate.
        expect(hasOperatorSelectedWorkView({ activeWorkView: { id: "new_leads" } })).toBe(true);
        expect(hasOperatorSelectedWorkView(answerOf())).toBe(false);
        expect(hasOperatorSelectedWorkView(null)).toBe(false);
        expect(hasOperatorSelectedWorkView(undefined)).toBe(false);
    });
});
