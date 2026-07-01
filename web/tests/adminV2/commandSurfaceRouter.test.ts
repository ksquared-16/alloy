import { describe, expect, it } from "vitest";

import {
    commandSurfaceEntitySearchQuery,
    routeCommandSurface,
    WORKFLOW_ASSIST_NOTICE_TEXT,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";

describe("routeCommandSurface", () => {
    it("routes Mitchell family text command to task_assist", () => {
        const r = routeCommandSurface(
            "text the Mitchell family that we're excited for her youngest child to start"
        );
        expect(r.route).toBe("task_assist");
        expect(r.taskAssistIntent?.intent_type).toBe("draft_message");
        expect(r.taskAssistIntent?.channel_hint).toBe("sms");
    });

    it("entity search q uses Mitchell not full sentence", () => {
        const r = routeCommandSurface("text the Mitchell family that we're excited for her youngest child to start");
        const q = commandSurfaceEntitySearchQuery(r.slots.raw, r.slots, r.taskAssistIntent);
        expect(q.toLowerCase()).toMatch(/mitchell/);
        expect(q.length).toBeLessThan(40);
        expect(q.toLowerCase()).not.toContain("excited");
    });

    it("routes email schedule command to task_assist", () => {
        const r = routeCommandSurface("email Smith family tomorrow about tour next steps");
        expect(r.route).toBe("task_assist");
        expect(r.taskAssistIntent?.intent_type).toBe("schedule_message");
    });

    it("routes reminder command to task_assist", () => {
        const r = routeCommandSurface("remind me to follow up with Smith tomorrow");
        expect(r.route).toBe("task_assist");
        expect(r.taskAssistIntent?.intent_type).toBe("create_reminder");
    });

    it("routes job overview layout command to job_layout", () => {
        const r = routeCommandSurface("make the job overview more customer focused");
        expect(r.route).toBe("job_layout");
    });

    it("routes field config command to config_layout_assist", () => {
        const r = routeCommandSurface("Create Preferred Start Date field");
        expect(r.route).toBe("config_layout_assist");
    });

    it("routes create field for inquiries to config_layout_assist", () => {
        const r = routeCommandSurface("Create Preferred Start Date for inquiries");
        expect(r.route).toBe("config_layout_assist");
    });

    it("routes layout integrity question to config_layout_assist", () => {
        const r = routeCommandSurface("Show layouts with inconsistencies");
        expect(r.route).toBe("config_layout_assist");
    });

    it("prefers config_layout_assist over job_layout for drawer field commands", () => {
        const r = routeCommandSurface("Expose subsidy tier in the summary drawer");
        expect(r.route).toBe("config_layout_assist");
    });

    it("routes when/move workflow phrase to create proposal intent", () => {
        const r = routeCommandSurface("when forms complete move them to ready to enroll");
        expect(r.route).toBe("workflow_assist");
        expect(r.workflowAssistCreateIntent?.template_id).toBe("enrollment_when_move");
        expect(r.workflowAssistReadIntent).toBeNull();
    });

    it("routes explicit create workflow to create intent", () => {
        const r = routeCommandSurface("Create a workflow that sends a reminder 3 days before tours");
        expect(r.workflowAssistCreateIntent?.template_id).toBe("tour_reminder");
        expect(WORKFLOW_ASSIST_NOTICE_TEXT).toContain("workflow configuration");
    });

    it("routes failed-workflow phrase to workflow_assist failed_runs intent", () => {
        const r = routeCommandSurface("Show me workflows that failed this week");
        expect(r.route).toBe("workflow_assist");
        expect(r.workflowAssistReadIntent?.sub_intent).toBe("failed_runs_last_7d");
    });

    it("routes why-didnt workflow question to explain_v0", () => {
        const r = routeCommandSurface("Why didn't the workflow run for this opportunity?", {
            hasAmbientOpportunity: true,
        });
        expect(r.route).toBe("workflow_assist");
        expect(r.workflowAssistReadIntent?.sub_intent).toBe("explain_v1");
    });

    it("non-workflow routes set workflowAssistReadIntent null", () => {
        const r = routeCommandSurface("text the Smith family about tour");
        expect(r.route).toBe("task_assist");
        expect(r.workflowAssistReadIntent).toBeNull();
    });

    it("routes ambient pronoun to task_assist when context exists", () => {
        const r = routeCommandSurface("text them about forms", { hasAmbientOpportunity: true });
        expect(r.route).toBe("task_assist");
    });
});
