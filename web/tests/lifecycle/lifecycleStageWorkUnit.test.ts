import { describe, expect, it } from "vitest";
import {
    buildLifecycleStageQueueDefinition,
    departmentUsesLifecycleStageWorkUnits,
    isLifecycleStageWorkUnitKey,
    lifecycleStageWorkUnitKey,
    primaryQueueKeyForLifecycleStage,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    buildLifecycleActivationCompactChecks,
    lifecycleActivationTechnicalDetailLines,
} from "@/lib/lifecycle/lifecycleActivationValidationCompact";
import type { LifecycleActivationCheckResult } from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import { buildWorkspaceRootDepartmentTileRollupLine } from "@/lib/workspace/viewModels/workspaceRootRollup";

describe("lifecycleStageWorkUnit", () => {
    it("generates stable per-stage work unit keys", () => {
        expect(lifecycleStageWorkUnitKey("lead")).toBe("lifecycle_wu_lead");
        expect(lifecycleStageWorkUnitKey("qualification")).toBe("lifecycle_wu_qualification");
        expect(isLifecycleStageWorkUnitKey("lifecycle_wu_lead")).toBe(true);
        expect(isLifecycleStageWorkUnitKey("enrollment_pipeline")).toBe(false);
    });

    it("builds single-lane queue definition with status filters", () => {
        const doc = buildLifecycleStageQueueDefinition({
            stageKey: "lead",
            label: "New Leads",
            statusKeys: ["new_lead", "new_inquiry"],
        });
        const qk = primaryQueueKeyForLifecycleStage("lead");
        expect(doc.entity_type).toBe("opportunity");
        const queues = doc.queues as { key: string; filters_compat_v1?: { values?: string[] }[] }[];
        const row = queues.find((q) => q.key === qk);
        expect(row?.filters_compat_v1?.[0]?.values).toEqual(
            expect.arrayContaining(["new_lead", "new_inquiry"])
        );
    });

    it("detects lifecycle stage work units on department list", () => {
        expect(
            departmentUsesLifecycleStageWorkUnits([
                { key: "lifecycle_wu_lead" },
                { key: "lifecycle_wu_qualification" },
            ])
        ).toBe(true);
        expect(departmentUsesLifecycleStageWorkUnits([{ key: "enrollment_pipeline" }])).toBe(false);
    });
});

describe("lifecycleActivationValidationCompact", () => {
    const baseChecks: LifecycleActivationCheckResult[] = [
        {
            id: "workspace_tile",
            label: "Lifecycle name matches tile",
            pass: true,
            href: "/adminV2/workspace",
            detail: "Visible on /workspace.",
        },
        {
            id: "workspace_api",
            label: "Visible in /workspace API",
            pass: true,
            href: null,
            detail: "ok",
        },
        {
            id: "workspace_rendered_tiles",
            label: "Rendered workspace tile list",
            pass: true,
            href: null,
            detail: "ok",
        },
        {
            id: "dept_queue",
            label: "Department — Work Unit Queue",
            pass: true,
            href: "/adminV2/workspace/dept/d1",
            detail: "2 work units on /dept: New Leads, Qualification.",
        },
        {
            id: "work_unit_queue_filters",
            label: "Work unit — queue filters",
            pass: true,
            href: null,
            detail: "Queue filters match selected statuses.",
        },
        {
            id: "work_unit_records_query",
            label: "Work unit — records query",
            pass: true,
            href: "/adminV2/workspace/dept/d1/work-unit/w1",
            detail: "1 record(s) match configured status filters.",
        },
        {
            id: "drawer_actions",
            label: "Actions — configured placements",
            pass: true,
            href: null,
            detail: "Optional: no actions configured yet.",
        },
    ];

    it("maps server checks to five compact rows", () => {
        const compact = buildLifecycleActivationCompactChecks(baseChecks);
        expect(compact).toHaveLength(5);
        expect(compact.map((c) => c.id)).toEqual([
            "workspace_tile",
            "work_units_visible",
            "queue_filters",
            "records_query_ready",
            "actions_configured",
        ]);
        expect(compact.every((c) => c.pass)).toBe(true);
    });

    it("technical details omit default UI and include ids only when expanded helper used", () => {
        const lines = lifecycleActivationTechnicalDetailLines(
            [
                ...baseChecks,
                {
                    id: "builder_owned_marker",
                    label: "Builder-owned metadata marker",
                    pass: true,
                    href: null,
                    detail: "metadata.lifecycle_builder_owned_v1 is present.",
                },
            ],
            { runtimeDepartmentId: "dept-uuid", orgId: "org-uuid" }
        );
        expect(lines.some((l) => l.includes("dept-uuid"))).toBe(true);
        expect(lines.some((l) => l.includes("org-uuid"))).toBe(true);
        expect(lines.some((l) => l.includes("builder_owned"))).toBe(true);
    });
});

describe("workspace tile rollup for lifecycle work units", () => {
    it("shows work unit names instead of generic enrollment pipeline copy", () => {
        const line = buildWorkspaceRootDepartmentTileRollupLine({
            departmentKey: "lead_management",
            workUnitCount: 2,
            pipelineExact: null,
            workUnitNames: ["New Leads", "Qualification"],
        });
        expect(line).toBe("Work units: New Leads, Qualification");
    });
});
