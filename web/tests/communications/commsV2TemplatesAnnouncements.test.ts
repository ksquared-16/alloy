import { describe, expect, it } from "vitest";
import {
    TEMPLATE_CHANNELS,
    TEMPLATE_APPROVAL_STATUSES,
    ANNOUNCEMENT_CLASSIFICATIONS,
    ANNOUNCEMENT_STATUSES,
} from "@/lib/communications/v2/templatesAnnouncements";

/** PKG-05 — bounded vocabulary sanity (no behavior). */
describe("templates + announcements vocab", () => {
    it("templates channels + approval workflow", () => {
        expect(TEMPLATE_CHANNELS).toEqual(["email", "sms"]);
        expect(TEMPLATE_APPROVAL_STATUSES).toEqual(["draft", "pending", "approved"]);
    });
    it("announcement classification + statuses", () => {
        expect(ANNOUNCEMENT_CLASSIFICATIONS).toContain("emergency");
        expect(ANNOUNCEMENT_CLASSIFICATIONS).toContain("marketing");
        expect(ANNOUNCEMENT_STATUSES[0]).toBe("draft");
        expect(ANNOUNCEMENT_STATUSES).toContain("sent");
    });
});
