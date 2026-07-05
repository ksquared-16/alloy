/** @vitest-environment node */

/**
 * The engine is process-agnostic: no grain, no table names, no Enrollment constants. These tests
 * exercise the primitives through TWO unrelated contracts (a mock Enrollment-shaped one and a mock
 * Billing one) to prove the engine serves any process without edits.
 */

import { describe, expect, it } from "vitest";
import {
    buildProcessParticipant,
    countParticipants,
    effectiveStage,
    isOpenInstance,
    participantHasEffectiveStage,
    participantInScope,
    participantMatchesProcess,
    participantStateIn,
    type ProcessParticipationContract,
} from "@/lib/process/engine";

const ENROLL: ProcessParticipationContract = {
    processKey: "enrollment",
    subjectType: "child",
    contextType: "opportunity",
    inheritsContextStage: true,
};
// A completely different process — subject=household, context=account, NO stage inheritance.
const BILLING: ProcessParticipationContract = {
    processKey: "billing",
    subjectType: "household",
    contextType: "account",
    inheritsContextStage: false,
};

function base(over: Record<string, unknown>) {
    return {
        id: "pi",
        org_id: "org-1",
        process_key: "enrollment",
        subject_type: "child",
        subject_id: "s-1",
        context_id: "c-1",
        stage_key: null,
        state: null,
        close_reason_key: null,
        ...over,
    };
}

describe("buildProcessParticipant — engine mapping (no table names)", () => {
    it("normalizes base fields and passes attributes through untouched", () => {
        const p = buildProcessParticipant(base({ stage_key: "  tour ", state: "waitlisted" }), {
            contextStageKey: "lead",
            scopeId: "wu-1",
            attributes: { anything: 42 },
        });
        expect(p.participantStageKey).toBe("tour"); // trimmed
        expect(p.contextStageKey).toBe("lead");
        expect(p.scopeId).toBe("wu-1");
        expect(p.attributes).toEqual({ anything: 42 });
        expect(buildProcessParticipant(base({ context_id: "  " }), { attributes: {} }).contextId).toBeNull();
    });
});

describe("effectiveStage — governed by inheritsContextStage", () => {
    const p = buildProcessParticipant(base({ stage_key: null }), { contextStageKey: "lead", attributes: {} });
    it("inherits context stage when the contract says so", () => {
        expect(effectiveStage(p, ENROLL)).toBe("lead");
    });
    it("stands alone when the contract does NOT inherit (Billing)", () => {
        expect(effectiveStage(p, BILLING)).toBeNull(); // participant stage null, no inheritance
    });
    it("participant stage always wins when present", () => {
        const q = buildProcessParticipant(base({ stage_key: "active" }), { contextStageKey: "lead", attributes: {} });
        expect(effectiveStage(q, ENROLL)).toBe("active");
        expect(effectiveStage(q, BILLING)).toBe("active");
    });
});

describe("generic primitives", () => {
    it("isOpenInstance / stateIn / hasEffectiveStage", () => {
        const open = buildProcessParticipant(base({ state: "enrolling", stage_key: "tour" }), { attributes: {} });
        expect(isOpenInstance(open)).toBe(true);
        expect(isOpenInstance(buildProcessParticipant(base({ close_reason_key: "lost" }), { attributes: {} }))).toBe(false);
        expect(participantStateIn(open, new Set(["enrolling", "enrolled"]))).toBe(true);
        expect(participantStateIn(open, new Set(["withdrawn"]))).toBe(false);
        expect(participantHasEffectiveStage(open, ENROLL, "tour")).toBe(true);
    });

    it("participantMatchesProcess checks process_key AND subject_type (Billing rejects a child)", () => {
        const child = buildProcessParticipant(base({}), { attributes: {} });
        expect(participantMatchesProcess(child, ENROLL)).toBe(true);
        expect(participantMatchesProcess(child, BILLING)).toBe(false); // wrong process + subject
    });

    it("participantInScope gates org + scopeId (NULL/sibling excluded when scoped)", () => {
        const p = buildProcessParticipant(base({}), { scopeId: "wu-1", attributes: {} });
        expect(participantInScope(p, { orgId: "org-1" })).toBe(true);
        expect(participantInScope(p, { orgId: "org-1", scopeId: "wu-1" })).toBe(true);
        expect(participantInScope(p, { orgId: "org-1", scopeId: "wu-2" })).toBe(false);
        expect(participantInScope(p, { orgId: "org-2" })).toBe(false);
        const orphan = buildProcessParticipant(base({}), { scopeId: null, attributes: {} });
        expect(participantInScope(orphan, { orgId: "org-1", scopeId: "wu-1" })).toBe(false);
    });
});

describe("the SAME engine serves a Billing process with zero engine edits", () => {
    // Billing participants: subject=household, context=account, scope=account id. No enrollment concepts.
    const billing = [
        buildProcessParticipant(
            { id: "b1", org_id: "org-1", process_key: "billing", subject_type: "household", subject_id: "h1", context_id: "acct-1", stage_key: "past_due" },
            { scopeId: "acct-1", attributes: { balance: 120 } },
        ),
        buildProcessParticipant(
            { id: "b2", org_id: "org-1", process_key: "billing", subject_type: "household", subject_id: "h2", context_id: "acct-2", stage_key: "current" },
            { scopeId: "acct-2", attributes: { balance: 0 } },
        ),
    ];
    it("a Billing-defined predicate counts through the generic engine", () => {
        const isPastDue = (p: (typeof billing)[number]) => participantHasEffectiveStage(p, BILLING, "past_due");
        expect(countParticipants(billing, isPastDue)).toBe(1);
        expect(billing.every((p) => participantMatchesProcess(p, BILLING))).toBe(true);
    });
});
