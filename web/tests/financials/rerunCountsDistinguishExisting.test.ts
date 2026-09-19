/**
 * A RERUN THAT CREATES NOTHING MUST NOT READ AS BILLING.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `writeTemplateDraftCharge` has always answered `created` / `recalculated` / `unchanged`, and the
 * generator threw that answer away and called all three "generated". Measured: running September
 * twice reported `generated: 5` both times while the ledger held five rows, not ten. The data was
 * right; an operator reading the result would have believed they billed the family twice.
 *
 * `already_posted` is a different thing again — settled money that generation refuses to touch —
 * and it was already distinguished. What was missing was the line between work done and work that
 * had already been done.
 */
import { describe, expect, it } from "vitest";

import {
    tallyTuitionOutcomes,
    tuitionOutcomeKindForDraftStatus,
    type TuitionGenerationOutcome,
} from "@/lib/financials/tuitionGeneration/generateTuitionCharges";

describe("THE GATE — the draft writer's own answer is honoured", () => {
    it("calls a converged draft unchanged, not generated", () => {
        expect(tuitionOutcomeKindForDraftStatus("unchanged")).toBe("unchanged");
    });

    /* Work this run actually did — a new draft, or an existing one moved to a new amount. */
    it("calls a created or recalculated draft generated", () => {
        expect(tuitionOutcomeKindForDraftStatus("created")).toBe("generated");
        expect(tuitionOutcomeKindForDraftStatus("recalculated")).toBe("generated");
    });

    /*
     * An unknown or absent status is reported as generated, because the charge id that reached this
     * point proves a draft exists — understating work is a smaller lie than claiming a row converged
     * when nothing said so.
     */
    it("does not invent convergence from silence", () => {
        expect(tuitionOutcomeKindForDraftStatus(null)).toBe("generated");
        expect(tuitionOutcomeKindForDraftStatus(undefined)).toBe("generated");
    });
});

describe("THE GATE — the tally keeps them apart", () => {
    const outcome = (kind: TuitionGenerationOutcome["kind"], i: number) =>
        ({
            kind, assignmentId: `a-${i}`, periodKey: "2026-09", periodLabel: "September 2026",
            termId: "t-1", chargeId: `c-${i}`, amountCents: 18_500, currencyCode: "USD",
            obligationId: null, reason: "r", detail: "d", message: "m",
        }) as unknown as TuitionGenerationOutcome;

    it("counts a rerun as zero newly generated and five already existing", () => {
        const counts = tallyTuitionOutcomes([0, 1, 2, 3, 4].map((i) => outcome("unchanged", i)));
        expect(counts.generated).toBe(0);
        expect(counts.unchanged).toBe(5);
    });

    it("counts a first run as five generated and none existing", () => {
        const counts = tallyTuitionOutcomes([0, 1, 2, 3, 4].map((i) => outcome("generated", i)));
        expect(counts.generated).toBe(5);
        expect(counts.unchanged).toBe(0);
    });

    /* A mixed run — one new week, four converged — must report exactly that. */
    it("keeps a mixed run honest in both directions", () => {
        const counts = tallyTuitionOutcomes([
            outcome("generated", 0),
            ...[1, 2, 3, 4].map((i) => outcome("unchanged", i)),
            outcome("already_posted", 5),
            outcome("not_due", 6),
            outcome("refused", 7),
            outcome("error", 8),
        ]);
        expect(counts).toEqual({ generated: 1, unchanged: 4, alreadyPosted: 1, notDue: 1, refused: 1, errors: 1 });
    });

    /* `unchanged` is never folded back into `generated` by any other name. */
    it("never counts an existing draft as billed", () => {
        expect(tallyTuitionOutcomes([outcome("unchanged", 0)]).generated).toBe(0);
    });
});
