import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";
import { buildLifecycleActionsMatrixRows } from "@/lib/lifecycle/lifecycleActionsMatrix";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import {
    LIFECYCLE_ACTION_PLACEMENTS,
    LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS,
    lifecycleActivationBaseActions,
    lifecycleActivationPlacementIdForSurfaceSlot,
    lifecyclePlacementById,
    normalizeLifecyclePlacementId,
} from "@/lib/lifecycle/lifecycleStageBaseActions";

const root = resolve(__dirname, "../..");
function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function configuredCreateLeadRow(
    placementId: string
): LifecycleConfiguredActionRow {
    return {
        action_definition_id: "def-create-lead",
        key: "create_lead",
        label: "Create Lead",
        base_action_label: "Create Lead",
        action_scope: "lifecycle",
        operator_stages: [],
        placements: [
            {
                placement_id: placementId,
                surface_label: "placement",
                placement_label: "placement",
                is_active: true,
            },
        ],
        display_order: 0,
    };
}

describe("process action placements — canonical set", () => {
    it("editor offers exactly the 3 canonical placements", () => {
        expect(LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => p.id)).toEqual([
            "overflow",
            "work_unit_rail",
            "workspace_root",
        ]);
        expect(LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => p.label)).toEqual([
            "Focus Panel Manage",
            "Work Unit right rail",
            "Workspace",
        ]);
        // Activation editor and the canonical set are one and the same.
        expect(LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS).toBe(LIFECYCLE_ACTION_PLACEMENTS);
    });

    it("deprecated placement options are not offered in the editor", () => {
        const ids = LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => p.id);
        const labels = LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS.map((p) => p.label);
        expect(ids).not.toContain("queue_row");
        expect(ids).not.toContain("department_rail");
        expect(ids).not.toContain("drawer");
        expect(labels).not.toContain("Workspace root");
        expect(labels).not.toContain("Department right rail");
        expect(labels).not.toContain("Work Unit Queue row");
        expect(labels).not.toContain("Focus Panel"); // the bare "Focus Panel" (drawer) option is gone
    });

    it("Work Unit right rail maps to the work_unit surface primary slot", () => {
        expect(lifecyclePlacementById("work_unit_rail")).toMatchObject({
            surface: "work_unit",
            slot: "primary",
        });
        // The Work Unit page requests placementSurfaces: ["work_unit"], so this resolves on the rail.
        expect(lifecycleActivationPlacementIdForSurfaceSlot("work_unit", "primary")).toBe(
            "work_unit_rail"
        );
    });

    it("Workspace maps to the workspace surface primary slot", () => {
        expect(lifecyclePlacementById("workspace_root")).toMatchObject({
            surface: "workspace",
            slot: "primary",
            label: "Workspace",
        });
        expect(lifecycleActivationPlacementIdForSurfaceSlot("workspace", "primary")).toBe(
            "workspace_root"
        );
    });
});

describe("process action placements — Create Lead in the Work Unit rail", () => {
    it("Create Lead enabled + placed on Work Unit right rail resolves to work_unit_rail", () => {
        const rows = buildLifecycleActionsMatrixRows({
            baseActions: lifecycleActivationBaseActions("Lead"),
            configured: [configuredCreateLeadRow("pl-wu")],
            placementSurfaceSlots: new Map([["pl-wu", { surface: "work_unit", slot: "primary" }]]),
        });
        const createRow = rows.find((r) => r.base_action_key === "create_record");
        expect(createRow?.enabled).toBe(true);
        expect(createRow?.placement_ids).toContain("work_unit_rail");
    });

    it("a work_unit primary-slot create_lead flattens into the Work Unit rail list", () => {
        const flat = rightRailResolvedFromActionsPayload({
            ...emptyResolvedActionsBySlot(),
            primary: [
                {
                    key: "create_lead",
                    label: "Create Lead",
                    description: null,
                    action_type: "open_form",
                    icon: null,
                    style: null,
                    display_style: "button",
                    payload: {},
                    workflow_id: null,
                },
            ],
        });
        expect(flat.map((a) => a.key)).toContain("create_lead");
    });
});

describe("process action placements — legacy saved keys are safe", () => {
    it("normalizeLifecyclePlacementId migrates/drops deprecated ids", () => {
        expect(normalizeLifecyclePlacementId("department_rail")).toBe("workspace_root");
        expect(normalizeLifecyclePlacementId("drawer")).toBe("overflow");
        expect(normalizeLifecyclePlacementId("queue_row")).toBeNull();
        expect(normalizeLifecyclePlacementId("work_unit_rail")).toBe("work_unit_rail");
        expect(normalizeLifecyclePlacementId("overflow")).toBe("overflow");
    });

    it("deprecated surfaces normalize (or drop) without breaking the load mapping", () => {
        expect(lifecycleActivationPlacementIdForSurfaceSlot("department", "primary")).toBe(
            "workspace_root"
        );
        expect(lifecycleActivationPlacementIdForSurfaceSlot("record_header", "primary")).toBe(
            "overflow"
        );
        // Work Unit Queue row is deprecated and no longer surfaced — null, never a throw.
        expect(lifecycleActivationPlacementIdForSurfaceSlot("queue_row", "row_inline")).toBeNull();
    });

    it("deprecated ids still resolve for backward-compatible save handling", () => {
        expect(lifecyclePlacementById("department_rail")).toMatchObject({ surface: "department" });
        expect(lifecyclePlacementById("queue_row")).toMatchObject({ surface: "queue_row" });
        expect(lifecyclePlacementById("drawer")).toMatchObject({ surface: "record_header" });
    });

    it("legacy department placement loads as Workspace; legacy queue row loads without breaking", () => {
        const deptRows = buildLifecycleActionsMatrixRows({
            baseActions: lifecycleActivationBaseActions("Lead"),
            configured: [configuredCreateLeadRow("pl-dept")],
            placementSurfaceSlots: new Map([["pl-dept", { surface: "department", slot: "primary" }]]),
        });
        const deptCreate = deptRows.find((r) => r.base_action_key === "create_record");
        expect(deptCreate?.enabled).toBe(true);
        expect(deptCreate?.placement_ids).toContain("workspace_root");

        const queueRows = buildLifecycleActionsMatrixRows({
            baseActions: lifecycleActivationBaseActions("Lead"),
            configured: [configuredCreateLeadRow("pl-queue")],
            placementSurfaceSlots: new Map([["pl-queue", { surface: "queue_row", slot: "row_inline" }]]),
        });
        const queueCreate = queueRows.find((r) => r.base_action_key === "create_record");
        // Still flagged enabled (an active placement exists) but the deprecated surface is not surfaced.
        expect(queueCreate?.enabled).toBe(true);
        expect(queueCreate?.placement_ids).toEqual([]);
    });
});

describe("process action placements — editor UI uses the canonical set", () => {
    it("Process Actions editor renders the shared placement constant, not hardcoded deprecated labels", () => {
        const ui = read(
            "components/adminV2/settings/businessProcess/BusinessProcessActionsQueueWorkspace.tsx"
        );
        expect(ui).toContain("LIFECYCLE_ACTIVATION_ACTION_PLACEMENTS");
        expect(ui).not.toContain("Department right rail");
        expect(ui).not.toContain("Work Unit Queue row");
    });
});
