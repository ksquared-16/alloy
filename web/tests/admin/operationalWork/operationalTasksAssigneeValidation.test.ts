import { describe, expect, it } from "vitest";

import { validateOperationalTaskCreateBody } from "@/lib/admin/operationalTasksService";

const userId = "22222222-2222-4222-8222-222222222222";

describe("operational task assignee validation", () => {
    it("accepts assigned_to_user_id on create", () => {
        const parsed = validateOperationalTaskCreateBody({
            title: "Follow up",
            due_at: "2027-01-15T12:00:00.000Z",
            source: "manual",
            assigned_to_user_id: userId,
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.assigned_to_user_id).toBe(userId);
    });

    it("accepts null assignee on create", () => {
        const parsed = validateOperationalTaskCreateBody({
            title: "Follow up",
            due_at: "2027-01-15T12:00:00.000Z",
            source: "manual",
            assigned_to_user_id: null,
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.assigned_to_user_id).toBeNull();
    });
});
