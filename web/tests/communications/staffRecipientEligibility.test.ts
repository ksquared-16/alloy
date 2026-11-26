/**
 * A verified staff recipient (resolved and authorized by the canonical enqueue) satisfies recipient
 * resolution for TRANSACTIONAL sends only, and never lifts the internal-audience transport rule.
 */
import { describe, expect, it } from "vitest";

import { evaluateEligibility } from "@/lib/communications/eligibility/evaluateEligibility";

const base = { audience: "external" as const, channel: "email" as const, recipientPersonId: null, preferenceState: "unset" as const };

describe("evaluateEligibility · verified staff recipient", () => {
    it("a transactional email to a verified staff member is allowed", () => {
        expect(evaluateEligibility({ ...base, category: "transactional", verifiedStaffRecipient: true }).allowed).toBe(true);
    });
    it.each(["operational", "marketing"] as const)("%s to staff stays unresolved — staff are not its data subjects", (category) => {
        expect(evaluateEligibility({ ...base, category, verifiedStaffRecipient: true })).toMatchObject({ allowed: false, code: "RECIPIENT_UNRESOLVED" });
    });
    it("without verification the same send is unresolved (the caller cannot assert it)", () => {
        expect(evaluateEligibility({ ...base, category: "transactional" })).toMatchObject({ allowed: false, code: "RECIPIENT_UNRESOLVED" });
    });
    it("suppression still applies to a staff address", () => {
        expect(evaluateEligibility({ ...base, category: "transactional", verifiedStaffRecipient: true, suppressed: true })).toMatchObject({ allowed: false, code: "SUPPRESSED" });
    });
    it("an internal-audience email still never reaches a provider", () => {
        expect(evaluateEligibility({ ...base, audience: "internal", category: "transactional", verifiedStaffRecipient: true })).toMatchObject({ allowed: false, code: "INTERNAL_TO_PROVIDER" });
    });
});
