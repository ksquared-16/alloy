import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    clampLifecycleDescription,
    lifecycleWorkspaceTileDescription,
    LIFECYCLE_DESCRIPTION_MAX_CHARS,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    buildLifecycleStageQueueDefinition,
    queueStatusKeysForStageWorkUnitSnapshot,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { snapshotEnrollmentPipelineWorkUnit } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import {
    buildLifecycleActivationCompactChecks,
    lifecycleActivationCompactAllPass,
} from "@/lib/lifecycle/lifecycleActivationValidationCompact";
import {
    LIFECYCLE_RECORDS_QUERY_ZERO_COPY,
    queueFilterIncludesExpectedStatuses,
    validateLifecycleStageWorkUnitQueueFilter,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationCheckResult } from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const activation: LifecycleActivationV1 = {
    version: 1,
    lifecycle_name: "Lead Management",
    primary_entity: "opportunity",
    primary_record_label: "Lead",
    process_id: "proc-1",
    stage_key: "lead",
    stage_label: "Lead",
    work_unit_id: "wu-1",
    work_unit_name: "New Leads",
    status_keys: ["new_inquiry"],
    status_labels: ["New inquiry"],
    action_definition_id: null,
    action_placement_ids: [],
    activation_owned: true,
    completed_steps: 4,
    updated_at: "2026-05-01T00:00:00.000Z",
};

const statusPayload: EnrollmentStatusStagesPayload = {
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
            has_custom_assignments: true,
            statuses: [
                {
                    status_key: "qualified",
                    status_label: "Qualified",
                    sort_order: 1,
                    assignment_source: "metadata",
                    has_metadata_override: false,
                },
            ],
        },
    },
};

describe("lifecycle description", () => {
    it("clamps description to 120 characters", () => {
        expect(LIFECYCLE_DESCRIPTION_MAX_CHARS).toBe(120);
        expect(clampLifecycleDescription("x".repeat(200)).length).toBe(120);
    });

    it("workspace tile uses description with configured fallback", () => {
        expect(lifecycleWorkspaceTileDescription("Custom copy", "Enrollment")).toBe("Custom copy");
        expect(lifecycleWorkspaceTileDescription("", "Enrollment")).toBe("Enrollment");
        expect(lifecycleWorkspaceTileDescription(null, "")).toBe("Configured lifecycle workspace.");
    });

    it("create form enforces description limit and helper copy", () => {
        const form = read("components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx");
        expect(form).toContain("LIFECYCLE_DESCRIPTION_MAX_CHARS");
        expect(form).toContain("Shown on the workspace tile.");
        expect(form).toContain("maxLength={LIFECYCLE_DESCRIPTION_MAX_CHARS}");
    });

    it("edit lifecycle modal and builder route persist description", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleRenameModal.tsx")).toContain(
            "lifecycle-rename-description-input"
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "update_process_description"
        );
        expect(read("lib/lifecycle/clientCreateLifecycleViaBuilder.ts")).toContain("description: tileDescription");
        expect(read("app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts")).toContain(
            "clampLifecycleDescription"
        );
    });

    it("workspace grid shows department description on tile", () => {
        expect(read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx")).toContain("d.description");
    });
});

describe("builder-owned queue filter validation", () => {
    it("passes when lifecycle_wu queue_definition includes selected statuses", () => {
        const queue_definition = buildLifecycleStageQueueDefinition({
            stageKey: "lead",
            label: "New Leads",
            statusKeys: ["new_inquiry"],
        });
        const snapshot = snapshotEnrollmentPipelineWorkUnit({
            id: "wu-1",
            key: "lifecycle_wu_lead",
            name: "New Leads",
            is_active: true,
            queue_definition,
        });
        const queueKeys = queueStatusKeysForStageWorkUnitSnapshot(snapshot, "lead");
        expect(queueFilterIncludesExpectedStatuses(queueKeys, ["new_inquiry"])).toBe(true);

        const row = validateLifecycleStageWorkUnitQueueFilter({
            stageKey: "lead",
            workUnit: {
                id: "wu-1",
                key: "lifecycle_wu_lead",
                name: "New Leads",
                queue_definition,
                metadata: { lifecycle_stage_key: "lead", lifecycle_builder_owned_v1: { builder_owned: true } },
            },
            statusPayload,
            activation,
        });
        expect(row.pass).toBe(true);
        expect(row.work_unit_key).toBe("lifecycle_wu_lead");
    });

    it("runtime validation uses lifecycle_wu rows for builder-owned departments", () => {
        const v = read("lib/lifecycle/validateLifecycleActivationRuntime.ts");
        expect(v).toContain("builderOwnedRuntime && lifecycleStageWorkUnits.length");
        expect(v).toContain("work_unit_queue_filters");
        expect(v).toContain("listLifecycleStageWorkUnitsForDepartment");
        expect(v).not.toContain("syncDepartmentQueueForStage");
    });

    it("compact validation reads work_unit_queue_filters not enrollment_pipeline", () => {
        const compact = read("lib/lifecycle/lifecycleActivationValidationCompact.ts");
        expect(compact).toContain("work_unit_queue_filters");
        expect(compact).toContain("records_query_ready");
        expect(compact).not.toContain("records_matched");
    });
});

describe("records query validation semantics", () => {
    const basePassChecks = (
        recordsDetail: string,
        recordsPass: boolean
    ): LifecycleActivationCheckResult[] => [
        {
            id: "workspace_tile",
            label: "x",
            pass: true,
            href: null,
            detail: "ok",
        },
        { id: "workspace_api", label: "x", pass: true, href: null, detail: "ok" },
        { id: "workspace_rendered_tiles", label: "x", pass: true, href: null, detail: "ok" },
        { id: "dept_queue", label: "x", pass: true, href: null, detail: "ok" },
        {
            id: "work_unit_queue_filters",
            label: "x",
            pass: true,
            href: null,
            detail: "filters ok",
        },
        {
            id: "work_unit_records_query",
            label: "x",
            pass: recordsPass,
            href: null,
            detail: recordsDetail,
        },
        { id: "drawer_actions", label: "x", pass: true, href: null, detail: "ok" },
    ];

    it("records query ready passes with informational zero-count copy", () => {
        const compact = buildLifecycleActivationCompactChecks(
            basePassChecks(LIFECYCLE_RECORDS_QUERY_ZERO_COPY, true)
        );
        const records = compact.find((c) => c.id === "records_query_ready");
        expect(records?.pass).toBe(true);
        expect(records?.informational).toBe(true);
        expect(lifecycleActivationCompactAllPass(compact)).toBe(true);
    });

    it("records query ready fails only on query error", () => {
        const compact = buildLifecycleActivationCompactChecks(
            basePassChecks("Records query failed: permission denied", false)
        );
        expect(compact.find((c) => c.id === "records_query_ready")?.pass).toBe(false);
        expect(lifecycleActivationCompactAllPass(compact)).toBe(false);
    });
});
