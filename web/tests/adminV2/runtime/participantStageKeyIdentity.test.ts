/**
 * PARTICIPANT STAGE IDENTITY — the key a rail places by, kept separate from the label a human reads.
 *
 * Matching a participant to a stage by display string means stripping suffixes until "Waitlisted"
 * and "Waitlist" agree. That works until someone rewords a label, at which point a real child
 * silently stops appearing at the stage they are actually at. These tests hold the key and the label
 * apart, and hold the key to the SAME resolution chain the label uses — otherwise a child could be
 * labelled with one stage and placed at another, or labelled and not placed at all.
 */

import { describe, expect, it } from "vitest";

import {
    resolveChildProcessStageKey,
    resolveChildProcessStageLabel,
} from "@/lib/lifecycle/childEnrollmentProcessStageLabel";

describe("child process stage key", () => {
    it("comes from the child's own canonical stage_key when present", () => {
        expect(resolveChildProcessStageKey({ stageKey: "waitlist" })).toBe("waitlist");
        expect(resolveChildProcessStageKey({ stageKey: "tour" })).toBe("tour");
    });

    it("is a KEY, never the label — and the two differ in exactly the way that breaks matching", () => {
        // `lead` → "New Lead" and `closed_withdrawn` → "Closed / Withdrawn": the label is not a
        // reformatting of the key, so no normalization rule recovers one from the other.
        expect(resolveChildProcessStageKey({ stageKey: "lead" })).toBe("lead");
        expect(resolveChildProcessStageLabel({ stageKey: "lead" })).toBe("New Lead");
        expect(resolveChildProcessStageKey({ stageKey: "closed_withdrawn" })).toBe("closed_withdrawn");
        expect(resolveChildProcessStageLabel({ stageKey: "closed_withdrawn" })).toBe("Closed / Withdrawn");

        for (const key of ["lead", "waitlist", "closed_withdrawn"]) {
            expect(resolveChildProcessStageLabel({ stageKey: key })).not.toBe(
                resolveChildProcessStageKey({ stageKey: key }),
            );
        }
    });

    it("resolves through the SAME chain as the label, so a child is never labelled yet unplaceable", () => {
        // Stage known only through the disposition — a real, placeable stage.
        const viaDisposition = { dispositionKey: "waitlisted" };
        expect(resolveChildProcessStageLabel(viaDisposition)).toBe("Waitlist");
        expect(resolveChildProcessStageKey(viaDisposition)).toBe("waitlist");

        // Stage known only from the family it rides (brand-new lead).
        const viaFamily = { familyStageKey: "tour" };
        expect(resolveChildProcessStageLabel(viaFamily)).toBeTruthy();
        expect(resolveChildProcessStageKey(viaFamily)).toBe("tour");
    });

    it("prefers the child's own stage over the family's — divergence is the point", () => {
        // The case is at Tour; this child is at Waitlist. The child's own key must win, or the rail
        // would show every participant sitting on the case marker and divergence would vanish.
        expect(resolveChildProcessStageKey({ stageKey: "waitlist", familyStageKey: "tour" })).toBe(
            "waitlist",
        );
    });

    it("returns null for an unknown stage rather than inventing one", () => {
        expect(resolveChildProcessStageKey({})).toBeNull();
        expect(resolveChildProcessStageKey({ stageKey: "   " })).toBeNull();
        // A key that is not part of the configured vocabulary is UNRESOLVED, not passed through:
        // placing a marker by an unrecognised key would assert a stage the rail cannot honour.
        expect(resolveChildProcessStageKey({ stageKey: "not_a_real_stage" })).toBeNull();
        expect(resolveChildProcessStageKey({ dispositionKey: "invented_disposition" })).toBeNull();
    });

    it("an unmapped disposition falls through to the family stage, not to silence", () => {
        expect(
            resolveChildProcessStageKey({ dispositionKey: "invented", familyStageKey: "lead" }),
        ).toBe("lead");
    });
});
