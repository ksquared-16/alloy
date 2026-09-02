/**
 * The anchor changes where a journey POINTS. It must not change what the journey REQUIRES.
 *
 * A context-free enrolment and an opportunity-backed one are the same kind of thing: a child, a
 * packet, a set of Form requirements. If converging the anchor let the two paths disagree about
 * which requirements exist or whether they are satisfied, the defect would show up as a family being
 * asked for different paperwork than the family next to them — and only in production, because both
 * paths pass their own tests in isolation.
 *
 * So the property is PARITY, asserted by running the same requirements through both shapes and
 * comparing, rather than by asserting each path's answer separately and trusting they match.
 */

import { describe, expect, it } from "vitest";

import {
    evaluateEnrollmentCompletionSufficiency,
} from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import {
    ENROLLMENT_CONTEXT_TYPE,
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
} from "@/lib/process/processInstances";

/** Five Form requirements spanning every level and both satisfaction states. */
const REQUIREMENTS = [
    { id: "cis", level: "enforced", status: "satisfied" },
    { id: "exemption", level: "required", status: "outstanding" },
    { id: "handbook", level: "recommended", status: "outstanding" },
    { id: "photo_release", level: "required", status: "satisfied" },
    { id: "emergency", level: "enforced", status: "outstanding" },
] as const;

/**
 * The progress shape both paths produce.
 *
 * The anchor is carried on it deliberately, so a hypothetical evaluator that branched on the
 * context could branch — and be caught doing it.
 */
function progressFor(contextType: string, contextId: string | null) {
    return {
        processInstanceId: "pi-1",
        contextType,
        contextId,
        requirements: REQUIREMENTS.map((r) => ({
            requirement_id: r.id,
            artifact: { kind: "form", form_definition_id: `form-${r.id}` },
            level: r.level,
            status: r.status,
        })),
    } as never;
}

describe("both anchors resolve the same requirements", () => {
    it("the five Form requirements classify identically through either path", () => {
        const contextFree = evaluateEnrollmentCompletionSufficiency({
            progress: progressFor(ENROLLMENT_PARTICIPATION_CONTEXT_TYPE, "ocm-1"),
            exceptions: {},
        });
        const opportunityBacked = evaluateEnrollmentCompletionSufficiency({
            progress: progressFor(ENROLLMENT_CONTEXT_TYPE, "opp-1"),
            exceptions: {},
        });

        // Not "both are eligible" — byte-equal verdicts. A difference anywhere in the classification
        // is a difference the two families would live with.
        expect(contextFree).toEqual(opportunityBacked);
    });

    it("the blocking set is the same, and is decided by LEVEL rather than by anchor", () => {
        const result = evaluateEnrollmentCompletionSufficiency({
            progress: progressFor(ENROLLMENT_PARTICIPATION_CONTEXT_TYPE, "ocm-1"),
            exceptions: {},
        });
        // `recommended` never blocks; the two outstanding required/enforced ones do.
        expect(result.blocking.map((r) => r.requirement_id).sort()).toEqual(["emergency", "exemption"]);
        expect(result.eligible).toBe(false);
    });

    it("a journey with no Opportunity is not treated as a journey with no requirements", () => {
        /*
         * The failure mode worth naming: "no acquisition" collapsing into "nothing required". A
         * context-free enrolment is a real enrolment, and its packet is the same packet.
         */
        const result = evaluateEnrollmentCompletionSufficiency({
            progress: progressFor(ENROLLMENT_PARTICIPATION_CONTEXT_TYPE, null),
            exceptions: {},
        });
        expect(result.requirements).toHaveLength(REQUIREMENTS.length);
        expect(result.blocking.length).toBeGreaterThan(0);
    });
});

describe("there is one evaluator, not one per path", () => {
    it("no second sufficiency evaluator exists to drift from this one", async () => {
        /*
         * Parity held by CONSTRUCTION rather than by agreement. Two evaluators that happen to agree
         * today are two evaluators, and the second one is where a context-free special case would
         * eventually be added.
         */
        const mod = await import("@/lib/enrollment/completion/enrollmentCompletionSufficiency");
        const evaluators = Object.keys(mod).filter((k) => /^evaluate.*Sufficiency$/.test(k));
        expect(evaluators).toEqual(["evaluateEnrollmentCompletionSufficiency"]);
    });
});
