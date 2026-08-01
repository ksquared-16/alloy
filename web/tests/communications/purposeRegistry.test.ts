/**
 * Phase 1 Slice 1 — server-owned purpose registry.
 *
 * `purpose` is compliance-inert (no consent rule may key off it) but it governs
 * audit and what a capability may emit. So it is server-owned and fails closed.
 */
import { describe, expect, it } from "vitest";

import {
    PURPOSE_REGISTRY,
    findPurpose,
    validatePurpose,
} from "@/lib/communications/purpose/purposeRegistry";
import { EXTERNAL_OPERATIONAL_PURPOSES } from "@/lib/communications/recipients/typedRecipient";

describe("registry integrity", () => {
    it("has unique keys", () => {
        const keys = PURPOSE_REGISTRY.map((p) => p.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("every purpose declares a source capability", () => {
        for (const p of PURPOSE_REGISTRY) expect(p.source, p.key).toBeTruthy();
    });

    it("covers the four converging routes and the existing canonical callers", () => {
        for (const source of [
            "communications.send",
            "communications.family_send",
            "ai.task_assist",
            "opportunities.form_deliver",
            "opportunities.enrollment_packet_launch",
            "tours.comms_orchestrator",
        ]) {
            expect(PURPOSE_REGISTRY.some((p) => p.source === source), source).toBe(true);
        }
    });

    it("PARITY: every external-operational purpose in the recipient contract is registered and permitted", () => {
        // The two lists exist for different reasons — one bounds the recipient
        // KIND, the other bounds what a CAPABILITY may emit — so they are
        // asserted equal rather than assumed.
        for (const key of EXTERNAL_OPERATIONAL_PURPOSES) {
            const def = findPurpose(key);
            expect(def, key).not.toBeNull();
            expect(def?.allowsExternalOperational, key).toBe(true);
            expect(def?.categories.includes("marketing"), key).toBe(false);
        }
    });

    it("no purpose permits marketing to an external operational recipient", () => {
        for (const p of PURPOSE_REGISTRY) {
            if (p.allowsExternalOperational) expect(p.categories.includes("marketing"), p.key).toBe(false);
        }
    });
});

describe("fails closed", () => {
    it("rejects an unknown purpose", () => {
        expect(
            validatePurpose({
                purpose: "whatever_i_want",
                audience: "external",
                category: "operational",
                channel: "email",
                recipientKind: "person",
                userAuthored: true,
            })?.code
        ).toBe("purpose_unknown");
    });

    it("rejects an empty purpose", () => {
        expect(
            validatePurpose({
                purpose: "",
                audience: "external",
                category: "operational",
                channel: "email",
                recipientKind: "person",
                userAuthored: true,
            })?.code
        ).toBe("purpose_unknown");
    });
});

describe("purpose bounds classification", () => {
    it("accepts a valid operator message", () => {
        expect(
            validatePurpose({
                purpose: "operator_direct_message",
                audience: "external",
                category: "operational",
                channel: "email",
                recipientKind: "person",
                userAuthored: true,
            })
        ).toBeNull();
    });

    it("rejects the wrong audience", () => {
        expect(
            validatePurpose({
                purpose: "operator_direct_message",
                audience: "internal",
                category: "operational",
                channel: "email",
                recipientKind: "person",
                userAuthored: true,
            })?.code
        ).toBe("purpose_audience_not_allowed");
    });

    it("rejects the wrong recipient kind", () => {
        expect(
            validatePurpose({
                purpose: "operator_direct_message",
                audience: "external",
                category: "operational",
                channel: "email",
                recipientKind: "external_operational_recipient",
                userAuthored: true,
            })?.code
        ).toBe("purpose_recipient_kind_not_allowed");
    });

    it("rejects marketing under a transactional-only purpose", () => {
        expect(
            validatePurpose({
                purpose: "form_delivery",
                audience: "external",
                category: "marketing",
                channel: "email",
                recipientKind: "person",
                userAuthored: false,
            })?.code
        ).toBe("purpose_category_not_allowed");
    });

    it("rejects operator-authored content under a platform-composed purpose", () => {
        // enrollment_packet is fully platform-composed. (form_delivery is NOT a
        // valid example: that route genuinely lets an operator prepend text.)
        expect(
            validatePurpose({
                purpose: "enrollment_packet",
                audience: "external",
                category: "transactional",
                channel: "email",
                recipientKind: "person",
                userAuthored: true,
            })?.code
        ).toBe("purpose_user_authored_not_allowed");
    });

    it("rejects an unsupported channel", () => {
        expect(
            validatePurpose({
                purpose: "operator_direct_message",
                audience: "external",
                category: "operational",
                channel: "in_app",
                recipientKind: "person",
                userAuthored: true,
            })?.code
        ).toBe("purpose_channel_not_allowed");
    });

    it("permits a bounded vendor coordination send", () => {
        expect(
            validatePurpose({
                purpose: "vendor_coordination",
                audience: "external",
                category: "operational",
                channel: "sms",
                recipientKind: "external_operational_recipient",
                userAuthored: true,
            })
        ).toBeNull();
    });
});
