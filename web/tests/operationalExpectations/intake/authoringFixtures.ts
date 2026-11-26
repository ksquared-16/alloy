/**
 * Shared valid/invalid authoring fixtures (TEST INFRA) for the Wave B intake.
 */

import type {
    AuthoringContext,
    AuthoringInput,
} from "@/lib/operationalExpectations/intake/authoringTypes";

export const TRUSTED_CONTEXT: AuthoringContext = {
    orgId: "org-1",
    actorUserId: "user-1",
    actorLabel: "Room Lead",
    actorAuthenticated: true,
};

/** A well-formed `create` of a required staffing-ratio expectation on a room. */
export function validCreateInput(overrides: Partial<AuthoringInput> = {}): AuthoringInput {
    return {
        idempotencyKey: "idem-create-1",
        verb: "create",
        authority: { authorityKey: "room-lead:room-2", authorClass: "human" },
        modality: "required",
        subjects: [{ kind: "room", ref: "room-2" }],
        condition: { typeKey: "staffing_ratio", predicateShape: "ratio_at_least", params: { min: 3 } },
        temporalFrame: { kind: "operating_hours", validFrom: "2026-07-20T08:00:00.000Z", validTo: "2026-07-20T18:00:00.000Z" },
        beneficiary: null,
        footprint: { factTypes: ["staff_presence", "child_attendance"], subjectScope: ["room-2"] },
        predecessorId: null,
        ...overrides,
    };
}

/** A well-formed superseding act (revise/correct/replace/cancel) over a predecessor. */
export function validSupersedeInput(
    verb: "revise" | "correct" | "replace" | "cancel",
    overrides: Partial<AuthoringInput> = {},
): AuthoringInput {
    return validCreateInput({
        idempotencyKey: `idem-${verb}-1`,
        verb,
        predecessorId: "pred-1",
        ...overrides,
    });
}
