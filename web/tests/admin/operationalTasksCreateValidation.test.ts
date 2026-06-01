import { describe, expect, it } from "vitest";

import { validateOperationalTaskCreateBody } from "@/lib/admin/operationalTasksService";

const oppId = "33333333-3333-4333-8333-333333333333";

describe("validateOperationalTaskCreateBody", () => {
    it("accepts general tasks without entity link", () => {
        const parsed = validateOperationalTaskCreateBody({
            title: "Call vendor",
            due_at: "2027-01-15T12:00:00.000Z",
            source: "manual",
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.entity_id).toBeNull();
        expect(parsed.value.entity_type).toBeNull();
    });

    it("accepts linked opportunity tasks", () => {
        const parsed = validateOperationalTaskCreateBody({
            entity_type: "opportunities",
            entity_id: oppId,
            title: "Follow up",
            due_at: "2027-01-15T12:00:00.000Z",
            source: "manual",
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.entity_id).toBe(oppId);
        expect(parsed.value.entity_type).toBe("opportunities");
    });

    it("rejects entity_type without entity_id", () => {
        const parsed = validateOperationalTaskCreateBody({
            entity_type: "opportunities",
            title: "Follow up",
            due_at: "2027-01-15T12:00:00.000Z",
            source: "manual",
        });
        expect(parsed.ok).toBe(false);
    });
});
