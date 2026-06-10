import { describe, expect, it } from "vitest";
import {
    buildWorkspaceNavDeptChildren,
    isWorkspaceNavChildActive,
    workspaceDeptQueueNavHref,
    workspaceNavChildHref,
} from "@/lib/adminV2/navigation/buildWorkspaceNavDeptChildren";
import type { WorkspaceNavTreeWu } from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

const ENROLLMENT_PIPELINE_QD = {
    version: 1,
    entity_type: "opportunity",
    ui: {
        layout: "pipeline_with_attention",
        sections: [
            {
                key: "pipeline",
                label: "Pipeline",
                queue_keys: ["new_inquiry", "enrolling"],
            },
            {
                key: "attention",
                label: "Needs Attention",
                queue_keys: ["needs_attention"],
            },
        ],
    },
    queues: [
        { key: "new_inquiry", label: "New Inquiry", filters: [], sort: [] },
        { key: "enrolling", label: "Enrolling", filters: [], sort: [] },
        { key: "needs_attention", label: "Needs Attention", filters: [], sort: [] },
    ],
} as const;

describe("buildWorkspaceNavDeptChildren", () => {
    it("uses configured pipeline queue labels, not work_units.name", () => {
        const wus: WorkspaceNavTreeWu[] = [
            {
                id: "wu-pipe",
                department_id: "dept-1",
                key: "enrollment_pipeline",
                name: "Enrollment Pipeline",
                queue_definition: ENROLLMENT_PIPELINE_QD,
            },
        ];
        const children = buildWorkspaceNavDeptChildren("dept-1", wus);
        expect(children.map((c) => c.label)).toEqual(["New Inquiry", "Enrolling"]);
        expect(children.every((c) => c.kind === "configured_queue")).toBe(true);
        expect(children[0]?.queueKey).toBe("new_inquiry");
    });

    it("expands enrollment_pipeline v2 domain_with_attention into configured lane labels", () => {
        const wus: WorkspaceNavTreeWu[] = [
            {
                id: "wu-pipe",
                department_id: "dept-enrollment",
                key: "enrollment_pipeline",
                name: "Enrollment Pipeline",
                queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
            },
        ];
        const children = buildWorkspaceNavDeptChildren("dept-enrollment", wus);
        expect(children.map((c) => c.label)).toEqual([
            "New Leads",
            "Tours",
            "Follow Up",
            "Waitlist",
            "Enrolling",
            "Enrolled",
        ]);
        expect(children.every((c) => c.kind === "configured_queue")).toBe(true);
        expect(children[0]?.queueKey).toBe("new_leads");
    });

    it("falls back to work unit rows when no pipeline execution surface", () => {
        const wus: WorkspaceNavTreeWu[] = [
            {
                id: "wu-billing",
                department_id: "dept-2",
                key: "billing",
                name: "Billing",
            },
        ];
        const children = buildWorkspaceNavDeptChildren("dept-2", wus);
        expect(children).toHaveLength(1);
        expect(children[0]?.label).toBe("Billing");
        expect(children[0]?.kind).toBe("work_unit");
    });

    it("builds operator slug href for configured pipeline lanes", () => {
        const child = {
            rowKey: "wu-pipe:new_inquiry",
            label: "New Inquiry",
            workUnitId: "wu-pipe",
            workUnitKey: "enrollment_pipeline",
            queueKey: "new_inquiry",
            kind: "configured_queue" as const,
        };
        expect(workspaceNavChildHref("/workspace", "dept-1", child)).toBe(
            "/workspace/work-unit/new-inquiry"
        );
    });

    it("marks configured queue child active from slug route", () => {
        const child = {
            rowKey: "wu-pipe:new_leads",
            label: "New Leads",
            workUnitId: "wu-pipe",
            workUnitKey: "enrollment_pipeline",
            queueKey: "new_leads",
            kind: "configured_queue" as const,
        };
        expect(
            isWorkspaceNavChildActive({
                departmentId: null,
                workUnitId: null,
                workUnitSlug: "new-leads",
                activeQueueKey: null,
                child,
                deptId: "dept-enrollment",
            })
        ).toBe(true);
    });

    it("marks configured queue child active from legacy queue search param", () => {
        const child = {
            rowKey: "wu-pipe:new_inquiry",
            label: "New Inquiry",
            workUnitId: "wu-pipe",
            workUnitKey: "enrollment_pipeline",
            queueKey: "new_inquiry",
            kind: "configured_queue" as const,
        };
        expect(
            isWorkspaceNavChildActive({
                departmentId: "dept-1",
                workUnitId: "wu-pipe",
                workUnitSlug: null,
                activeQueueKey: "new_inquiry",
                child,
                deptId: "dept-1",
            })
        ).toBe(true);
        expect(
            isWorkspaceNavChildActive({
                departmentId: "dept-1",
                workUnitId: "wu-pipe",
                workUnitSlug: null,
                activeQueueKey: "enrolling",
                child,
                deptId: "dept-1",
            })
        ).toBe(false);
    });
});
