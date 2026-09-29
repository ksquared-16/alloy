// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";

/**
 * NO A TRUTH UNDER B — the frozen contract that had no fast guard.
 *
 * Law 7 of docs/platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md. Until now it was proven
 * only by browser certification (Gates B and D: 48 switches and an n=30 population, no wrong subject
 * and no mixed-subject frame) and defended structurally by latest-wins. Nothing failed fast if a
 * mixed frame came back, and the freeze census named that the most valuable guard missing.
 *
 * WHAT MAKES THIS LOAD-BEARING. The grid destructures EVERY rendering input — subject, cardModels,
 * cardReadiness, context, title — from the ONE `model` object it is handed, and stamps
 * `data-focus-panel-cell-subject` on every first-order cell in BOTH its branches (reserved and
 * mounted) from `model.subject.id`. That single-source property is the protection: no cell can be
 * labelled one subject while its siblings are labelled another, because there is no second place for
 * the label to come from. These render the real component and assert the property behaviourally, so
 * the realistic regressions fail here:
 *
 *   - a card-model or subject cache keyed by card key instead of by subject;
 *   - accumulating state across renders instead of replacing it;
 *   - stamping a cell from a separately-held committed/attended id while content comes from whatever
 *     arrived last;
 *   - dropping the stamp, which is what makes a mixed frame observable at all.
 *
 * Late-A ordering is modelled by RENDER ORDER, not wall clock: rendering A after B IS "A's work
 * finished late". Effects do not run under static rendering, so no state can be smuggled in and any
 * leak is attributable to the component.
 *
 * WHAT THIS DOES NOT COVER, stated so nobody reads more into it. A synthetic operational context does
 * not surface card-body truth — a deliberately mismatched `context.truth` produces no observable
 * token in the markup — so this cannot detect contamination *inside* a card body. The detector here is
 * subject IDENTITY across the frame, and the proof that it can fail is the mutation check recorded in
 * certification/closeout/NO-A-TRUTH-UNDER-B-PLANT.md, not a synthetic mixed model. Card-body truth
 * remains browser-certified by Gates B and D.
 *
 * PRIVACY: opaque subject ids only. No names, no business values.
 */

type GridModel = React.ComponentProps<typeof OpportunityFocusPanelModeGrid>["model"];

const SUBJECT_A = "opp-alpha";
const SUBJECT_B = "opp-bravo";

/** One committed model, as a producer hands it over: subject and cards are the same subject's. */
function buildModel(subjectId: string): GridModel {
    return {
        source: "drawer_vm",
        phase: "settled",
        mode: "summary",
        subject: { id: subjectId, type: "opportunity", label: subjectId },
        context: {
            grain: "opportunity",
            truth: { id: subjectId },
            subject: { id: subjectId, type: "opportunity" },
            capabilities: { canMutate: false, maskedChannels: false },
        },
        // One card ready so the MOUNTED branch is exercised too, not only the reserve.
        cardModels: new Map([
            [
                "household",
                {
                    key: "household",
                    archetype: "profile",
                    title: "Household",
                    insight: "—",
                    tier: "primary",
                    span: 1,
                    density: "standard",
                    visible: true,
                },
            ],
        ]),
        cardReadiness: new Map([["household", "ready"]]),
        commands: [],
        title: subjectId,
        statusLabel: null,
        canMutate: false,
        perspective: null,
        // The fixture states only the fields the grid reads; the cast is over the unstated rest of
        // the model contract, never over the fields under test.
    } as unknown as GridModel;
}

const render = (subjectId: string) =>
    renderToStaticMarkup(
        React.createElement(OpportunityFocusPanelModeGrid, {
            model: buildModel(subjectId),
            // Required by the component; a no-op here. Nothing in these cases drives a tab change —
            // the contract under test is what one committed frame RENDERS, not what it dispatches.
            onSelectTab: () => {},
        }),
    );

/** Every per-cell subject stamp in one rendered frame. */
const stamps = (html: string) =>
    [...html.matchAll(/data-focus-panel-cell-subject="([^"]*)"/g)].map((m) => m[1]);

describe("NO A TRUTH UNDER B", () => {
    it("the frame is OBSERVABLE — every first-order cell states its subject", () => {
        const html = render(SUBJECT_A);
        // Asserted first and in numbers: if the stamp were dropped, every assertion below would pass
        // vacuously and a mixed frame would be undetectable.
        const s = stamps(html);
        expect(s.length).toBeGreaterThan(1);
        expect(html).toContain('data-focus-panel-cell-mounted="true"'); // the mounted branch ran
        expect(html).toContain('data-focus-panel-cell-readiness="reserved"'); // and the reserve
    });

    it("ONE frame carries exactly ONE subject — no mixed-subject frame", () => {
        // The mixed-frame detector. Both grid branches render in this frame, so it covers a mounted
        // card and a reserved cell disagreeing with each other.
        expect(new Set(stamps(render(SUBJECT_A)))).toEqual(new Set([SUBJECT_A]));
        expect(new Set(stamps(render(SUBJECT_B)))).toEqual(new Set([SUBJECT_B]));
    });

    it("selecting B leaves NO trace of A's subject identity anywhere in the frame", () => {
        render(SUBJECT_A); // A is on screen
        const b = render(SUBJECT_B); // the operator selects B
        expect(new Set(stamps(b))).toEqual(new Set([SUBJECT_B]));
        // Whole-markup, not just the stamps: attributes, ids and any content that carries a subject id.
        expect(b).not.toContain(SUBJECT_A);
    });

    it("a LATE A result cannot reshape B", () => {
        const b1 = render(SUBJECT_B);
        render(SUBJECT_A); // A's work finishes late, after B committed
        const b2 = render(SUBJECT_B); // B is still what the operator asked for
        expect(new Set(stamps(b2))).toEqual(new Set([SUBJECT_B]));
        expect(b2).not.toContain(SUBJECT_A);
        // Byte-identical, not merely still-B: that is what rules out a partial reshape which kept the
        // right label. Any cross-render accumulation would diverge here.
        expect(b2).toBe(b1);
    });

    it("B-bound content remains B, and the latest selection remains B", () => {
        const b = render(SUBJECT_B);
        expect(stamps(b)).not.toContain(SUBJECT_A);
        expect(new Set(stamps(b))).toEqual(new Set([SUBJECT_B]));
        // The committed subject also reaches the mounted cell, not only the reserved ones — the two
        // branches are separate code paths and a regression can hit one of them alone.
        expect(b).toMatch(
            /data-focus-panel-cell-subject="opp-bravo"[^>]*data-focus-panel-cell-mounted="true"/,
        );
    });
});
