import { describe, expect, it } from "vitest";
import {
    DECISION_OUTCOMES,
    isValidReasonCode,
    resolveAvailableOutcomes,
    resolveDecisionOutcomeSpec,
    resolveOutcomeReasons,
} from "@/lib/pos/decisionOutcomes";

describe("decisionOutcomes (§2)", () => {
    it("offers the five non-approval outcomes; approve is never among them", () => {
        expect(DECISION_OUTCOMES).toEqual(["rejected", "needs_more_information", "unresolved", "duplicate", "cancelled"]);
        expect(DECISION_OUTCOMES).not.toContain("approved");
    });

    it("reject and cancel require a reason; unresolved and duplicate do not", () => {
        expect(resolveDecisionOutcomeSpec("rejected").requiresReason).toBe(true);
        expect(resolveDecisionOutcomeSpec("cancelled").requiresReason).toBe(true);
        expect(resolveDecisionOutcomeSpec("needs_more_information").requiresReason).toBe(true);
        expect(resolveDecisionOutcomeSpec("unresolved").requiresReason).toBe(false);
        expect(resolveDecisionOutcomeSpec("duplicate").requiresReason).toBe(false);
    });

    it("terminal outcomes (reject/duplicate/cancel) close; needs-info/unresolved stay active", () => {
        expect(resolveDecisionOutcomeSpec("rejected").terminal).toBe(true);
        expect(resolveDecisionOutcomeSpec("duplicate").terminal).toBe(true);
        expect(resolveDecisionOutcomeSpec("cancelled").terminal).toBe(true);
        expect(resolveDecisionOutcomeSpec("needs_more_information").terminal).toBe(false);
        expect(resolveDecisionOutcomeSpec("unresolved").terminal).toBe(false);
    });

    it("canonical fallback reasons are generic — not enrollment-specific", () => {
        const all = DECISION_OUTCOMES.flatMap((o) => resolveOutcomeReasons(o).map((r) => `${r.code} ${r.label}`)).join(" ");
        expect(all.toLowerCase()).not.toMatch(/enroll|waitlist|tour|lead|child|toddler|classroom/);
    });

    it("configured reason set overrides the fallback for that outcome only", () => {
        const config = { rejected: [{ code: "capacity_full", label: "Program at capacity" }] };
        const rejectReasons = resolveOutcomeReasons("rejected", config);
        expect(rejectReasons).toEqual([{ code: "capacity_full", label: "Program at capacity" }]);
        // Other outcomes still use the canonical fallback.
        expect(resolveOutcomeReasons("cancelled", config).some((r) => r.code === "entered_in_error")).toBe(true);
        expect(isValidReasonCode("rejected", "capacity_full", config)).toBe(true);
        expect(isValidReasonCode("rejected", "not_a_fit", config)).toBe(false);
    });

    it("resolveAvailableOutcomes can be restricted to the configured set for a BP+Stage", () => {
        const specs = resolveAvailableOutcomes({ allowedOutcomes: ["rejected", "duplicate"] });
        expect(specs.map((s) => s.outcome)).toEqual(["rejected", "duplicate"]);
        // Default (no config) offers all five.
        expect(resolveAvailableOutcomes().map((s) => s.outcome)).toEqual(DECISION_OUTCOMES);
    });

    it("no outcome except approve is marked as mutating — enforced by omission (this module has no commit path)", () => {
        // Sanity: none of the specs expose a canonical-mutation flag; the commit engine is invoked
        // only by the separate Approve path, never from an outcome record.
        for (const o of DECISION_OUTCOMES) {
            expect(Object.keys(resolveDecisionOutcomeSpec(o))).not.toContain("mutatesCanonical");
        }
    });
});
