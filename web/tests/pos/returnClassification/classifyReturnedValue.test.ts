import { describe, expect, it } from "vitest";

import {
    classifyReturnedValue,
    sameCanonicalValue,
    staleStateFor,
    summarizeReturnedValueClassifications,
} from "@/lib/pos/processingCase/returnClassification/classifyReturnedValue";

/**
 * A FAMILY RE-ANSWERS WHAT ALLOY ALREADY KNOWS.
 *
 * A three-form packet collects the child's name three times. Every one of those answers is the
 * value already on file, and shown as a flat list of "proposed values" all of it reads as a change.
 * An operator asked to approve thirty changes when two are real approves all thirty.
 *
 * The distinction existed only inside the commit planner, which discovered "already applied" after
 * the operator had decided. These pin it where review can see it, and pin the refusals that must
 * never quietly become writes.
 */

const base = { hasCanonicalBinding: true } as const;

describe("what a returned value means next to canonical truth", () => {
    it("UNCHANGED — the family confirmed what we hold", () => {
        const r = classifyReturnedValue({ ...base, canonicalCurrentValue: "Certopp", participantValue: "Certopp" });
        expect(r.classification).toBe("unchanged");
        expect(r.staleState).toBe("already_applied");
    });

    it("CHANGED — canonical truth holds something else", () => {
        const r = classifyReturnedValue({ ...base, canonicalCurrentValue: "418 Maple Court", participantValue: "22 Elm Street" });
        expect(r.classification).toBe("changed");
    });

    it("NEW — canonical truth holds nothing", () => {
        for (const empty of [null, undefined === undefined ? "" : "", "   "]) {
            const r = classifyReturnedValue({ ...base, canonicalCurrentValue: empty, participantValue: "Dana" });
            expect(r.classification).toBe("new");
        }
    });

    it("FORM-ONLY — the answer names no canonical destination", () => {
        const r = classifyReturnedValue({ hasCanonicalBinding: false, participantValue: "Aunt" });
        expect(r.classification).toBe("form_only");
        // It is not compared against anything, because there is nothing to compare it to.
        expect(r.staleState).toBeNull();
    });

    it("REFUSED — an unreadable owner is never reported as new", () => {
        /*
         * The dangerous confusion: "I could not read the record" and "the record is empty" look the
         * same to a naive comparison, and calling the first one `new` invites an operator to create
         * something that may already exist. A relationship-owned value reaches this branch, because
         * its owner is not the child row.
         */
        const r = classifyReturnedValue({ ...base, canonicalCurrentValue: undefined, participantValue: "Dana" });
        expect(r.classification).toBe("refused");
        expect(r.classification).not.toBe("new");
        expect(r.refusalReason).toMatch(/could not be read/i);
    });

    it("REFUSED — diagnostics that mean 'we cannot place this' win over any comparison", () => {
        for (const code of ["inaccessible_record", "org_boundary", "duplicate_instance_key", "unknown_provider"] as const) {
            const r = classifyReturnedValue({
                ...base,
                canonicalCurrentValue: "Pathb",
                participantValue: "Pathb",
                diagnostics: [{ code, message: `blocked: ${code}` }],
            });
            // Even an identical value is refused — the refusal is about placement, not equality.
            expect(r.classification).toBe("refused");
        }
    });

    it("REFUSED — an invalid or unsupported proposal never classifies as a change", () => {
        expect(classifyReturnedValue({ ...base, canonicalCurrentValue: "a", participantValue: "b", proposalStatus: "invalid" }).classification).toBe("refused");
        expect(classifyReturnedValue({ ...base, canonicalCurrentValue: "a", participantValue: "b", proposalStatus: "unsupported" }).classification).toBe("refused");
    });

    it("an empty string and a null are the same absence", () => {
        // A form returns "" where a record holds null. Treating that as a change would make every
        // untouched optional field look edited.
        expect(sameCanonicalValue(null, "")).toBe(true);
        expect(classifyReturnedValue({ ...base, canonicalCurrentValue: null, participantValue: "" }).classification).toBe("unchanged");
    });
});

describe("the planner's freshness rule, unchanged by the move", () => {
    it("already applied, stale conflict, clean", () => {
        expect(staleStateFor("x", undefined, "x")).toBe("already_applied");
        expect(staleStateFor("now", "then", "next")).toBe("stale_conflict");
        expect(staleStateFor("now", "now", "next")).toBe("clean");
        expect(staleStateFor("now", undefined, "next")).toBe("clean");
    });
});

describe("re-registration reads the same five answers", () => {
    it("counts up into the sentence a summary needs", () => {
        /*
         * "The family confirmed most of their information and changed their address and emergency
         * contact" is this count, not a separate model. Proving the shape here is what lets
         * Re-registration be built later without a second vocabulary.
         */
        const counts = summarizeReturnedValueClassifications([
            "unchanged", "unchanged", "unchanged", "unchanged",
            "changed", "changed",
            "new",
            "form_only",
            "refused",
        ]);
        expect(counts).toEqual({ unchanged: 4, changed: 2, new: 1, form_only: 1, refused: 1 });
        expect(counts.unchanged).toBeGreaterThan(counts.changed);
    });
});
