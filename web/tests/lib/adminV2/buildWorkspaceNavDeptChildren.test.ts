import { describe, expect, it } from "vitest";
import {
    buildWorkspaceNavDeptChildren,
    isWorkspaceNavChildActive,
    workspaceDeptQueueNavHref,
    workspaceNavChildHref,
} from "@/lib/adminV2/navigation/buildWorkspaceNavDeptChildren";
import type { WorkspaceNavTreeWu } from "@/lib/adminV2/navigation/workspaceNavTreeCache";

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

    it("builds work-unit queue href consistent with dept oper console", () => {
        const child = {
            rowKey: "wu-pipe:new_inquiry",
            label: "New Inquiry",
            workUnitId: "wu-pipe",
            queueKey: "new_inquiry",
            kind: "configured_queue" as const,
        };
        expect(workspaceNavChildHref("/adminV2/workspace", "dept-1", child)).toBe(
            "/adminV2/workspace/dept/dept-1/work-unit/wu-pipe?queue=new_inquiry"
        );
        expect(workspaceDeptQueueNavHref("/adminV2/workspace", "dept-1", "wu-pipe", "new_inquiry")).toBe(
            "/adminV2/workspace/dept/dept-1/work-unit/wu-pipe?queue=new_inquiry"
        );
    });

    it("marks configured queue child active from queue search param", () => {
        const child = {
            rowKey: "wu-pipe:new_inquiry",
            label: "New Inquiry",
            workUnitId: "wu-pipe",
            queueKey: "new_inquiry",
            kind: "configured_queue" as const,
        };
        expect(
            isWorkspaceNavChildActive({
                departmentId: "dept-1",
                workUnitId: "wu-pipe",
                activeQueueKey: "new_inquiry",
                child,
                deptId: "dept-1",
            })
        ).toBe(true);
        expect(
            isWorkspaceNavChildActive({
                departmentId: "dept-1",
                workUnitId: "wu-pipe",
                activeQueueKey: "enrolling",
                child,
                deptId: "dept-1",
            })
        ).toBe(false);
    });
});
