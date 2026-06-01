import { describe, expect, it } from "vitest";

import { buildOperationalTaskBody } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

const oppId = "33333333-3333-4333-8333-333333333333";

describe("buildOperationalTaskBody", () => {
    it("omits entity fields for general tasks", () => {
        const body = buildOperationalTaskBody({
            title: "Team standup prep",
            dueAtIso: "2027-02-01T12:00:00.000Z",
            source: "manual",
        });
        expect(body.entity_id).toBeUndefined();
        expect(body.entity_type).toBeUndefined();
        expect(body.title).toBe("Team standup prep");
    });

    it("includes entity fields for linked tasks", () => {
        const body = buildOperationalTaskBody({
            entityId: oppId,
            title: "Call back",
            dueAtIso: "2027-02-01T12:00:00.000Z",
            source: "manual",
        });
        expect(body.entity_id).toBe(oppId);
        expect(body.entity_type).toBe("opportunities");
    });
});
