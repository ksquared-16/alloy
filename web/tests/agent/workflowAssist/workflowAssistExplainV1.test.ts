import { describe, expect, it } from "vitest";

import {
    buildWorkflowAssistExplainV1,
    parseWorkflowAssistExplainRequest,
    type WorkflowAssistExplainSourceDataV1,
} from "@/lib/agent/workflowAssist/workflowAssistExplainV1";
import { parseWorkflowAssistReadIntent } from "@/lib/agent/workflowAssist/workflowAssistReadV1";

const entityId = "00000000-0000-4000-8000-000000000099";
const baseRequest = {
    version: 1 as const,
    entity_type: "opportunities",
    entity_id: entityId,
};

function source(partial: Partial<WorkflowAssistExplainSourceDataV1>): WorkflowAssistExplainSourceDataV1 {
    return {
        request: baseRequest,
        normalized_entity_type: "opportunities",
        events: [],
        workflows: [],
        runs: [],
        failed_actions: [],
        ...partial,
    };
}

describe("parseWorkflowAssistReadIntent explain_v1", () => {
    it("classifies why-not-moved to explain_v1", () => {
        const p = parseWorkflowAssistReadIntent("Why didn't this family get moved?", { hasAmbientOpportunity: true });
        expect(p.sub_intent).toBe("explain_v1");
    });
});

describe("parseWorkflowAssistExplainRequest", () => {
    it("requires entity_type and entity_id", () => {
        const r = parseWorkflowAssistExplainRequest(new URLSearchParams({ entity_type: "opportunities" }));
        expect(r.ok).toBe(false);
    });
});

describe("buildWorkflowAssistExplainV1", () => {
    it("returns insufficient_context without entity", () => {
        const ex = buildWorkflowAssistExplainV1(
            source({ normalized_entity_type: "", request: { ...baseRequest, entity_id: "" } })
        );
        expect(ex.status).toBe("insufficient_context");
        expect(ex.confidence).toBe("high");
    });

    it("returns no_event_found when events empty", () => {
        const ex = buildWorkflowAssistExplainV1(source({}));
        expect(ex.explain_engine).toBe(0);
        expect(ex.status).toBe("no_event_found");
    });

    it("returns no_matching_workflow when event exists but no workflows", () => {
        const ex = buildWorkflowAssistExplainV1(
            source({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                        entity_id: entityId,
                    },
                ],
            })
        );
        expect(ex.status).toBe("no_matching_workflow");
        expect(ex.links.event_id).toBe("ev-1");
    });

    it("returns workflow_disabled when all matches disabled", () => {
        const ex = buildWorkflowAssistExplainV1(
            source({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                        entity_id: entityId,
                    },
                ],
                workflows: [
                    {
                        id: "wf-1",
                        name: "Status mover",
                        enabled: false,
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                    },
                ],
            })
        );
        expect(ex.status).toBe("workflow_disabled");
        expect(ex.links.workflow_id).toBe("wf-1");
    });

    it("returns no_run_created when enabled workflow but no run", () => {
        const ex = buildWorkflowAssistExplainV1(
            source({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                        entity_id: entityId,
                    },
                ],
                workflows: [
                    {
                        id: "wf-1",
                        name: "Status mover",
                        enabled: true,
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                    },
                ],
            })
        );
        expect(ex.status).toBe("no_run_created");
    });

    it("returns run_failed when run status failed", () => {
        const ex = buildWorkflowAssistExplainV1(
            source({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                        entity_id: entityId,
                    },
                ],
                workflows: [
                    {
                        id: "wf-1",
                        name: "Status mover",
                        enabled: true,
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                    },
                ],
                runs: [
                    {
                        id: "run-1",
                        workflow_id: "wf-1",
                        event_id: "ev-1",
                        status: "failed",
                        error: "Condition evaluation error",
                        started_at: "2026-05-10T12:01:00Z",
                        has_failed_action: false,
                        workflow_name: "Status mover",
                        skip_reason: null,
                    },
                ],
            })
        );
        expect(ex.status).toBe("run_failed");
        expect(ex.links.run_id).toBe("run-1");
    });

    it("returns action_failed when action step failed", () => {
        const ex = buildWorkflowAssistExplainV1(
            source({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "message_queued",
                        entity_type: "opportunities",
                        entity_id: entityId,
                    },
                ],
                workflows: [
                    {
                        id: "wf-1",
                        name: "Reminder",
                        enabled: true,
                        event_type: "message_queued",
                        entity_type: "opportunities",
                    },
                ],
                runs: [
                    {
                        id: "run-1",
                        workflow_id: "wf-1",
                        event_id: "ev-1",
                        status: "completed",
                        error: null,
                        started_at: "2026-05-10T12:01:00Z",
                        has_failed_action: true,
                        workflow_name: "Reminder",
                        skip_reason: null,
                    },
                ],
                failed_actions: [
                    {
                        workflow_run_id: "run-1",
                        action_type: "send_sms",
                        status: "failed",
                        error: "Missing phone",
                    },
                ],
            })
        );
        expect(ex.status).toBe("action_failed");
    });

    it("returns run_successful when completed without failed action", () => {
        const ex = buildWorkflowAssistExplainV1(
            source({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                        entity_id: entityId,
                    },
                ],
                workflows: [
                    {
                        id: "wf-1",
                        name: "Status mover",
                        enabled: true,
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                    },
                ],
                runs: [
                    {
                        id: "run-1",
                        workflow_id: "wf-1",
                        event_id: "ev-1",
                        status: "completed",
                        error: null,
                        started_at: "2026-05-10T12:01:00Z",
                        has_failed_action: false,
                        workflow_name: "Status mover",
                        skip_reason: null,
                    },
                ],
            })
        );
        expect(ex.status).toBe("run_successful");
    });
});
