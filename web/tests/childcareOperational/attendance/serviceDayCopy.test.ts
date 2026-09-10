/**
 * The words the operator reads.
 *
 * Two surfaces describe the same child, so the wording lives in one place and is
 * pinned here. The rules that matter: an unexpected arrival never reads as an
 * ordinary one, an unresolvable plan never reads as fine, and nothing on this
 * screen speaks the vocabulary of the layer underneath.
 */

import { describe, expect, it } from "vitest";
import {
    CHILD_AWAY_REASONS,
    CLOSURE_REASONS,
    serviceDayChipLabel,
    serviceDayReasonLabel,
    serviceDayStateSentence,
    serviceDayTone,
} from "@/lib/childcareOperational/attendance/serviceDayCopy";
import type { ServiceDayState } from "@/lib/childcareOperational/attendance/serviceDayExpectations";

const ALL_STATES: ServiceDayState[] = [
    "here_now",
    "checked_out",
    "known_away",
    "closed",
    "not_arrived",
    "attended_despite_plan",
    "unknown",
];

describe("a child who was not expected is not described as ordinary", () => {
    it("says she is here AND that nobody expected her", () => {
        const sentence = serviceDayStateSentence({ state: "attended_despite_plan", reasonKey: "vacation" });
        expect(sentence.toLowerCase()).toContain("here");
        expect(sentence.toLowerCase()).toContain("holiday");
    });

    it("still says she is here when nobody recorded a reason", () => {
        expect(serviceDayStateSentence({ state: "attended_despite_plan" }).toLowerCase()).toContain("not expected");
    });

    it("gives her a tone that draws the eye without crying wolf", () => {
        expect(serviceDayTone("attended_despite_plan")).toBe("attention");
    });
});

describe("an unresolvable plan never reads as fine", () => {
    it("says plainly that the plan could not be read", () => {
        expect(serviceDayStateSentence({ state: "unknown" }).toLowerCase()).toContain("unclear");
    });

    it("is never given a healthy tone", () => {
        expect(serviceDayTone("unknown")).not.toBe("present");
        expect(serviceDayTone("unknown")).toBe("unknown");
    });
});

describe("a known absence is not an alarm", () => {
    it("reads as the reason itself", () => {
        expect(serviceDayStateSentence({ state: "known_away", reasonKey: "illness" })).toBe("Off sick");
        expect(serviceDayStateSentence({ state: "known_away", reasonKey: "vacation" })).toBe("On holiday");
    });

    it("says something true when nobody was told why", () => {
        expect(serviceDayStateSentence({ state: "known_away", reasonKey: "unspecified" })).toBe("Not in today");
        expect(serviceDayStateSentence({ state: "known_away" })).toBe("Not in today");
    });

    it("settles rather than alarms", () => {
        expect(serviceDayTone("known_away")).toBe("settled");
        expect(serviceDayTone("closed")).toBe("settled");
        // Whereas a child nobody explained might mean a phone call.
        expect(serviceDayTone("not_arrived")).toBe("attention");
    });

    it("tidies an unrecognised reason rather than hiding it", () => {
        expect(serviceDayReasonLabel("court_hearing")).toBe("Court hearing");
        expect(serviceDayReasonLabel("  ")).toBeNull();
    });
});

describe("nothing on this screen speaks the layer underneath", () => {
    const FORBIDDEN = ["prohibit", "modality", "standing", "temporal", "ledger", "expectation", "lineage", "tuple"];

    it("keeps internal vocabulary out of every state sentence", () => {
        for (const state of ALL_STATES) {
            for (const reasonKey of [null, "illness", "holiday_closure", "unspecified"]) {
                const text = `${serviceDayStateSentence({ state, reasonKey })} ${serviceDayChipLabel(state, reasonKey)}`;
                for (const word of FORBIDDEN) {
                    expect(text.toLowerCase()).not.toContain(word);
                }
            }
        }
    });

    it("keeps it out of the reason lists an operator picks from", () => {
        for (const r of [...CHILD_AWAY_REASONS, ...CLOSURE_REASONS]) {
            for (const word of FORBIDDEN) {
                expect(r.label.toLowerCase()).not.toContain(word);
            }
        }
    });

    it("has a phrase for every state the projection can produce", () => {
        // A state with no wording renders as an empty chip, which reads as
        // "nothing to see here" — the one thing an unknown state must never say.
        for (const state of ALL_STATES) {
            expect(serviceDayStateSentence({ state }).trim().length).toBeGreaterThan(0);
            expect(serviceDayChipLabel(state).trim().length).toBeGreaterThan(0);
        }
    });
});
