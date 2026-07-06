import { afterEach, describe, expect, it } from "vitest";

import {
    alloyOsRuntimeSplitActive,
    isWorkUnitQueueSurfacePath,
} from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import {
    deriveRuntimePerspective,
    runtimePerspectiveAttrValue,
    runtimePerspectiveSignature,
} from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import {
    getActiveRuntimePerspective,
    setActiveRuntimePerspective,
    subscribeRuntimePerspective,
} from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";

const QUEUE_DEFINITION = {
    version: 2,
    entity_type: "opportunity",
    queues: [
        {
            key: "tours",
            label: "Tours",
            grain: "case",
            domain: "tours",
            aliases: ["tour_scheduled"],
            filters: [{ field: "status", op: "eq", value: "tour_scheduled" }],
            sort: [{ field: "tour_at", direction: "asc" }],
        },
        {
            key: "waitlist",
            label: "Waitlist",
            grain: "candidate",
            domain: "waitlist",
        },
    ],
} as const;

afterEach(() => {
    setActiveRuntimePerspective(null);
});

describe("deriveRuntimePerspective", () => {
    it("derives a Perspective from a queue_definition lane", () => {
        const p = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tours",
            source: "pill",
        });
        expect(p).not.toBeNull();
        expect(p).toMatchObject({
            key: "tours",
            workUnitId: "wu_1",
            label: "Tours",
            grain: "case",
            groupBy: null,
            source: "pill",
        });
        expect(p?.sort).toEqual([{ field: "tour_at", direction: "asc" }]);
        expect(p?.defaultFilters).toEqual([{ field: "status", op: "eq", value: "tour_scheduled" }]);
        expect(p?.defaultMission).toBe("Tours");
        expect(p?.emptyState?.title).toBeTruthy();
    });

    it("resolves an alias to the canonical lane key", () => {
        const p = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tour_scheduled",
            source: "url",
        });
        expect(p?.key).toBe("tours");
        expect(p?.label).toBe("Tours");
    });

    it("groups candidate-grain lanes by program", () => {
        const p = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "waitlist",
        });
        expect(p?.grain).toBe("candidate");
        expect(p?.groupBy).toBe("program");
    });

    it("returns null when there is no active lane (State 1)", () => {
        expect(
            deriveRuntimePerspective({
                workUnitId: "wu_1",
                queueDefinition: QUEUE_DEFINITION,
                activeQueueKey: null,
            })
        ).toBeNull();
    });

    it("falls back to a minimal Perspective when the lane is unresolved / definition missing", () => {
        const p = deriveRuntimePerspective({
            workUnitId: "wu_9",
            queueDefinition: null,
            activeQueueKey: "new_leads",
            source: "bootstrap",
        });
        expect(p).toMatchObject({
            key: "new_leads",
            workUnitId: "wu_9",
            label: "New Leads",
            grain: "case",
            groupBy: null,
            source: "bootstrap",
        });
    });

    it("passes through an active attention bucket key", () => {
        const p = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tours",
            attentionBucketKey: "overdue",
        });
        expect(p?.attentionBucketKey).toBe("overdue");
    });
});

describe("runtimePerspective helpers", () => {
    it("formats the root attribute value as <workUnitId>:<key>", () => {
        const p = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tours",
        });
        expect(runtimePerspectiveAttrValue(p)).toBe("wu_1:tours");
        expect(runtimePerspectiveAttrValue(null)).toBeNull();
    });

    it("produces a stable signature that ignores unrelated object identity", () => {
        const a = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tours",
            source: "pill",
        });
        const b = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tours",
            source: "pill",
        });
        expect(runtimePerspectiveSignature(a)).toBe(runtimePerspectiveSignature(b));
        expect(runtimePerspectiveSignature(null)).toBe("");
    });
});

describe("runtime Perspective store", () => {
    it("publishes the active Perspective and notifies subscribers", () => {
        let notified = 0;
        const unsub = subscribeRuntimePerspective(() => {
            notified += 1;
        });

        const p = deriveRuntimePerspective({
            workUnitId: "wu_1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tours",
        });
        setActiveRuntimePerspective(p);
        expect(getActiveRuntimePerspective()?.key).toBe("tours");
        expect(notified).toBe(1);

        setActiveRuntimePerspective(null);
        expect(getActiveRuntimePerspective()).toBeNull();
        expect(notified).toBe(2);
        unsub();
    });
});

describe("alloyOsRuntimeSplitActive (State 2 trigger)", () => {
    it("activates from an active Perspective + open drawer on a work-unit surface", () => {
        expect(
            alloyOsRuntimeSplitActive({ perspectiveActive: true, drawerOpen: true, onWorkUnitSurface: true })
        ).toBe(true);
    });

    it("does not depend on any queue param — no active Perspective means no split", () => {
        // Proves the trigger is the Perspective, not `?queue=tours`.
        expect(
            alloyOsRuntimeSplitActive({ perspectiveActive: false, drawerOpen: true, onWorkUnitSurface: true })
        ).toBe(false);
    });

    it("requires an open Focus Panel and a work-unit surface", () => {
        expect(
            alloyOsRuntimeSplitActive({ perspectiveActive: true, drawerOpen: false, onWorkUnitSurface: true })
        ).toBe(false);
        expect(
            alloyOsRuntimeSplitActive({ perspectiveActive: true, drawerOpen: true, onWorkUnitSurface: false })
        ).toBe(false);
    });

    it("recognizes work-unit surfaces by path", () => {
        expect(isWorkUnitQueueSurfacePath("/adminV2/workspace/dept/d1/work-unit/w1")).toBe(true);
        expect(isWorkUnitQueueSurfacePath("/adminV2/workspace")).toBe(false);
        expect(isWorkUnitQueueSurfacePath(null)).toBe(false);
    });

    it("runtime split is driven by perspective + drawer + surface (no kill switch)", () => {
        expect(
            alloyOsRuntimeSplitActive({ perspectiveActive: true, drawerOpen: true, onWorkUnitSurface: true }),
        ).toBe(true);
    });
});
