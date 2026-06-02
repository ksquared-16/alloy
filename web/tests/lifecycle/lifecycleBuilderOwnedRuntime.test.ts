import { describe, expect, it } from "vitest";
import {
    deptPipelineSurfaceShowsLegacyEnrollmentLanes,
    deptUsesBuilderOwnedLifecycleRuntime,
    filterWorkUnitsForBuilderOwnedDeptDisplay,
    isLifecycleStageWorkUnitRow,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { stageSavedStatusKeys } from "@/lib/lifecycle/lifecycleActivationStep3";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { buildLifecycleActivationCompactChecks } from "@/lib/lifecycle/lifecycleActivationValidationCompact";
import type { LifecycleActivationCheckResult } from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import { lifecycleWorkspaceTileDescription } from "@/lib/lifecycle/lifecycleBuilderConfig";

describe("builderOwnedLifecycleRuntime", () => {
    it("detects builder-owned runtime from metadata marker", () => {
        expect(
            deptUsesBuilderOwnedLifecycleRuntime(
                {
                    lifecycle_builder_owned_v1: {
                        source: "lifecycle_builder",
                        created_by: "u",
                        created_at: "t",
                        process_id: "p",
                    },
                },
                [{ key: "enrollment_pipeline" }]
            )
        ).toBe(true);
    });

    it("filters display work units to lifecycle_wu rows only", () => {
        const rows = filterWorkUnitsForBuilderOwnedDeptDisplay([
            { id: "1", name: "New Leads", key: "lifecycle_wu_lead" },
            { id: "2", name: "Enrollment Pipeline", key: "enrollment_pipeline" },
            { id: "3", name: "Qualification", key: "lifecycle_wu_qualification" },
        ]);
        expect(rows.map((r) => r.key)).toEqual(["lifecycle_wu_lead", "lifecycle_wu_qualification"]);
    });

    it("detects legacy enrollment pipeline lane labels", () => {
        expect(
            deptPipelineSurfaceShowsLegacyEnrollmentLanes([
                { label: "New Leads" },
                { label: "Tours" },
                { label: "Follow Up" },
                { label: "Waitlist" },
            ])
        ).toBe(true);
        expect(deptPipelineSurfaceShowsLegacyEnrollmentLanes([{ label: "New Leads" }])).toBe(false);
    });

    it("stage keys for builder-owned start empty until explicit save", () => {
        const payload: EnrollmentStatusStagesPayload = {
            entity_type: "opportunities",
            stage_keys: ["lead"],
            unassigned: [],
            stages: {
                lead: {
                    has_custom_assignments: false,
                    statuses: [
                        {
                            status_key: "new_inquiry",
                            status_label: "New inquiry",
                            sort_order: 1,
                            assignment_source: "canonical",
                            has_metadata_override: false,
                        },
                    ],
                },
            },
        };
        expect(stageSavedStatusKeys(payload, "lead")).toEqual(["new_inquiry"]);
        expect(stageSavedStatusKeys(payload, "lead", { explicitAssignmentsOnly: true })).toEqual([]);
    });
});

describe("lifecycle activation validation compact", () => {
    it("fails work units row when legacy lanes would render", () => {
        const checks: LifecycleActivationCheckResult[] = [
            {
                id: "dept_runtime_lifecycle_work_units",
                label: "x",
                pass: false,
                href: null,
                detail: "No lifecycle_wu_* work units found.",
            },
            {
                id: "dept_no_legacy_pipeline_lanes",
                label: "y",
                pass: false,
                href: null,
                detail: "Legacy lanes",
            },
            { id: "dept_queue", label: "z", pass: false, href: null, detail: "missing" },
        ];
        const compact = buildLifecycleActivationCompactChecks(checks);
        expect(compact.find((c) => c.id === "work_units_visible")?.pass).toBe(false);
    });
});

describe("lifecycle workspace description", () => {
    it("uses process description on tile", () => {
        expect(lifecycleWorkspaceTileDescription("Lead intake copy", "Lead Management")).toBe(
            "Lead intake copy"
        );
    });
});

describe("lifecycle stage work unit keys", () => {
    it("maps lead and qualification stages", () => {
        expect(lifecycleStageWorkUnitKey("lead")).toBe("lifecycle_wu_lead");
        expect(lifecycleStageWorkUnitKey("qualification")).toBe("lifecycle_wu_qualification");
        expect(isLifecycleStageWorkUnitRow({ key: "lifecycle_wu_lead" })).toBe(true);
    });
});
