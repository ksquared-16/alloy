import { describe, expect, it } from "vitest";

import {
    FOCUS_PANEL_SUMMARY_CHILD_COMPOSITION,
    FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION,
    FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION,
    focusPanelDefaultCompositionForGrain,
    focusPanelSummaryGridForGrain,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { focusPanelSummaryDefaultDocForGrain, FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";

/**
 * R-017 — a child seen through a family lens keeps the enrollment operating context.
 *
 * Two subjects are both `child` and are NOT the same situation. A durable child opened
 * subject-first has no Opportunity and no lens, so nothing family-scoped is authoritative. A child
 * selected from an Enrollment lens sits behind a settled family opportunity —
 * `overlayChildMissionOntoSettledFocusModel` states it: "Record of Attention = child. Record of
 * Truth / Settlement = family opportunity."
 *
 * The distinction is therefore CONTEXT, not grain. Making it a grain would have re-litigated
 * `cardAppliesToGrain` and handed family cards to every child — including a standalone one.
 */

const keys = (c: readonly { key: string }[]) => c.map((e) => e.key);
const visible = (c: readonly { key: string; visibility: string }[]) =>
    c.filter((e) => e.visibility === "visible").map((e) => e.key);

/*
 * `children` is deliberately absent from this list.
 *
 * It is family-scoped ON A CASE, where it renders a family's roster, and it is child-scoped on a
 * child record, where the collection holds the subject alone. One card, two truthful collections —
 * so "does the standalone child composition avoid family cards" cannot be asked about it by key.
 * The cards that are family-scoped in EVERY reading are the two below.
 */
const FAMILY_SCOPED = ["household", "billing_preview"] as const;

describe("a standalone durable child stays sparse", () => {
    it("KEEPS its identity card — the configured child card, with nothing family-scoped beside it", () => {
        const composition = focusPanelDefaultCompositionForGrain("child");
        expect(keys(composition)).toEqual(["children"]);
        for (const familyCard of FAMILY_SCOPED) expect(keys(composition)).not.toContain(familyCard);
        expect(keys(composition)).not.toContain("current_work");
    });

    it("is what an absent context resolves to — the safe default is the sparse one", () => {
        expect(focusPanelDefaultCompositionForGrain("child")).toBe(FOCUS_PANEL_SUMMARY_CHILD_COMPOSITION);
        expect(focusPanelDefaultCompositionForGrain("child", {})).toBe(FOCUS_PANEL_SUMMARY_CHILD_COMPOSITION);
        expect(focusPanelDefaultCompositionForGrain("child", { familySettlement: false })).toBe(
            FOCUS_PANEL_SUMMARY_CHILD_COMPOSITION,
        );
    });
});

describe("a child with family settlement keeps the enrollment context", () => {
    const composition = focusPanelDefaultCompositionForGrain("child", { familySettlement: true });

    it("selects the child-with-family composition", () => {
        expect(composition).toBe(FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION);
    });

    it("carries Current Work, so What's Next and its command grammar are available", () => {
        // Message / Send form / Tour are launched from the What's Next card, so Tour, Forms and
        // Communications arrive with it rather than needing their own cards.
        expect(visible(composition)).toContain("current_work");
        expect(composition.find((e) => e.key === "current_work")?.tier).toBe("work");
    });

    it("keeps Children — a child subject scopes that card, never removes it", () => {
        expect(visible(composition)).toContain("children");
    });

    it("keeps Household as family context", () => {
        expect(visible(composition)).toContain("household");
    });

    it("keeps Billing Preview family-scoped and de-prioritised, not child-owned", () => {
        const billing = composition.find((e) => e.key === "billing_preview")!;
        expect(billing.tier).toBe("context");
        expect(billing.encodedDensity).toBe("compact");
        // Current Work leads; billing closes the surface.
        const rowOf = (k: string) => composition.find((e) => e.key === k)!.area!.rowStart;
        expect(rowOf("billing_preview")).toBeGreaterThan(rowOf("current_work"));
    });

    it("does NOT add a standalone child identity card", () => {
        // The focused child is already stated by the Focus Panel header and by the Children card,
        // which names him, marks him active and carries DOB/program/context. A third presentation
        // of the same facts is redundant product chrome and a second place to maintain child truth.
        expect(keys(composition)).not.toContain("child_identity");
    });

    it("represents the focused child through Children, not a card of its own", () => {
        expect(visible(composition)).toContain("children");
        expect(visible(composition)).toEqual([
            "current_work",
            "household",
            "children",
            // The child's operating day and the family account, both added as production verticals
            // closed. The guard's point is that `child_identity` is ABSENT — the focused child is
            // represented through Children — not that this list never grows.
            "attendance",
            "scheduling",
            "financials",
            "billing_preview",
        ]);
    });

    it("composes Assignments, the destination the Children placement links resolve to", () => {
        // `DEFAULT_LINK_DESTINATIONS` maps inquiry_child.program / schedule / start_date to
        // `scheduling`. Without it in the composition the card is absent from `focusTargets`,
        // and `navigateIdentityFieldLink` returns `destination_unavailable` — the affordance
        // renders and does nothing.
        expect(visible(composition)).toContain("scheduling");
    });

    it("keeps Tour and Communications reachable as linked destinations", () => {
        const linked = composition.filter((e) => e.visibility === "linked").map((e) => e.key);
        expect(linked).toContain("tour_summary");
        expect(linked).toContain("communications");
    });
});

describe("the other grains are unchanged", () => {
    it("case/family composition is the SAME object reference it always was", () => {
        expect(focusPanelDefaultCompositionForGrain("opportunity")).toBe(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION);
        // Family settlement is the case grain's ordinary condition and must not alter it.
        expect(focusPanelDefaultCompositionForGrain("opportunity", { familySettlement: true })).toBe(
            FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION,
        );
        expect(focusPanelSummaryDefaultDocForGrain("opportunity")).toBe(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        expect(focusPanelSummaryDefaultDocForGrain("opportunity", { familySettlement: true })).toBe(
            FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
        );
    });

    it("staff/person NEVER receives enrollment family cards, whatever the context says", () => {
        for (const context of [undefined, {}, { familySettlement: true }]) {
            const person = keys(focusPanelDefaultCompositionForGrain("person", context));
            for (const familyCard of FAMILY_SCOPED) expect(person).not.toContain(familyCard);
            expect(person).not.toContain("current_work");
            expect(person).not.toContain("child_identity");
        }
    });
});

describe("the composed layout is plannable", () => {
    it("gives no card all 12 columns", () => {
        // A full-width card cannot be planned into lanes and forces `planPublishedLayout` to fall
        // back from `lanes` to `grid` for the WHOLE panel, moving every other card with it.
        for (const entry of FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION) {
            if (entry.area) expect(entry.area.colSpan).toBeLessThan(12);
        }
    });

    it("places every visible card in the grid, and only visible cards", () => {
        const grid = focusPanelSummaryGridForGrain("child", { familySettlement: true });
        expect(grid.areas.map((a) => a.card).sort()).toEqual(
            visible(FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION).sort(),
        );
    });

    it("does not overlap two cards on the same cell", () => {
        const grid = focusPanelSummaryGridForGrain("child", { familySettlement: true });
        const occupied = new Set<string>();
        for (const a of grid.areas) {
            for (let c = a.colStart; c < a.colStart + a.colSpan; c++) {
                for (let r = a.rowStart; r < a.rowStart + a.rowSpan; r++) {
                    const cell = `${c}:${r}`;
                    expect(occupied.has(cell)).toBe(false);
                    occupied.add(cell);
                }
            }
        }
    });

    it("builds a distinct doc for the settled-child context", () => {
        const sparse = focusPanelSummaryDefaultDocForGrain("child");
        const settled = focusPanelSummaryDefaultDocForGrain("child", { familySettlement: true });
        expect(settled).not.toBe(sparse);
        expect(settled.sections.length).toBeGreaterThan(sparse.sections.length);
    });
});
