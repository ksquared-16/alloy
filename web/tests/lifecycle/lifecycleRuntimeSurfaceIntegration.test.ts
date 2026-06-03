import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deptKpiWorkUnitsForLifecycleVisibility, resolveDeptRightRailWorkUnitId } from "@/lib/lifecycle/lifecycleKpiPresentation";
import { departmentReservesOperationalActionsRail } from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import { accumulateWorkspaceDeptWorkUnitTileStats } from "@/lib/workspace/viewModels/workspaceRootRollup";
import {
    formatLifecycleActionPlacementDetail,
    lifecycleNeedsAttentionWorkUnitConfigured,
    summarizeLifecycleActionPlacementSurfaces,
} from "@/lib/lifecycle/lifecycleRuntimeSurfaceValidation";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import { buildDefaultDepartmentKpis, buildDefaultWorkUnitKpis } from "@/lib/kpi/baseline";
import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { isLifecycleStageWorkUnitRow } from "@/lib/lifecycle/builderOwnedLifecycleRuntime";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle runtime surface integration", () => {
    it("dept KPI baseline uses enrollment-style labels with visibility-backed totals", () => {
        const items = buildDefaultDepartmentKpis({
            deptWorkUnits: [
                { id: "wu1", name: "New Leads", key: "lifecycle_wu_lead" },
                { id: "wu2", name: "Qualification", key: "lifecycle_wu_qualification" },
            ],
            deptWorkUnitSummaries: {
                wu1: { total: 17, needs_attention: null },
                wu2: { total: 3, needs_attention: null },
            },
            deptQueueSummariesLoading: false,
            deptQueueSummariesError: null,
        });
        const agg = items.find((i) => i.id === "baseline.ctx.dept.total_in_scope");
        expect(agg?.label).toBe("Total in department");
        expect(agg?.value).toBe("20");
    });

    it("work unit KPI baseline uses enrollment-style labels", () => {
        const items = buildDefaultWorkUnitKpis({
            workUnitId: "wu1",
            queueSummariesLoading: false,
            queueSummariesError: null,
            queueSummaries: [{ key: "lead", label: "New Leads", count: 17 }],
            legacyOpportunityListTotal: null,
            selectedQueueKey: "lead",
            normalizedQueueDefinition: null,
            queueItems: null,
            queueItemsLoading: false,
            queueItemsError: null,
        });
        expect(items.find((i) => i.id === "baseline.ctx.wu.total_in_queue")?.label).toBe("All queues total");
    });

    it("dept KPI facets filter to lifecycle stage work units only", () => {
        const filtered = deptKpiWorkUnitsForLifecycleVisibility(
            [
                { id: "1", name: "Lead", key: "lifecycle_wu_lead" },
                { id: "2", name: "Pipeline", key: "enrollment_pipeline" },
            ],
            true,
            isLifecycleStageWorkUnitRow
        );
        expect(filtered.map((w) => w.key)).toEqual(["lifecycle_wu_lead"]);
    });

    it("workspace tile counts active lifecycle_wu rows only", () => {
        const stats = accumulateWorkspaceDeptWorkUnitTileStats([
            {
                department_id: "d1",
                key: "lifecycle_wu_lead",
                name: "Lead",
                is_active: true,
            },
            {
                department_id: "d1",
                key: "lifecycle_wu_qualification",
                name: "Qualification",
                is_active: true,
            },
            {
                department_id: "d1",
                key: "enrollment_pipeline",
                name: "Enrollment Pipeline",
                is_active: false,
            },
        ]);
        expect(stats.d1?.workUnitCount).toBe(2);
        expect(stats.d1?.workUnitNames).toEqual(["Lead", "Qualification"]);
    });

    it("departmentReservesOperationalActionsRail includes builder-owned lifecycle", () => {
        expect(
            departmentReservesOperationalActionsRail({
                departmentKey: "lead_management",
                departmentMetadata: {
                    lifecycle_builder_owned_v1: { source: "lifecycle_builder" },
                },
                workUnits: [{ key: "lifecycle_wu_lead" }],
            })
        ).toBe(true);
        expect(
            departmentReservesOperationalActionsRail({
                departmentKey: "other",
                workUnits: [{ key: "enrollment_pipeline" }],
            })
        ).toBe(false);
    });

    it("Needs Attention pill can be empty without failure", () => {
        expect(lifecycleNeedsAttentionWorkUnitConfigured([{ key: "lifecycle_wu_lead" }])).toBe(false);
        expect(
            lifecycleNeedsAttentionWorkUnitConfigured([
                { key: "lifecycle_wu_lead" },
                { key: "needs_attention" },
            ])
        ).toBe(true);
    });

    it("summarizes action matrix placements by runtime surface", () => {
        const rows: LifecycleConfiguredActionRow[] = [
            {
                action_definition_id: "a1",
                key: "create_record",
                label: "Create",
                base_action_label: "Create",
                action_scope: "lifecycle",
                operator_stages: [],
                display_order: 0,
                placements: [
                    {
                        placement_id: "p1",
                        surface_label: "Department Right Rail",
                        placement_label: "Department Right Rail",
                        is_active: true,
                    },
                    {
                        placement_id: "p2",
                        surface_label: "Work Unit Right Rail",
                        placement_label: "Work Unit Right Rail",
                        is_active: true,
                    },
                    {
                        placement_id: "p3",
                        surface_label: "Work Unit Queue Row",
                        placement_label: "Work Unit Queue Row",
                        is_active: true,
                    },
                    {
                        placement_id: "p4",
                        surface_label: "Overflow Menu",
                        placement_label: "Overflow Menu",
                        is_active: true,
                    },
                ],
            },
        ];
        const summary = summarizeLifecycleActionPlacementSurfaces(rows);
        expect(summary.department).toBe(1);
        expect(summary.work_unit).toBe(1);
        expect(summary.queue_row).toBe(1);
        expect(summary.drawer).toBe(1);
        expect(formatLifecycleActionPlacementDetail(summary)).toMatch(/department rail/);
        expect(formatLifecycleActionPlacementDetail(summary)).toMatch(/drawer/i);
    });

    it("dept right rail prefers lifecycle stage work unit", () => {
        const id = resolveDeptRightRailWorkUnitId(
            [
                { id: "pipe", key: "enrollment_pipeline" },
                { id: "lead", key: "lifecycle_wu_lead" },
            ],
            isLifecycleStageWorkUnitRow
        );
        expect(id).toBe("lead");
    });

    describe("page wiring (static)", () => {
        it("dept page reserves operational shell and filters throughput rows", () => {
            const dept = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
            expect(dept).toContain("departmentReservesOperationalActionsRail");
            expect(dept).toContain("deptKpiWorkUnitsForLifecycleVisibility");
            expect(dept).toContain("deptThroughputWuRows");
            expect(dept).toContain("isLifecycleStageWorkUnitRow");
            expect(dept).toContain("No needs attention rules configured");
            expect(dept).toContain("reserveDeptActionsRail && enrollmentDepartmentRailModel");
        });

        it("work-unit page reserves operational actions rail and sibling pills", () => {
            const wu = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
            expect(wu).toContain("departmentReservesOperationalActionsRail");
            expect(wu).toContain("buildLifecycleBuilderOwnedAboveFoldHeaderSections");
            expect(wu).toContain("lifecycle_builder_owned_header_sections");
            expect(wu).not.toContain("applyLifecycleVisibilityKpiLabels");
        });

        it("validate runtime includes optional NA and visibility parity", () => {
            const v = read("lib/lifecycle/validateLifecycleActivationRuntime.ts");
            expect(v).toContain("needs_attention_optional");
            expect(v).toContain("lifecycle_visibility_ui_parity");
            expect(v).toContain("summarizeLifecycleActionPlacementSurfaces");
        });

        it("actions matrix preserves stage restrictions in save path", () => {
            const matrix = read("lib/lifecycle/lifecycleActionsMatrix.ts");
            expect(matrix).toContain("stage_restrictions");
            expect(matrix).toContain("resolveScopeAndStages");
        });

        it("lifecycle stage keys recognized for KPI gating", () => {
            expect(isLifecycleStageWorkUnitKey("lifecycle_wu_lead")).toBe(true);
            expect(isLifecycleStageWorkUnitKey("enrollment_pipeline")).toBe(false);
        });
    });
});
