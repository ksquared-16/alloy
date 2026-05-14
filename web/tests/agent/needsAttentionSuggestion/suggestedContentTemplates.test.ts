import { describe, expect, it } from "vitest";

import { suggestedContentForReason } from "@/lib/agent/needsAttentionSuggestion/suggestedContentTemplates";

const ctx = (over: Partial<{ record_ref: string; contact_name: string; team_line?: string }> = {}) => ({
    entity_id: "e1",
    record_ref: "abc12345",
    contact_name: "there",
    ...over,
});

describe("suggestedContentForReason (deterministic drafts)", () => {
    it("uses neutral greeting when contact_name is placeholder", () => {
        const sc = suggestedContentForReason("stale_new_inquiry", ctx());
        expect(sc?.body).toMatch(/^Hi there,/m);
        expect(sc?.body).toContain("I wanted to follow up on your inquiry");
        expect(sc?.body).toContain("Thank you,\nYour team");
        expect(sc?.body).not.toMatch(/reference|record_ref|abc12345/i);
        expect(sc?.variables.contact_name).toBe("there");
        expect(sc?.variables.team_line).toBe("Your team");
    });

    it("uses real first name in greeting when provided", () => {
        const sc = suggestedContentForReason("stale_new_inquiry", ctx({ contact_name: "Alex" }));
        expect(sc?.body).toMatch(/^Hi Alex,/m);
        expect(sc?.body).not.toContain("Please reply when you can");
    });

    it("payment template stays vertical-neutral", () => {
        const sc = suggestedContentForReason("waiting_on_payment", ctx());
        expect(sc?.body.toLowerCase()).not.toContain("enrollment");
        expect(sc?.body).toContain("payment");
    });
});
