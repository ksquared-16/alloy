import { describe, expect, it } from "vitest";

import { collapseTopEventsPerEntity } from "@/lib/admin/fetchQueueActivityTimelineEvents";

describe("fetchQueueActivityTimelineEvents", () => {
    it("groups newest events per opportunity up to max per entity", () => {
        const grouped = collapseTopEventsPerEntity(
            [
                { id: "e1", entity_id: "opp-a", occurred_at: "2026-06-03T00:00:00Z", event_type: "note_added" },
                { id: "e2", entity_id: "opp-b", occurred_at: "2026-06-02T00:00:00Z", event_type: "note_added" },
                { id: "e3", entity_id: "opp-a", occurred_at: "2026-06-01T00:00:00Z", event_type: "action_executed" },
            ],
            2,
        );

        expect(grouped.get("opp-a")?.map((e) => e.id)).toEqual(["e1", "e3"]);
        expect(grouped.get("opp-b")?.map((e) => e.id)).toEqual(["e2"]);
    });
});
