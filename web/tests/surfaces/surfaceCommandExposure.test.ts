import { describe, expect, it } from "vitest";

import {
    assertSurfaceMayExposeCommand,
    buildSurfaceCommandExposureRows,
    surfaceCommandExposureKindForSurfaceSlot,
    surfaceCommandExposureTargetsForSection,
    SURFACE_COMMAND_EXPOSURE_TARGETS,
} from "@/lib/adminV2/settings/surfaces/surfaceCommandExposure";
import {
    SURFACE_WORKSPACE_TABS,
    surfaceWorkspaceTabsForSection,
} from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";

describe("surfaceCommandExposure", () => {
    it("maps Focus Panel / Queue Row / Workspace targets without inventing surfaces", () => {
        expect(surfaceCommandExposureTargetsForSection("focus-panels").map((t) => t.kind)).toEqual([
            "focus_panel_manage",
        ]);
        expect(surfaceCommandExposureTargetsForSection("queue-rows").map((t) => t.kind)).toEqual([
            "queue_row_inline",
        ]);
        expect(surfaceCommandExposureTargetsForSection("workspaces").map((t) => t.kind)).toEqual([
            "workspace_primary",
        ]);
        expect(surfaceCommandExposureKindForSurfaceSlot("record_header", "overflow")).toBe(
            "focus_panel_manage"
        );
        expect(SURFACE_COMMAND_EXPOSURE_TARGETS.every((t) => t.label.includes("·") || t.label.length > 0)).toBe(
            true
        );
    });

    it("builds rows only from process-selected candidates and collapses duplicate placements", () => {
        const exposure = SURFACE_COMMAND_EXPOSURE_TARGETS.find((t) => t.kind === "focus_panel_manage")!;
        const { rows, emptyState } = buildSurfaceCommandExposureRows({
            exposure,
            candidates: [
                {
                    capabilityKey: "create_lead",
                    label: "Create lead",
                    purpose: "Create a lead",
                    supported: true,
                    processSelected: true,
                    blockedReason: null,
                },
                {
                    capabilityKey: "close_lead",
                    label: "Close lead",
                    purpose: "Close",
                    supported: true,
                    processSelected: false,
                    blockedReason: null,
                },
            ],
            placements: [
                {
                    id: "a",
                    orgOwned: true,
                    capabilityKey: "create_lead",
                    surface: "record_header",
                    slot: "overflow",
                    isActive: true,
                    orderIndex: 2,
                },
                {
                    id: "b",
                    orgOwned: true,
                    capabilityKey: "create_lead",
                    surface: "record_header",
                    slot: "overflow",
                    isActive: false,
                    orderIndex: 9,
                },
            ],
        });
        expect(emptyState).toBe("ok");
        expect(rows).toHaveLength(1);
        expect(rows[0]?.capabilityKey).toBe("create_lead");
        expect(rows[0]?.enabled).toBe(true);
        expect(rows[0]?.orgPlacementIds).toEqual(["a", "b"]);
    });

    it("blocks unselected and unsupported Commands from Surface exposure", () => {
        expect(
            assertSurfaceMayExposeCommand({
                capabilityKey: "create_lead",
                processSelectedKeys: new Set(["schedule_tour"]),
                supported: true,
            }).ok
        ).toBe(false);
        expect(
            assertSurfaceMayExposeCommand({
                capabilityKey: "archive_lead",
                processSelectedKeys: new Set(["archive_lead"]),
                supported: false,
            }).ok
        ).toBe(false);
        expect(
            assertSurfaceMayExposeCommand({
                capabilityKey: "create_lead",
                processSelectedKeys: new Set(["create_lead"]),
                supported: true,
            })
        ).toEqual({ ok: true });
    });

    it("adds Commands tab to Surface workspace tabs for supported sections", () => {
        expect(SURFACE_WORKSPACE_TABS.some((t) => t.key === "commands")).toBe(true);
        expect(surfaceWorkspaceTabsForSection("focus-panels").some((t) => t.key === "commands")).toBe(
            true
        );
        expect(
            surfaceWorkspaceTabsForSection("operational-intelligence").some((t) => t.key === "commands")
        ).toBe(false);
    });
});
