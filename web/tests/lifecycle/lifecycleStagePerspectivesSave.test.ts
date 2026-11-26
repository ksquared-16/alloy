import { describe, expect, it } from "vitest";
import {
    coercePerspectivesV1ForLanes,
    parsePerspectivesV1,
} from "@/lib/lifecycle/perspectiveConfigV1";
import {
    perspectiveDraftDirty,
    perspectiveDraftFromLanesAndSaved,
    perspectiveDraftToPersisted,
} from "@/lib/lifecycle/perspectiveConfigEditorModel";
import type { PerspectiveLaneSource } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";

const lanes: PerspectiveLaneSource[] = [
    {
        queueKey: "tours",
        label: "Tours",
        foundInDefinition: true,
        defaultDisplayOrder: 1,
    },
    {
        queueKey: "waitlist",
        label: "Waitlist",
        foundInDefinition: true,
        defaultDisplayOrder: 2,
    },
];

describe("perspectives_v1 parse and coerce", () => {
    it("parses array metadata rows", () => {
        const parsed = parsePerspectivesV1([
            { queue_key: "tours", label: "Tour lane", visible_in_rail: false, display_order: 3 },
        ]);
        expect(parsed).toEqual([
            { queue_key: "tours", label: "Tour lane", visible_in_rail: false, display_order: 3 },
        ]);
    });

    it("parses legacy wrapped metadata", () => {
        const parsed = parsePerspectivesV1({
            version: 1,
            perspectives: [{ queue_key: "waitlist", mission: "Review waitlist" }],
        });
        expect(parsed).toEqual([{ queue_key: "waitlist", mission: "Review waitlist" }]);
    });

    it("rejects invalid queue keys and duplicate rows", () => {
        expect(
            parsePerspectivesV1([
                { queue_key: "Bad Key" },
                { queue_key: "tours", label: "First" },
                { queue_key: "tours", label: "Duplicate" },
            ]),
        ).toEqual([{ queue_key: "tours", label: "First" }]);
    });

    it("drops stale queue keys when coercing against synced lanes", () => {
        const coerced = coercePerspectivesV1ForLanes(
            [
                { queue_key: "tours", label: "Tours" },
                { queue_key: "removed_lane", label: "Stale" },
            ],
            ["tours", "waitlist"],
        );
        expect(coerced).toEqual([{ queue_key: "tours", label: "Tours" }]);
    });
});

describe("perspectives editor draft model", () => {
    it("merges saved overrides with lane defaults", () => {
        const draft = perspectiveDraftFromLanesAndSaved(lanes, [
            { queue_key: "waitlist", label: "Custom waitlist", mission: "Custom mission" },
        ]);
        expect(draft[0]?.label).toBe("Tours");
        expect(draft[1]?.label).toBe("Custom waitlist");
        expect(draft[1]?.mission).toBe("Custom mission");
    });

    it("marks dirty when label changes from saved baseline", () => {
        const saved = [{ queue_key: "tours", label: "Tours" }];
        const baseline = perspectiveDraftFromLanesAndSaved(lanes, saved);
        expect(perspectiveDraftDirty(saved, baseline, lanes)).toBe(false);
        const edited = baseline.map((row) =>
            row.queue_key === "tours" ? { ...row, label: "Updated tours" } : row,
        );
        expect(perspectiveDraftDirty(saved, edited, lanes)).toBe(true);
    });

    it("persists only lane-backed queue keys", () => {
        const draft = perspectiveDraftFromLanesAndSaved(lanes, null).map((row) =>
            row.queue_key === "tours" ? { ...row, label: "Updated tours" } : row,
        );
        expect(perspectiveDraftToPersisted(draft, lanes)).toEqual([
            { queue_key: "tours", label: "Updated tours", mission: expect.any(String), visible_in_rail: true, display_order: 1 },
            expect.objectContaining({ queue_key: "waitlist" }),
        ]);
    });
});
