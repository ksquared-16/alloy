/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { formatQueueRowPhoneDisplay } from "@/lib/presentation/runtime/formatQueueRowContactDisplay";

describe("formatQueueRowPhoneDisplay", () => {
    it("formats raw 10-digit phone numbers", () => {
        expect(formatQueueRowPhoneDisplay("4804844844")).toBe("(480) 484-4844");
        expect(formatQueueRowPhoneDisplay("5551234567")).toBe("(555) 123-4567");
    });

    it("preserves already formatted phone numbers", () => {
        expect(formatQueueRowPhoneDisplay("(480) 484-4844")).toBe("(480) 484-4844");
        expect(formatQueueRowPhoneDisplay("+1 (480) 484-4844")).toBe("(480) 484-4844");
    });

    it("omits invalid or too-short phone values", () => {
        expect(formatQueueRowPhoneDisplay("12345")).toBeNull();
        expect(formatQueueRowPhoneDisplay("")).toBeNull();
        expect(formatQueueRowPhoneDisplay(null)).toBeNull();
    });
});
