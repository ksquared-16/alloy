import { describe, it, expect } from "vitest";
import { buildChannelEligibility } from "@/lib/communications/v2/familyWorkspace/buildChannelEligibility";

const ALL = ["email", "sms", "in_app"] as const;

describe("buildChannelEligibility", () => {
    it("email available when address + binding present", () => {
        const e = buildChannelEligibility({ email: "a@b.com", phone: null, archived: false, providerChannels: ALL });
        expect(e.email.available).toBe(true);
        expect(e.email.canSendTransactional).toBe(true);
        expect(e.email.marketing).toBe("unset");
    });
    it("email disabled with reason when no address", () => {
        const e = buildChannelEligibility({ email: null, phone: "+15550100", archived: false, providerChannels: ALL });
        expect(e.email.available).toBe(false);
        expect(e.email.unavailableReason).toBe("No email on file");
    });
    it("email disabled when binding missing", () => {
        const e = buildChannelEligibility({ email: "a@b.com", phone: null, archived: false, providerChannels: ["sms", "in_app"] });
        expect(e.email.available).toBe(false);
        expect(e.email.unavailableReason).toBe("Email not configured");
    });
    it("archived disables all channels", () => {
        const e = buildChannelEligibility({ email: "a@b.com", phone: "+15550100", archived: true, providerChannels: ALL });
        expect(e.email.available).toBe(false);
        expect(e.sms.available).toBe(false);
        expect(e.email.unavailableReason).toBe("Person archived");
    });
    it("explicit metadata sms_opt_in false disables sms only", () => {
        const e = buildChannelEligibility({ email: "a@b.com", phone: "+15550100", archived: false, providerChannels: ALL, metadata: { sms_opt_in: false } });
        expect(e.sms.available).toBe(false);
        expect(e.sms.unavailableReason).toBe("Opt-in not recorded");
        expect(e.email.available).toBe(true);
    });
});
