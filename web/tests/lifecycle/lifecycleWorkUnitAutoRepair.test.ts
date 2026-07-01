import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
    buildLifecycleWorkUnitDeptRuntimeDebug,
    countStagesWithSavedWorkUnitQueueConfig,
    stageHasSavedWorkUnitQueueConfig,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";

const repoRoot = path.resolve(__dirname, "../../..");

const stages: LifecycleBuilderStageRecord[] = [
    { id: "st-lead", key: "lead", label: "Lead", sort_order: 0, is_active: true },
    { id: "st-qual", key: "qualification", label: "Qualification", sort_order: 1, is_active: true },
];

const payloadWithLeadStatuses: EnrollmentStatusStagesPayload = {
    entity_type: "opportunities",
    stage_keys: ["lead", "qualification"],
    unassigned: [],
    stages: {
        lead: {
            has_custom_assignments: true,
            statuses: [
                {
                    status_key: "new_inquiry",
                    status_label: "New inquiry",
                    sort_order: 1,
                    assignment_source: "metadata",
                    has_metadata_override: false,
                },
            ],
        },
        qualification: {
            has_custom_assignments: false,
            statuses: [],
        },
    },
};

describe("lifecycle work unit auto-repair helpers", () => {
    it("detects stage saved queue config from explicit status assignments", () => {
        expect(stageHasSavedWorkUnitQueueConfig("lead", payloadWithLeadStatuses, null)).toBe(true);
        expect(stageHasSavedWorkUnitQueueConfig("qualification", payloadWithLeadStatuses, null)).toBe(
            false
        );
        expect(
            countStagesWithSavedWorkUnitQueueConfig(stages, payloadWithLeadStatuses, null)
        ).toBe(1);
    });

    it("detects stage saved queue config from activation bundle for that stage", () => {
        const activation: LifecycleActivationV1 = {
            version: 1,
            lifecycle_name: "Lead Management",
            primary_entity: "opportunity",
            primary_record_label: "Lead",
            process_id: "proc-1",
            stage_key: "qualification",
            stage_label: "Qualification",
            work_unit_id: "wu-old",
            work_unit_name: "Qualification",
            status_keys: [],
            status_labels: [],
            action_definition_id: null,
            action_placement_ids: [],
            activation_owned: true,
            completed_steps: 4,
            updated_at: "2026-05-01T00:00:00.000Z",
        };
        expect(stageHasSavedWorkUnitQueueConfig("qualification", payloadWithLeadStatuses, activation)).toBe(
            true
        );
        expect(countStagesWithSavedWorkUnitQueueConfig(stages, payloadWithLeadStatuses, activation)).toBe(
            2
        );
    });

    it("builds debug with configure-lifecycle reason when no stage configs", () => {
        const debug = buildLifecycleWorkUnitDeptRuntimeDebug({
            builderOwned: true,
            activeStagesCount: 2,
            stageWorkUnitConfigsCount: 0,
            lifecycleWuRowsCount: 0,
            repairAttempted: false,
        });
        expect(debug.reason_no_work_units_rendered).toBe("no_stage_work_unit_queue_configuration");
    });

    it("clears reason when lifecycle_wu rows are present", () => {
        const debug = buildLifecycleWorkUnitDeptRuntimeDebug({
            builderOwned: true,
            activeStagesCount: 2,
            stageWorkUnitConfigsCount: 2,
            lifecycleWuRowsCount: 2,
            repairAttempted: true,
            repairOk: true,
        });
        expect(debug.reason_no_work_units_rendered).toBeNull();
    });
});

describe("lifecycle work unit auto-repair wiring", () => {
    it("bootstrap loader inspects lifecycle work units without repair on navigation", () => {
        const loader = fs.readFileSync(
            path.join(repoRoot, "web/lib/workspace/loadDeptOperationalBootstrap.ts"),
            "utf8"
        );
        expect(loader).toContain("inspectBuilderOwnedLifecycleWorkUnitsForDept");
        expect(loader).not.toContain("autoRepairBuilderOwnedLifecycleWorkUnitsForDept");
        expect(loader).toContain("departmentWorkUnitIdsForLifecycleScope");
        expect(loader).toContain("lifecycle_work_unit_runtime");
    });

    it("repair-work-units route restricts to stages with saved config", () => {
        const route = fs.readFileSync(
            path.join(repoRoot, "web/app/api/admin/lifecycle-catalog/repair-work-units/route.ts"),
            "utf8"
        );
        expect(route).toContain("onlyStagesWithSavedWorkUnitConfig: true");
    });

    it("dept page shows Configure Lifecycle empty state for builder-owned depts without queue config", () => {
        const page = fs.readFileSync(
            path.join(repoRoot, "web/app/adminV2/workspace/dept/[departmentId]/page.tsx"),
            "utf8"
        );
        expect(page).toContain("No Work Unit Queues have been configured yet.");
        expect(page).toContain("Configure Lifecycle");
        expect(page).toContain("dept-builder-owned-lifecycle-empty");
        expect(page).toContain("dept-lifecycle-wu-debug");
        expect(page).not.toMatch(
            /deptBuilderOwnedNoLifecycleWu[\s\S]{0,400}No configured Work Unit UI was found/
        );
    });

    it("repair button builds queue names for all stages with saved statuses", () => {
        const board = fs.readFileSync(
            path.join(repoRoot, "web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx"),
            "utf8"
        );
        expect(board).toContain("queue_names_by_stage");
        expect(board).toContain("explicitAssignmentsOnly: true");
        expect(board).toContain("bumpWorkspaceCache");
    });
});
