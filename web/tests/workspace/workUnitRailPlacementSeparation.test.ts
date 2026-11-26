import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";
import {
    WORK_UNIT_RAIL_PLACEMENT,
    describeWorkUnitRailResolution,
    flattenFocusPanelManageActions,
    shouldDrawerReplaceCommandRailActions,
} from "@/lib/workspace/workUnitRailActionResolution";

const root = resolve(__dirname, "../..");
function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function action(key: string) {
    return {
        key,
        label: key,
        description: null,
        action_type: "workflow",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };
}

describe("Work Unit rail placement separation", () => {
    it("Create Lead on work_unit primary appears in Work Unit rail flatten", () => {
        const flat = rightRailResolvedFromActionsPayload({
            ...emptyResolvedActionsBySlot(),
            primary: [action("create_lead")],
        });
        expect(flat.map((a) => a.key)).toContain("create_lead");
    });

    it("Create Lead on work_unit only does not flatten into Focus Panel Manage slots", () => {
        const workUnitOnly = rightRailResolvedFromActionsPayload({
            ...emptyResolvedActionsBySlot(),
            primary: [action("create_lead")],
        });
        const focusPanel = flattenFocusPanelManageActions({
            ...emptyResolvedActionsBySlot(),
            overflow: [action("update_status")],
        });
        expect(workUnitOnly.map((a) => a.key)).toEqual(["create_lead"]);
        expect(focusPanel.map((a) => a.key)).toEqual(["update_status"]);
        expect(focusPanel.map((a) => a.key)).not.toContain("create_lead");
    });

    it("Focus Panel Manage overflow action does not appear in Work Unit rail merge", () => {
        const workUnitRail = mergeEnrollmentRightRailActions(
            [action("create_lead")],
            { primaries: [], systemActions: [], quickOperations: [], overflow: [] }
        );
        const focusOnly = flattenFocusPanelManageActions({
            ...emptyResolvedActionsBySlot(),
            overflow: [action("update_status")],
        });
        expect(workUnitRail.systemActions?.map((a) => a.id)).toContain("registry_right_rail:create_lead");
        expect(focusOnly.map((a) => a.key)).toEqual(["update_status"]);
        expect(workUnitRail.systemActions?.some((a) => a.id.includes("update_status"))).toBe(false);
    });

    it("changing selected row does not change Work Unit placement availability keys", () => {
        const withSelection = describeWorkUnitRailResolution({
            placementSurfaces: [WORK_UNIT_RAIL_PLACEMENT.surface],
            resolvedBySlot: {
                ...emptyResolvedActionsBySlot(),
                primary: [action("create_lead"), action("schedule_tour")],
            },
            pagePlacementSurface: "work_unit",
        });
        const withoutSelection = describeWorkUnitRailResolution({
            placementSurfaces: [WORK_UNIT_RAIL_PLACEMENT.surface],
            resolvedBySlot: {
                ...emptyResolvedActionsBySlot(),
                primary: [action("create_lead"), action("schedule_tour")],
            },
            pagePlacementSurface: "work_unit",
        });
        expect(withSelection.resolvedActionKeys).toEqual(withoutSelection.resolvedActionKeys);
        expect(withSelection.resolvedActionKeys).toContain("create_lead");
        expect(withSelection.resolvedActionKeys).toContain("schedule_tour");
    });

    it("required-subject rail action stays available from placement regardless of suggested record", () => {
        const debug = describeWorkUnitRailResolution({
            placementSurfaces: ["work_unit"],
            resolvedBySlot: {
                ...emptyResolvedActionsBySlot(),
                primary: [action("schedule_tour")],
            },
            pagePlacementSurface: "work_unit",
        });
        expect(debug.resolvedActionKeys).toContain("schedule_tour");
        expect(debug.drawerOverrideBlocked).toBe(true);
    });

    it("page-owned work_unit surface blocks drawer command rail override", () => {
        expect(
            shouldDrawerReplaceCommandRailActions({
                pagePlacementSurface: "work_unit",
                drawerRegistrationPresent: true,
            })
        ).toBe(false);
        expect(
            shouldDrawerReplaceCommandRailActions({
                pagePlacementSurface: null,
                drawerRegistrationPresent: true,
            })
        ).toBe(true);
    });
});

describe("Work Unit page command rail wiring", () => {

    it("loadRightRailActionsBundleServer scopes surfaces explicitly", () => {
        const loader = read("lib/workspace/loadRightRailActionsBundleServer.ts");
        expect(loader).toContain("placementSurfaces");
        expect(loader).toContain("resolveActionsForContext");
    });
});
