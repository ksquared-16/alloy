import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
    ReservedFocusPanelCell,
    resolveReservedCellSettledReason,
} from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";

/**
 * OX J5 — A CELL THAT LEFT THE RESERVE IS NOT NECESSARILY A FACT THAT ARRIVED.
 *
 * `data-focus-panel-cell-reserved` drops for two different reasons that render identically: the card
 * resolved as not applicable to this record (an ANSWER), or the surface declared itself settled while
 * the card never became ready (the ABSENCE of one). A milestone that counts reserved cells scores the
 * second as ready, and that is measurable: two probes on the same deployed build reported cold T6 P50
 * ~960ms and ~1,291ms, a 331ms spread over one event.
 *
 * So the reason is declared. These hold the ORDER of the rule, which is the whole semantics, and the
 * fact that the declaration actually reaches the DOM — a rule the renderer drops is a rule nobody can
 * read.
 */
describe("reserved cell settled reason", () => {
    it("a resolved not-applicable card is an ANSWER, whatever the phase says", () => {
        expect(
            resolveReservedCellSettledReason({
                readiness: "not_applicable",
                phase: "commit",
                explicitlyReserved: false,
            }),
        ).toBe("not_applicable");
        // Resolution outranks the phase inference in BOTH directions, including when the cell is also
        // explicitly reserved — otherwise the answer would be withheld by a stale reserve.
        expect(
            resolveReservedCellSettledReason({
                readiness: "not_applicable",
                phase: "settled",
                explicitlyReserved: true,
            }),
        ).toBe("not_applicable");
    });

    it("a settled surface that never readied the card is UNRESOLVED, not an answer", () => {
        expect(
            resolveReservedCellSettledReason({ readiness: "reserved", phase: "settled", explicitlyReserved: false }),
        ).toBe("phase_settled_unresolved");
    });

    it("an EXPLICIT reserve outranks the phase inference", () => {
        // The positive statement "this cell is settling for the current subject" must survive a
        // settled surface; calling it resolved-empty asserts a fact about the record that is false.
        expect(
            resolveReservedCellSettledReason({ readiness: "reserved", phase: "settled", explicitlyReserved: true }),
        ).toBeNull();
    });

    it("still settling during commit is neither", () => {
        expect(
            resolveReservedCellSettledReason({ readiness: "reserved", phase: "commit", explicitlyReserved: true }),
        ).toBeNull();
        expect(
            resolveReservedCellSettledReason({ readiness: "reserved", phase: "commit", explicitlyReserved: false }),
        ).toBeNull();
    });

    it("the cell CARRIES its key and its reason into the DOM in every state", () => {
        const settling = renderToStaticMarkup(
            <ReservedFocusPanelCell typeKey="children" settledReason={null} readiness="reserved" cellSubject="subj-b" />,
        );
        expect(settling).toContain('data-focus-panel-cell-reserved="true"');
        expect(settling).toContain('data-focus-panel-cell-preparing="children"');
        expect(settling).toContain('data-focus-panel-cell-key="children"');
        expect(settling).not.toContain("data-focus-panel-cell-settled-reason");
        // The two facts a milestone needs and the geometry cannot supply: what readiness this cell
        // holds, and which subject's model it belongs to.
        expect(settling).toContain('data-focus-panel-cell-readiness="reserved"');
        expect(settling).toContain('data-focus-panel-cell-subject="subj-b"');

        const answered = renderToStaticMarkup(
            <ReservedFocusPanelCell
                typeKey="children"
                settledReason="not_applicable"
                readiness="not_applicable"
                cellSubject="subj-b"
            />,
        );
        expect(answered).toContain('data-focus-panel-cell-key="children"');
        expect(answered).toContain('data-focus-panel-cell-settled-reason="not_applicable"');
        expect(answered).not.toContain("data-focus-panel-cell-reserved");

        const unresolved = renderToStaticMarkup(
            <ReservedFocusPanelCell
                typeKey="household"
                settledReason="phase_settled_unresolved"
                readiness="reserved"
                cellSubject="subj-b"
            />,
        );
        expect(unresolved).toContain('data-focus-panel-cell-key="household"');
        expect(unresolved).toContain('data-focus-panel-cell-settled-reason="phase_settled_unresolved"');
        /*
         * The two settled states are indistinguishable to the OPERATOR by design — both are quiet
         * resolved-empty cells, and telling an operator "we gave up" would be worse than saying
         * nothing. They must be distinguishable to a READER, which is exactly what the reason is for.
         */
        expect(unresolved).not.toContain("data-focus-panel-cell-reserved");
        expect(unresolved).not.toContain("Resolving");
    });

    it("a cell that cannot name its subject omits the attribute rather than guessing", () => {
        // UNKNOWN is not ABSENT and it is certainly not "the current one". A cell whose model has no
        // subject must fail a subject-bound milestone, which it can only do by saying nothing.
        const nameless = renderToStaticMarkup(
            <ReservedFocusPanelCell typeKey="children" settledReason={null} readiness="reserved" cellSubject={null} />,
        );
        expect(nameless).toContain('data-focus-panel-cell-key="children"');
        expect(nameless).not.toContain("data-focus-panel-cell-subject");
    });

    it("the MOUNTED branch states the same three facts", () => {
        /*
         * Source-read rather than rendered: the mounted branch is a closure inside `renderCell`, and
         * reaching it needs a resolved composition, a published layout and a full work-mode model —
         * a fixture large enough that what it would really be testing is the fixture.
         *
         * This is a wiring guard and it is not the proof. The proof is the deployed probe: the
         * canonical milestone reads these three attributes and reports null when they are absent, so
         * an unwired mounted cell shows up as a milestone that never fires rather than as a pass.
         */
        const grid = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
            "utf8",
        );
        const mounted = grid.slice(grid.indexOf('data-focus-panel-cell-mounted'));
        expect(grid).toContain('data-focus-panel-cell-mounted="true"');
        expect(grid.slice(0, grid.indexOf('data-focus-panel-cell-mounted'))).toContain(
            "data-focus-panel-cell-readiness={readiness ?? undefined}",
        );
        expect(mounted.slice(0, 900)).toContain("FocusPanelCardRenderer");
        // The wrapper must not become a grid item of its own — the cell geometry is load-bearing.
        expect(grid).toContain('style={{ display: "contents" }}');
    });
});
