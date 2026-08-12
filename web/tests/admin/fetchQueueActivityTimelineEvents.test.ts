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

    it("sorts merged streams newest-first and dedupes by id", () => {
        const grouped = collapseTopEventsPerEntity(
            [
                // Older direct event listed first — child lifecycle (newer) must still win the slot.
                {
                    id: "direct-old",
                    entity_id: "opp-a",
                    occurred_at: "2026-06-01T00:00:00Z",
                    event_type: "note_added",
                },
                {
                    id: "child-new",
                    entity_id: "opp-a",
                    occurred_at: "2026-06-04T00:00:00Z",
                    event_type: "child_lifecycle_status_changed",
                },
                {
                    id: "child-new",
                    entity_id: "opp-a",
                    occurred_at: "2026-06-04T00:00:00Z",
                    event_type: "child_lifecycle_status_changed",
                },
            ],
            1,
        );

        expect(grouped.get("opp-a")?.map((e) => e.id)).toEqual(["child-new"]);
    });
});
