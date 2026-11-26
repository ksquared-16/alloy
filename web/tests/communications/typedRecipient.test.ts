/**
 * Phase 1 Slice 1 — typed recipient contract.
 *
 * The behaviour under test is the rule Phase 0's inert gate proved necessary:
 * a recipient must be a typed, resolvable thing, and a failed person lookup
 * must FAIL rather than downgrade to something the consent model cannot check.
 */
import { describe, expect, it } from "vitest";

import {
    EXTERNAL_OPERATIONAL_PURPOSES,
    FREE_TEXT_RECIPIENT_MIGRATION_MESSAGE,
    RECIPIENT_KINDS,
    validateClassificationForRecipient,
    validateTypedRecipientShape,
    type ExternalOperationalRecipient,
    type InternalUserRecipient,
    type PersonRecipient,
} from "@/lib/communications/recipients/typedRecipient";

const PERSON_ID = "11111111-0000-4000-8000-00000000000a";
const USER_ID = "22222222-0000-4000-8000-00000000000b";

const person: PersonRecipient = { kind: "person", personId: PERSON_ID };
const internal: InternalUserRecipient = { kind: "internal_user", userId: USER_ID };
const external: ExternalOperationalRecipient = {
    kind: "external_operational_recipient",
    displayName: "Ace Plumbing",
    channel: "sms",
    address: "+15035550123",
    recipientRole: "vendor",
    reason: "Coordinating an emergency repair at the Bend site.",
};

describe("exactly four kinds, no untyped fallback", () => {
    it("admits only the four approved kinds", () => {
        // `canonical_thread` is the fourth and last: replying into a tenant-owned
        // conversation whose sender is not a known Person. It carries a thread id
        // and nothing else, so it cannot become the free-text path these types
        // exist to remove. Anything beyond these four needs the same scrutiny.
        expect(RECIPIENT_KINDS).toEqual([
            "person",
            "internal_user",
            "external_operational_recipient",
            "canonical_thread",
        ]);
    });

    it("rejects a raw address as a recipient", () => {
        expect(validateTypedRecipientShape("someone@example.com")?.code).toBe("missing_recipient");
        expect(validateTypedRecipientShape({ to: "someone@example.com" })?.code).toBe("unknown_kind");
        expect(validateTypedRecipientShape({ kind: "email", address: "x@y.com" })?.code).toBe("unknown_kind");
    });

    it("rejects an absent recipient", () => {
        expect(validateTypedRecipientShape(null)?.code).toBe("missing_recipient");
        expect(validateTypedRecipientShape(undefined)?.code).toBe("missing_recipient");
    });

    it("gives operator-safe migration guidance that names every kind", () => {
        for (const kind of RECIPIENT_KINDS) {
            expect(FREE_TEXT_RECIPIENT_MIGRATION_MESSAGE).toContain(kind);
        }
        // And states the no-fallback rule, so nobody expects a downgrade.
        expect(FREE_TEXT_RECIPIENT_MIGRATION_MESSAGE).toMatch(/never downgraded/i);
    });
});

describe("person recipient", () => {
    it("accepts a person id", () => {
        expect(validateTypedRecipientShape(person)).toBeNull();
    });

    it("requires a real person id, not a name or address", () => {
        expect(validateTypedRecipientShape({ kind: "person" })?.code).toBe("missing_person_id");
        expect(validateTypedRecipientShape({ kind: "person", personId: "dana@example.com" })?.code).toBe(
            "missing_person_id"
        );
        expect(validateTypedRecipientShape({ kind: "person", personId: "Dana R" })?.code).toBe("missing_person_id");
    });

    it("requires external audience", () => {
        expect(
            validateClassificationForRecipient({
                recipient: person,
                audience: "internal",
                category: "operational",
                purpose: "anything",
            })?.code
        ).toBe("audience_mismatch");
    });

    it("permits marketing — consent is what governs, and it is checked downstream", () => {
        expect(
            validateClassificationForRecipient({
                recipient: person,
                audience: "external",
                category: "marketing",
                purpose: "newsletter",
            })
        ).toBeNull();
    });
});

describe("internal user recipient", () => {
    it("accepts a user id and requires audience=internal", () => {
        expect(validateTypedRecipientShape(internal)).toBeNull();
        expect(
            validateClassificationForRecipient({
                recipient: internal,
                audience: "internal",
                category: "operational",
                purpose: "shift_handover",
            })
        ).toBeNull();
    });

    it("rejects an internal recipient sent as external", () => {
        expect(
            validateClassificationForRecipient({
                recipient: internal,
                audience: "external",
                category: "operational",
                purpose: "shift_handover",
            })?.code
        ).toBe("audience_mismatch");
    });

    it("requires a user id", () => {
        expect(validateTypedRecipientShape({ kind: "internal_user" })?.code).toBe("missing_user_id");
    });
});

describe("external operational recipient — bounded on every axis", () => {
    it("accepts a fully specified vendor", () => {
        expect(validateTypedRecipientShape(external)).toBeNull();
        expect(
            validateClassificationForRecipient({
                recipient: external,
                audience: "external",
                category: "operational",
                purpose: EXTERNAL_OPERATIONAL_PURPOSES[0],
            })
        ).toBeNull();
    });

    it("PROHIBITS marketing", () => {
        expect(
            validateClassificationForRecipient({
                recipient: external,
                audience: "external",
                category: "marketing",
                purpose: EXTERNAL_OPERATIONAL_PURPOSES[0],
            })?.code
        ).toBe("marketing_prohibited");
    });

    it("allows only operational and transactional", () => {
        expect(
            validateClassificationForRecipient({
                recipient: external,
                audience: "external",
                category: "emergency",
                purpose: EXTERNAL_OPERATIONAL_PURPOSES[0],
            })?.code
        ).toBe("category_not_allowed");
    });

    it("requires a server-allowlisted purpose — a caller-supplied one is refused", () => {
        expect(
            validateClassificationForRecipient({
                recipient: external,
                audience: "external",
                category: "operational",
                purpose: "whatever_the_caller_wants",
            })?.code
        ).toBe("purpose_not_allowlisted");
    });

    it("requires every bounded field", () => {
        const base = { ...external } as Record<string, unknown>;
        expect(validateTypedRecipientShape({ ...base, displayName: "" })?.code).toBe("missing_display_name");
        expect(validateTypedRecipientShape({ ...base, address: "" })?.code).toBe("missing_address");
        expect(validateTypedRecipientShape({ ...base, reason: "" })?.code).toBe("missing_reason");
        expect(validateTypedRecipientShape({ ...base, recipientRole: "friend" })?.code).toBe("missing_role");
    });

    it("refuses in_app — it is an external-delivery kind only", () => {
        expect(validateTypedRecipientShape({ ...external, channel: "in_app" })?.code).toBe("invalid_channel");
    });
});

describe("no silent fallback", () => {
    it("a person shape missing its id does not become an external operational recipient", () => {
        // The failure is reported as a person problem. Nothing in the contract
        // converts it into a different kind.
        const failure = validateTypedRecipientShape({ kind: "person", personId: "" });
        expect(failure?.code).toBe("missing_person_id");
        expect(failure?.code).not.toBe("missing_display_name");
    });

    it("an address alone can never satisfy any kind", () => {
        for (const kind of RECIPIENT_KINDS) {
            expect(validateTypedRecipientShape({ kind, address: "someone@example.com" })).not.toBeNull();
        }
    });
});
