import { describe, expect, it } from "vitest";

import { deriveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";

/**
 * Polish #3 — perspective derivation must expose MULTIPLE meaningful lanes when the
 * `queue_definition` has them (not collapse to a single stray stage). The rail itself reuses
 * these lanes; this asserts the underlying derivation resolves distinct perspectives per lane.
 */
const multiLaneDefinition = {
    version: 2,
    entity_type: "opportunity",
    queues: [
        { key: "new_leads", label: "New Leads", domain: "new_leads", grain: "case" },
        { key: "tours", label: "Tours", domain: "tours", grain: "case" },
        { key: "waitlist", label: "Waitlist", domain: "waitlist", grain: "candidate" },
    ],
};

describe("deriveRuntimePerspective — multi-lane queue_definition", () => {
    it("resolves a distinct perspective for each configured lane", () => {
        const lanes = ["new_leads", "tours", "waitlist"];
        const perspectives = lanes.map((activeQueueKey) =>
            deriveRuntimePerspective({ workUnitId: "wu_1", queueDefinition: multiLaneDefinition, activeQueueKey }),
        );
        expect(perspectives.every((p) => p != null)).toBe(true);
        const keys = perspectives.map((p) => p!.key);
        expect(new Set(keys).size).toBe(3); // three meaningful, distinct lanes
        expect(perspectives.map((p) => p!.label)).toEqual(["New Leads", "Tours", "Waitlist"]);
    });

    it("carries grain through per lane (candidate lane groups by program)", () => {
        const waitlist = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: multiLaneDefinition,
            activeQueueKey: "waitlist",
        });
        expect(waitlist?.grain).toBe("candidate");
        expect(waitlist?.groupBy).toBe("program");
    });

    it("returns null with no active lane (State 1 parity — nothing derived, no split)", () => {
        expect(
            deriveRuntimePerspective({ workUnitId: "wu_1", queueDefinition: multiLaneDefinition, activeQueueKey: null }),
        ).toBeNull();
        expect(
            deriveRuntimePerspective({ workUnitId: "", queueDefinition: multiLaneDefinition, activeQueueKey: "tours" }),
        ).toBeNull();
    });
});
