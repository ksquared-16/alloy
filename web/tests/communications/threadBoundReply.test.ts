/**
 * An operator can answer a parent Alloy hasn't identified yet — without typing a
 * phone number.
 *
 * A parent can text an Alloy number before anyone knows who they are. That
 * conversation is real and tenant-owned, but it anchors to
 * `communications_unknown` with no `person_id`, and every outbound path required
 * a typed Person. The operator was unable to reply to precisely the messages most
 * in need of a reply.
 *
 * The fix is a recipient that carries a thread id and nothing else. The server
 * derives the destination from an inbound message it actually received on a
 * thread this organization owns. The client never names an address — which is
 * what keeps this from re-opening the free-text recipient path that typed
 * recipients were introduced to close.
 */
import { describe, expect, it } from "vitest";
import { validateTypedRecipientShape } from "@/lib/communications/recipients/typedRecipient";
import { evaluateEligibility } from "@/lib/communications/eligibility/evaluateEligibility";
import type { EligibilityInput } from "@/lib/communications/eligibility/types";

const THREAD = "11111111-1111-4111-8111-111111111111";

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
    return {
        audience: "external",
        category: "operational",
        channel: "sms",
        recipientPersonId: null,
        verifiedThreadEndpoint: true,
        suppressed: false,
        channelUsable: true,
        ...over,
    } as EligibilityInput;
}

// --- the client may not choose the destination -------------------------------

describe("canonical_thread recipient shape", () => {
    it("accepts a thread id alone", () => {
        expect(validateTypedRecipientShape({ kind: "canonical_thread", threadId: THREAD })).toBeNull();
    });

    it("requires a real thread id", () => {
        expect(
            validateTypedRecipientShape({ kind: "canonical_thread", threadId: "not-a-uuid" })?.code
        ).toBe("missing_thread_id");
        expect(validateTypedRecipientShape({ kind: "canonical_thread" })?.code).toBe("missing_thread_id");
    });

    it.each(["address", "to", "to_address", "phone", "email"])(
        "REFUSES a caller-supplied %s rather than ignoring it",
        (field) => {
            // Silently dropping it would let a caller believe they had redirected
            // the message somewhere else.
            const err = validateTypedRecipientShape({
                kind: "canonical_thread",
                threadId: THREAD,
                [field]: "+15559990000",
            });

            expect(err?.code).toBe("thread_recipient_address_not_permitted");
        }
    );
});

// --- eligibility still runs, and stays honest about what it could not check ---

describe("eligibility for a thread-bound reply", () => {
    it("permits the reply when nothing blocks", () => {
        expect(evaluateEligibility(input()).allowed).toBe(true);
    });

    it("still refuses when there is neither a Person nor a verified endpoint", () => {
        const d = evaluateEligibility(input({ verifiedThreadEndpoint: false }));

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("RECIPIENT_UNRESOLVED");
    });

    it("is blocked by an unresolved STOP hold", () => {
        const d = evaluateEligibility(input({ unresolvedInboundStopHold: true }));

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("UNRESOLVED_INBOUND_STOP_HOLD");
    });

    it("is blocked by provider suppression", () => {
        const d = evaluateEligibility(input({ suppressed: true }));

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("SUPPRESSED");
    });

    it("is blocked by an unusable channel", () => {
        const d = evaluateEligibility(input({ channelUsable: false }));

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("CHANNEL_UNAVAILABLE");
    });

    it("STILL honours quiet hours, which do not need a Person", () => {
        // Quiet hours come from the location/organization window. An early
        // "allowed" for unidentified senders would have skipped a policy that
        // remains fully evaluable.
        const d = evaluateEligibility(
            input({
                quietHours: { timezone: "America/Los_Angeles", start: "21:00", end: "08:00" },
                nowIso: "2026-08-10T06:00:00.000Z",
            })
        );

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("QUIET_HOURS");
    });

    it("refuses marketing, because 'could not check' is not opt-in", () => {
        const d = evaluateEligibility(input({ category: "marketing" }));

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("MARKETING_REQUIRES_OPT_IN");
    });

    it("never reports a Person opt-out it could not evaluate", () => {
        // preferenceState is meaningless without a Person; it must not be read as
        // consent either way.
        const d = evaluateEligibility(input({ preferenceState: "opted_out" }));

        expect(d.code).not.toBe("OPTED_OUT");
    });

    it("leaves resolved-Person behaviour completely unchanged", () => {
        const person = evaluateEligibility(
            input({ recipientPersonId: "person-1", verifiedThreadEndpoint: false, preferenceState: "opted_out" })
        );

        expect(person.code).toBe("OPTED_OUT");
    });
});
