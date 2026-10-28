/**
 * C2 — an intentional suppression through the legacy send adapter is a governed refusal, not a 500.
 * The live proof (real database, opted-out recipient, no deliverable row) is S7 C·12 in
 * tests/tours/live/publicTourIntake.live.test.ts; this pins the classification itself.
 */
import { describe, expect, it } from "vitest";

import { classifyEnqueueRefusal } from "@/lib/communications/executeLegacyCommunicationsSendAdapter";

const refused = (skippedReason: string) => ({ communicationMessageId: null, skippedReason });

describe("C2 · classifyEnqueueRefusal", () => {
    it.each(["OPTED_OUT", "SUPPRESSED", "MARKETING_REQUIRES_OPT_IN", "UNRESOLVED_INBOUND_STOP_HOLD"])(
        "the recipient's own preference or hold (%s) is recipient_suppressed",
        (code) => {
            expect(classifyEnqueueRefusal(refused(`eligibility_blocked:${code}`))).toBe("recipient_suppressed");
        }
    );

    it.each(["QUIET_HOURS", "CATEGORY_MISSING", "CHANNEL_UNAVAILABLE", "RECIPIENT_UNRESOLVED"])(
        "any other eligibility refusal (%s) is send_blocked — still a refusal, never a fault",
        (code) => {
            expect(classifyEnqueueRefusal(refused(`eligibility_blocked:${code}`))).toBe("send_blocked");
        }
    );

    it("render and link-origin refusals are send_blocked", () => {
        expect(classifyEnqueueRefusal(refused("render_blocked:UNRESOLVED_TOKEN"))).toBe("send_blocked");
        expect(classifyEnqueueRefusal(refused("link_origin_blocked:FOREIGN_ORIGIN"))).toBe("send_blocked");
    });

    it("a real enqueue failure is not a refusal — the adapter keeps answering 500", () => {
        for (const reason of ["insert_failed", "thread_failed", "no_org_id", ""]) {
            expect(classifyEnqueueRefusal(refused(reason))).toBeNull();
        }
        expect(classifyEnqueueRefusal({ communicationMessageId: null })).toBeNull();
    });

    it("a queued message is never classified as refused", () => {
        expect(classifyEnqueueRefusal({ communicationMessageId: "m-1", skippedReason: "eligibility_blocked:OPTED_OUT" })).toBeNull();
    });
});
