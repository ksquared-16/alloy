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

    it("routes workflow phrase to workflow_assist_notice", () => {
        const r = routeCommandSurface("when forms complete move them to ready to enroll");
        expect(r.route).toBe("workflow_assist_notice");
        expect(WORKFLOW_ASSIST_NOTICE_TEXT).toContain("Workflow Assist");
    });

    it("routes ambient pronoun to task_assist when context exists", () => {
        const r = routeCommandSurface("text them about forms", { hasAmbientOpportunity: true });
        expect(r.route).toBe("task_assist");
    });
});
