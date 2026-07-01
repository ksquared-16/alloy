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

    it("builds operator slug href from queueKey for configured pipeline lanes", () => {
        const child = {
            rowKey: "wu-pipe:new_inquiry",
            label: "New Inquiry",
            workUnitId: "wu-pipe",
            workUnitKey: "enrollment_pipeline",
            queueKey: "new_inquiry",
            kind: "configured_queue" as const,
        };
        // Lane row navigates to its own Work View slug — resolver maps it back to the parent WU
        expect(workspaceNavChildHref("/workspace", "dept-1", child)).toBe(
            "/workspace/work-unit/new-inquiry"
        );
    });

    it("marks configured queue child active when workUnitSlug matches the queue key slug", () => {
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
        expect(
            isWorkspaceNavChildActive({
                departmentId: null,
                workUnitId: null,
                workUnitSlug: "billing",
                activeQueueKey: null,
                child,
                deptId: "dept-enrollment",
            })
        ).toBe(false);
    });

    it("workspaceDeptQueueNavHref with workUnitKey produces canonical /work-unit/[queueSlug] URL", () => {
        const href = workspaceDeptQueueNavHref("/workspace", "dept-1", "wu-pipe", "new_leads", "enrollment_pipeline");
        // URL uses the queue/work-view key slug — resolver maps it to the parent enrollment pipeline
        expect(href).toBe("/workspace/work-unit/new-leads");
        expect(href).not.toContain("/dept/");
        expect(href).not.toContain("/adminV2/");
    });

    it("workspaceDeptQueueNavHref without workUnitKey still produces canonical /work-unit/[queueSlug] URL", () => {
        // queueKey alone is enough — operatorWorkUnitHrefFromKey uses it as slug
        const hrefWithQueueOnly = workspaceDeptQueueNavHref("/workspace", "dept-1", "wu-pipe", "new_leads");
        expect(hrefWithQueueOnly).toBe("/workspace/work-unit/new-leads");
        expect(hrefWithQueueOnly).not.toContain("/dept/");
        // ID-only (no key at all) → last remaining legacy fallback
        const hrefIdOnly = workspaceDeptQueueNavHref("/workspace", "dept-1", "wu-pipe", null);
        expect(hrefIdOnly).toContain("/dept/");
        expect(hrefIdOnly).not.toContain("queue=");
    });

    it("workspaceDeptQueueNavHref null queueKey with workUnitKey produces /work-unit/[slug] without queue param", () => {
        const href = workspaceDeptQueueNavHref("/workspace", "dept-1", "wu-pipe", null, "billing");
        expect(href).toBe("/workspace/work-unit/billing");
        expect(href).not.toContain("/dept/");
    });

    it("buildWorkspaceNavDeptChildren pipeline lanes carry workUnitKey from the pipeline work unit", () => {
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
        expect(children.every((c) => c.workUnitKey === "enrollment_pipeline")).toBe(true);
    });

    it("buildWorkspaceNavDeptChildren non-pipeline WU rows carry their own key", () => {
        const wus: WorkspaceNavTreeWu[] = [
            { id: "wu-billing", department_id: "dept-2", key: "billing", name: "Billing" },
            { id: "wu-hr", department_id: "dept-2", key: "hr_onboarding", name: "HR" },
        ];
        const children = buildWorkspaceNavDeptChildren("dept-2", wus);
        const billingChild = children.find((c) => c.workUnitId === "wu-billing");
        const hrChild = children.find((c) => c.workUnitId === "wu-hr");
        expect(billingChild?.workUnitKey).toBe("billing");
        expect(hrChild?.workUnitKey).toBe("hr_onboarding");
        // And their hrefs use canonical /work-unit/[slug]
        expect(workspaceNavChildHref("/workspace", "dept-2", billingChild!)).toBe("/workspace/work-unit/billing");
        expect(workspaceNavChildHref("/workspace", "dept-2", hrChild!)).toBe("/workspace/work-unit/hr-onboarding");
    });

    it("Workspace Active Pipeline link uses /workspace/work-unit/active-pipeline", () => {
        const child = {
            rowKey: "wu-pipe:active_pipeline",
            label: "Active Pipeline",
            workUnitId: "wu-pipe",
            workUnitKey: "enrollment_pipeline",
            queueKey: "active_pipeline",
            kind: "configured_queue" as const,
        };
        // Work View slug in URL — resolver maps active_pipeline → enrollment parent runtime
        expect(workspaceNavChildHref("/workspace", "dept-1", child)).toBe(
            "/workspace/work-unit/active-pipeline"
        );
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
