/**
 * An operator answering an unidentified conversation must get past the purpose gate.
 *
 * This is the control that was missing, and its absence is what let the
 * thread-bound reply be described as implemented while it had never sent a
 * message. Recipient resolution, the route contract and the eligibility gate all
 * existed and passed their own tests; every real send died at
 * `validatePurpose`, because no purpose listed `canonical_thread` as a permitted
 * recipient kind. Only driving the browser surfaced it.
 *
 * Both directions are asserted. Permitting the operator is the fix; the refusals
 * below are the reason widening it is safe, and they must not quietly follow.
 */

import { describe, expect, it } from "vitest";

import { PURPOSE_REGISTRY, validatePurpose } from "@/lib/communications/purpose/purposeRegistry";

const operatorThreadReply = {
    purpose: "operator_direct_message",
    audience: "external",
    channel: "sms",
    recipientKind: "canonical_thread",
    userAuthored: true,
} as const;

describe("thread-bound reply passes the purpose gate", () => {
    it("permits an operator answering an unidentified conversation", () => {
        expect(validatePurpose({ ...operatorThreadReply, category: "operational" })).toBeNull();
    });

    it("permits it on email as well as SMS, since inbound email reuses this path", () => {
        expect(
            validatePurpose({ ...operatorThreadReply, channel: "email", category: "operational" })
        ).toBeNull();
    });

    it("still permits the long-standing person reply", () => {
        expect(
            validatePurpose({
                purpose: "operator_direct_message",
                audience: "external",
                category: "operational",
                channel: "sms",
                recipientKind: "person",
                userAuthored: true,
            })
        ).toBeNull();
    });
});

describe("widening the purpose did not widen policy", () => {
    it("no OTHER purpose gained the thread recipient kind", () => {
        // The reply seam must not become the way automation, announcements or
        // scheduled sends reach an address nobody has identified.
        const permitted = PURPOSE_REGISTRY.filter((p) =>
            p.recipientKinds.includes("canonical_thread")
        ).map((p) => p.key);
        expect(permitted).toEqual(["operator_direct_message"]);
    });

    it("refuses an unregistered purpose outright", () => {
        const violation = validatePurpose({
            ...operatorThreadReply,
            purpose: "automation_broadcast",
            category: "operational",
        });
        expect(violation?.code).toBe("purpose_unknown");
    });

    it("refuses an internal purpose for a thread reply", () => {
        const violation = validatePurpose({
            ...operatorThreadReply,
            purpose: "internal_operator_message",
            category: "operational",
        });
        expect(violation).not.toBeNull();
    });
});

describe("marketing to an unidentified sender", () => {
    it("is not stopped HERE — the purpose allows the category, eligibility is the control", () => {
        // Stated explicitly so nobody later reads a null as proof marketing is
        // permitted end-to-end. `operator_direct_message` allows marketing for a
        // resolved Person; for a thread endpoint, eligibility answers
        // MARKETING_REQUIRES_OPT_IN because absent consent is not affirmative
        // consent. That assertion lives with the eligibility evaluator.
        expect(validatePurpose({ ...operatorThreadReply, category: "marketing" })).toBeNull();
    });
});
