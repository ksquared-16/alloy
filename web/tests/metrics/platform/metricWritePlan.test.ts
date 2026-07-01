import { describe, expect, it } from "vitest";
import {
    planPlacementWrites,
    resolveWriteTarget,
    type ExistingPlacement,
} from "@/lib/metrics/platform/metricWritePlan";

describe("resolveWriteTarget — no duplicate on save/publish", () => {
    it("creates (POST) when no org object exists yet", () => {
        expect(resolveWriteTarget(null)).toEqual({ method: "POST", id: null });
        expect(resolveWriteTarget(undefined)).toEqual({ method: "POST", id: null });
    });

    it("updates (PATCH) once an org id is established", () => {
        expect(resolveWriteTarget("metric-1")).toEqual({ method: "PATCH", id: "metric-1" });
    });

    it("save-draft then publish reuses the same id (no second insert)", () => {
        // First save creates the record and the UI stores the returned id.
        const afterCreate = resolveWriteTarget(null);
        expect(afterCreate.method).toBe("POST");

        const workingId = "metric-created-1";
        // Subsequent publish must update the same record.
        expect(resolveWriteTarget(workingId)).toEqual({ method: "PATCH", id: "metric-created-1" });
    });

    it("copy-on-edit then edit updates the copy, never re-copies", () => {
        // After copying a template, the UI stores the org copy id as workingId.
        const orgCopyId = "org-copy-1";
        expect(resolveWriteTarget(orgCopyId)).toEqual({ method: "PATCH", id: "org-copy-1" });
    });
});

describe("planPlacementWrites — multi-surface dedupe", () => {
    const existing: ExistingPlacement[] = [
        { id: "pl-1", surface: "operational_intelligence", placement_zone: "overview", surface_key: "default", status: "active" },
        { id: "pl-2", surface: "work_unit_header", placement_zone: "header_metrics", surface_key: "default", status: "active" },
    ];

    it("creates only new locations", () => {
        const plan = planPlacementWrites(
            existing,
            [
                { surface: "operational_intelligence", placement_zone: "overview", surface_key: "default" },
                { surface: "work_unit_header", placement_zone: "header_metrics", surface_key: "default" },
                { surface: "workspace_header", placement_zone: "primary_metrics", surface_key: "default" },
            ],
            "active",
        );
        expect(plan.creates).toHaveLength(1);
        expect(plan.creates[0]!.surface).toBe("workspace_header");
        expect(plan.updates).toHaveLength(0);
        expect(plan.removes).toHaveLength(0);
    });

    it("does not re-create an existing location (no duplicate row)", () => {
        const plan = planPlacementWrites(
            existing,
            [{ surface: "operational_intelligence", placement_zone: "overview", surface_key: "default" }],
            "active",
        );
        expect(plan.creates).toHaveLength(0);
        // The work unit placement is no longer selected → archived.
        expect(plan.removes).toEqual(["pl-2"]);
    });

    it("updates status of an existing location instead of inserting", () => {
        const draftExisting: ExistingPlacement[] = [
            { id: "pl-3", surface: "operational_intelligence", placement_zone: "overview", surface_key: "default", status: "draft" },
        ];
        const plan = planPlacementWrites(
            draftExisting,
            [{ surface: "operational_intelligence", placement_zone: "overview", surface_key: "default" }],
            "active",
        );
        expect(plan.creates).toHaveLength(0);
        expect(plan.updates).toEqual([{ id: "pl-3", status: "active" }]);
    });

    it("revives an archived location by re-selecting it (update, not insert)", () => {
        const archivedExisting: ExistingPlacement[] = [
            { id: "pl-4", surface: "business_process_tile", placement_zone: "tile_metrics", surface_key: "default", status: "archived" },
        ];
        const plan = planPlacementWrites(
            archivedExisting,
            [{ surface: "business_process_tile", placement_zone: "tile_metrics", surface_key: "default" }],
            "active",
        );
        expect(plan.creates).toHaveLength(0);
        expect(plan.updates).toEqual([{ id: "pl-4", status: "active" }]);
        expect(plan.removes).toHaveLength(0);
    });
});
