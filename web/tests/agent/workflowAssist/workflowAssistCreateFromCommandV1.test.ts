import { describe, expect, it } from "vitest";

import {
    buildWorkflowAssistCreateProposeFromIntent,
    parseWorkflowAssistCreateIntent,
} from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import { parseWorkflowAssistReadIntent } from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { routeCommandSurface } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";

describe("parseWorkflowAssistCreateIntent", () => {
    it("classifies tour reminder create commands", () => {
        const p = parseWorkflowAssistCreateIntent(
            "Create a workflow that sends a reminder 3 days before tours"
        );
        expect(p?.sub_intent).toBe("create_workflow_proposal");
        expect(p?.template_id).toBe("tour_reminder");
    });

    it("classifies remind-before-tour without create verb", () => {
        const p = parseWorkflowAssistCreateIntent("Send a reminder before tours");
        expect(p?.template_id).toBe("tour_reminder");
    });

    it("classifies when/move enrollment phrasing", () => {
        const p = parseWorkflowAssistCreateIntent("When forms complete move them to ready to enroll");
        expect(p?.template_id).toBe("enrollment_when_move");
    });

    it("builds disabled tour reminder draft proposal", () => {
        const intent = parseWorkflowAssistCreateIntent(
            "Create a workflow that sends a reminder 3 days before tours"
        );
        expect(intent).not.toBeNull();
        const built = buildWorkflowAssistCreateProposeFromIntent(intent!, "3 days before tours");
        expect(built.request.proposal_kind).toBe("create_workflow");
        if (built.request.proposal_kind !== "create_workflow") return;
        expect(built.request.draft.enabled).toBe(false);
        expect(built.request.draft.name).toBe("Tour Reminder Draft");
        expect(built.request.draft.event_type).toBe("opportunity_schedule_tour_followup");
        expect(built.request.draft.entity_type).toBe("opportunity");
    });
});

describe("routeCommandSurface create vs read", () => {
    it("routes create workflow command to workflow_assist with create intent", () => {
        const r = routeCommandSurface("Create a workflow that sends a reminder 3 days before tours");
        expect(r.route).toBe("workflow_assist");
        expect(r.workflowAssistCreateIntent?.template_id).toBe("tour_reminder");
        expect(r.workflowAssistReadIntent).toBeNull();
    });

    it("routes when/move phrase to create not summary", () => {
        const r = routeCommandSurface("when forms complete move them to ready to enroll");
        expect(r.workflowAssistCreateIntent?.template_id).toBe("enrollment_when_move");
        expect(r.workflowAssistReadIntent).toBeNull();
    });

    it("still routes failed runs to read intent", () => {
        const r = routeCommandSurface("Show me workflows that failed this week");
        expect(r.workflowAssistCreateIntent).toBeNull();
        expect(r.workflowAssistReadIntent?.sub_intent).toBe("failed_runs_last_7d");
    });

    it("read parser alone still defaults when/move to summary", () => {
        const p = parseWorkflowAssistReadIntent("When forms complete move them to ready to enroll");
        expect(p.sub_intent).toBe("workflow_summary");
    });
});
