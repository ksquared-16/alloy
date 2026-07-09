import { describe, expect, it } from "vitest";
import { messageDeliveryDisplay, threadReadAvailabilityHint } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";

describe("timelinePresentation delivery display", () => {
    it("shows Delivered and Opened for email when available", () => {
        expect(messageDeliveryDisplay("delivered", "email")?.label).toBe("Delivered");
        expect(messageDeliveryDisplay("opened", "email", { openedAt: "2026-07-08T12:00:00Z" })?.label).toBe("Opened");
    });

    it("does not fake SMS read/open without opened timestamp", () => {
        expect(messageDeliveryDisplay("opened", "sms", { openedAt: null })).toBeNull();
        expect(messageDeliveryDisplay("delivered", "sms")?.label).toBe("Delivered");
    });

    it("threadReadAvailabilityHint explains SMS read limitation", () => {
        expect(threadReadAvailabilityHint("sms")).toBe("Read unavailable for SMS");
        expect(threadReadAvailabilityHint("email")).toBeNull();
    });
});
