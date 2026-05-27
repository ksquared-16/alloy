import { describe, expect, it } from "vitest";

import { composeOperationalCommunicationByChannel } from "@/lib/adminV2/bos/communication/communicationDraftChannelCompose";
import { synthesizeOperationalCommunicationDraft } from "@/lib/adminV2/bos/communication/communicationDraftSynthesis";

const facts = {
    recipientFirstName: "Sarah",
    recipientHouseholdGreeting: null,
    siteOrOrgName: "West Campus",
    operatorDisplayName: "Kelly Kurzman",
};

describe("communicationDraftChannelCompose", () => {
    it("SMS initial outreach is single-line operational, not email paragraphs", () => {
        const composed = composeOperationalCommunicationByChannel("initial_outreach", facts);
        expect(composed.smsBody).toContain("Hi Sarah —");
        expect(composed.smsBody).toContain("Kelly");
        expect(composed.smsBody).toContain("West Campus");
        expect(composed.smsBody).not.toContain("Thank you,\n");
        expect(composed.smsBody).not.toContain("Feel free to");
        expect(composed.smsBody.split("\n").length).toBe(1);
        expect(composed.emailBody).toContain("Hi Sarah,");
        expect(composed.emailBody).toContain("Thank you,\nKelly Kurzman");
        expect(composed.emailBody.split("\n\n").length).toBeGreaterThan(2);
    });

    it("email and SMS bodies differ for the same objective", () => {
        const draft = synthesizeOperationalCommunicationDraft({
            objective: "follow_up",
            channel: "email",
            recipientFirstName: "Sarah",
            siteOrOrgName: "West Campus",
            operatorDisplayName: "Kelly Kurzman",
        });
        expect(draft.body).not.toBe(draft.sms_body);
        expect(draft.sms_body.length).toBeLessThan(draft.body.length);
    });

    it("SMS omits signature block", () => {
        const composed = composeOperationalCommunicationByChannel("schedule_tour", facts);
        expect(composed.smsBody).not.toMatch(/Thank you,\s*Kelly/i);
    });
});
