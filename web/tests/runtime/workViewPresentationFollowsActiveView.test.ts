/**
 * PRODUCT CONTRACT — the active Work View owns BOTH membership and presentation.
 *
 * The defect: selecting Waitlist while standing on the All work unit produced the correct 17 rows
 * with All's row presentation, so Adjust, the rank cluster and the pinned/group copy were absent.
 * Membership already followed the lens's canonical host; its CONFIGURATION did not — the placement
 * layer was read from the surface (route) unit, which on this tenant carries no placement config at
 * all, and the fail-open gate then silently dropped every placement affordance.
 *
 * These assert the rule semantically — which OBJECT the configuration is read from — rather than the
 * spelling of any call site. The placement resolver is exercised with real layer shapes, so the guard
 * fails if the wiring reverts to the route unit even if the code is rewritten.
 */
import { describe, expect, it } from "vitest";
import { resolveActiveWorkViewConfigLayer } from "@/lib/runtime/provisioning/settlementLocators";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";

const SURFACE = "wu-all";
const HOST = "wu-waitlist";

/** The shape measured on the certification tenant: exactly one unit carries the placement layer. */
const PLACEMENT_LAYER = {
    placement_priority_v1: {
        version: 1,
        enabled: true,
        profile_id: "childcare_enrollment_waitlist_v1",
        queue_keys_enabled: ["waitlisted"],
    },
};
const UNITS = [
    { id: SURFACE, metadata: {} },
    { id: HOST, metadata: PLACEMENT_LAYER },
];

describe("active Work View presentation follows the active view, not the route", () => {
    it("reads the HOST unit's configuration when the lens is hosted elsewhere", () => {
        const layer = resolveActiveWorkViewConfigLayer({
            surfaceWorkUnitId: SURFACE,
            populationWorkUnitId: HOST,
            surfaceMetadata: {},
            deptWorkUnits: UNITS,
        });
        expect(layer.workUnitId).toBe(HOST);
        expect(layer.metadata).toEqual(PLACEMENT_LAYER);
    });

    it("that layer actually enables the placement concern — the affordances appear", () => {
        const layer = resolveActiveWorkViewConfigLayer({
            surfaceWorkUnitId: SURFACE,
            populationWorkUnitId: HOST,
            surfaceMetadata: {},
            deptWorkUnits: UNITS,
        });
        const resolved = resolvePlacementQueueConfig({
            departmentMetadata: null,
            workUnitMetadata: layer.metadata,
            queue_key: "waitlisted",
        });
        expect(resolved.status).toBe("enabled");
    });

    it("POSITIVE CONTROL — the route unit's layer would NOT enable it, so the guard protects something", () => {
        const resolved = resolvePlacementQueueConfig({
            departmentMetadata: null,
            workUnitMetadata: {},
            queue_key: "waitlisted",
        });
        expect(resolved.status).toBe("disabled");
    });

    it("NEGATIVE — switching back to the route's own view drops the other view's configuration", () => {
        const layer = resolveActiveWorkViewConfigLayer({
            surfaceWorkUnitId: SURFACE,
            populationWorkUnitId: SURFACE,
            surfaceMetadata: {},
            deptWorkUnits: UNITS,
        });
        expect(layer.workUnitId).toBe(SURFACE);
        expect(layer.metadata).toEqual({});
        // No stale affordance may survive the switch back.
        expect(
            resolvePlacementQueueConfig({
                departmentMetadata: null,
                workUnitMetadata: layer.metadata,
                queue_key: "waitlisted",
            }).status,
        ).toBe("disabled");
    });

    it("never invents a layer when the host row is absent from the department set", () => {
        const layer = resolveActiveWorkViewConfigLayer({
            surfaceWorkUnitId: SURFACE,
            populationWorkUnitId: "wu-not-loaded",
            surfaceMetadata: { marker: true },
            deptWorkUnits: UNITS,
        });
        expect(layer.workUnitId).toBe(SURFACE);
        expect(layer.metadata).toEqual({ marker: true });
    });

    it("is lens-agnostic — any host that enables a profile is honoured, nothing names Waitlist", () => {
        const layer = resolveActiveWorkViewConfigLayer({
            surfaceWorkUnitId: SURFACE,
            populationWorkUnitId: "wu-some-other-lens",
            surfaceMetadata: {},
            deptWorkUnits: [
                ...UNITS,
                { id: "wu-some-other-lens", metadata: PLACEMENT_LAYER },
            ],
        });
        expect(layer.workUnitId).toBe("wu-some-other-lens");
        expect(
            resolvePlacementQueueConfig({
                departmentMetadata: null,
                workUnitMetadata: layer.metadata,
                queue_key: "waitlisted",
            }).status,
        ).toBe("enabled");
    });
});
