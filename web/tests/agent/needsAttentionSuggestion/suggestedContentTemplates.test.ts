import { describe, expect, it } from "vitest";

import { suggestedContentForReason } from "@/lib/agent/needsAttentionSuggestion/suggestedContentTemplates";

const ctx = (over: Partial<{ record_ref: string; contact_name: string }> = {}) => ({
    entity_id: "e1",
    record_ref: "abc12345",
    contact_name: "there",
    ...over,
});

describe("suggestedContentForReason (Card 5 templates)", () => {
    it("uses neutral placeholder when contact_name is there", () => {
        const sc = suggestedContentForReason("stale_new_inquiry", ctx());
        expect(sc?.body).toContain("Hello there");
        expect(sc?.variables.contact_name).toBe("there");
    });

    it("substitutes contact_name when provided", () => {
        const sc = suggestedContentForReason("stale_new_inquiry", ctx({ contact_name: "Alex" }));
        expect(sc?.body).toContain("Hello Alex");
    });

    it("payment template avoids enrollment-specific wording", () => {
        const sc = suggestedContentForReason("waiting_on_payment", ctx());
        expect(sc?.body.toLowerCase()).not.toContain("enrollment");
        expect(sc?.body).toContain("payment status");
    });
});
