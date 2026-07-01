import { describe, expect, it } from "vitest";

import {
    formatRecipientGreetingLine,
    resolveRecipientGreetingFromOverview,
} from "@/lib/adminV2/bos/communication/resolveRecipientGreeting";

describe("resolveRecipientGreetingFromOverview", () => {
    it("prefers primary contact first name", () => {
        const resolved = resolveRecipientGreetingFromOverview({
            _identity: {
                primary_contact: { label: "Sarah Chen" },
                household: { label: "Chen household" },
            },
        });
        expect(resolved.firstName).toBe("Sarah");
        expect(formatRecipientGreetingLine(resolved)).toBe("Hi Sarah,");
    });

    it("falls back to household family greeting", () => {
        const resolved = resolveRecipientGreetingFromOverview({
            _identity: {
                household: { label: "Chen household" },
            },
        });
        expect(resolved.householdGreeting).toBe("Chen family");
        expect(formatRecipientGreetingLine(resolved)).toBe("Hi Chen family,");
    });

    it("prefers first name from two-word display name before household greeting", () => {
        const resolved = resolveRecipientGreetingFromOverview({
            name: "Sarah Chen",
        });
        expect(resolved.firstName).toBe("Sarah");
        expect(resolved.householdGreeting).toBeNull();
    });

    it("avoids generic Family greeting token", () => {
        const resolved = resolveRecipientGreetingFromOverview({
            name: "Family",
            _customer_name: "Family",
        });
        expect(resolved.firstName).toBeNull();
        expect(resolved.householdGreeting).toBeNull();
        expect(formatRecipientGreetingLine(resolved)).toBe("Hello,");
    });
});
