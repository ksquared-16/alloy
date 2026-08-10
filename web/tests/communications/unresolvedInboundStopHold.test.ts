/**
 * A STOP still changes future behaviour when Alloy cannot tell whose it is.
 *
 * `communication_preferences` requires BOTH `org_id` and `person_id`, so when an
 * inbound STOP arrives on a destination that maps to no organization — or to
 * several — the canonical preference authority literally cannot represent it.
 * Before this, that meant a real opt-out was received and then ignored, and Alloy
 * would keep texting the same number from the same number.
 *
 * The hold is scoped to the exact external endpoint pair and nothing else. It is
 * not a Person opt-out, not an org-wide suppression, and not a block on that
 * number everywhere — and it is deliberately reported under its own code, because
 * calling it OPTED_OUT would assert a consent decision on behalf of a Person
 * nobody has identified.
 */
import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/lib/communications/eligibility/evaluateEligibility";
import type { EligibilityInput } from "@/lib/communications/eligibility/types";

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
    return {
        audience: "external",
        category: "operational",
        channel: "sms",
        recipientPersonId: "person-1",
        suppressed: false,
        channelUsable: true,
        preferenceState: "unset",
        ...over,
    } as EligibilityInput;
}

describe("unresolved inbound STOP hold", () => {
    it("blocks a send over the held endpoint pair", () => {
        const d = evaluateEligibility(input({ unresolvedInboundStopHold: true }));

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("UNRESOLVED_INBOUND_STOP_HOLD");
    });

    it("does not masquerade as a Person opt-out", () => {
        // The audit trail must not record a consent decision for a Person nobody
        // has identified.
        const d = evaluateEligibility(input({ unresolvedInboundStopHold: true }));

        expect(d.code).not.toBe("OPTED_OUT");
        expect(d.reason).toMatch(/could not attribute|ownership/i);
    });

    it("blocks transactional too", () => {
        // Per-category nuance depends on knowing who the recipient is. That is
        // exactly what is missing, so the narrow reading is the safe one.
        const d = evaluateEligibility(
            input({ unresolvedInboundStopHold: true, category: "transactional" })
        );

        expect(d.allowed).toBe(false);
        expect(d.code).toBe("UNRESOLVED_INBOUND_STOP_HOLD");
    });

    it("still permits a permitted emergency", () => {
        const d = evaluateEligibility(
            input({
                unresolvedInboundStopHold: true,
                category: "emergency",
                emergencyPermitted: true,
            })
        );

        expect(d.allowed).toBe(true);
    });

    it("leaves ordinary sends untouched when no hold exists", () => {
        expect(evaluateEligibility(input({ unresolvedInboundStopHold: false })).allowed).toBe(true);
        expect(evaluateEligibility(input()).allowed).toBe(true);
    });

    it("keeps hard suppression ahead of the hold", () => {
        // Both block; suppression is the more fundamental fact and should be the
        // reported reason so the operator sees the deliverability problem.
        const d = evaluateEligibility(input({ suppressed: true, unresolvedInboundStopHold: true }));

        expect(d.code).toBe("SUPPRESSED");
    });

    it("does not disturb a resolved Person's opt-out", () => {
        // WS8 authority stays in charge when ownership IS known.
        const d = evaluateEligibility(input({ preferenceState: "opted_out" }));

        expect(d.code).toBe("OPTED_OUT");
    });
});
