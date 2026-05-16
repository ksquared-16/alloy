import { describe, expect, it } from "vitest";

import { buildWorkflowOperationalTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceBuilder";
import { buildWorkflowAssistExplainFromTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistExplainFromTraceV1";
import type { WorkflowOperationalTraceSourceDataV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1";

const entityId = "00000000-0000-4000-8000-000000000099";

function baseSource(overrides: Partial<WorkflowOperationalTraceSourceDataV1> = {}): WorkflowOperationalTraceSourceDataV1 {
    return {
        entity_type: "opportunities",
        entity_id: entityId,
        normalized_entity_type: "opportunities",
        range: "30d",
        workflow_id_filter: null,
        event_type_filter: null,
        events: [],
        workflows: [],
        runs: [],
        conditions_by_workflow: {},
        actions_by_run: {},
        ...overrides,
    };
}

describe("buildWorkflowOperationalTraceV1", () => {
    it("returns insufficient_context without entity", () => {
        const trace = buildWorkflowOperationalTraceV1(
            baseSource({ entity_id: "", normalized_entity_type: "" })
        );
        expect(trace.outcome).toBe("insufficient_context");
        expect(trace.timeline).toEqual([]);
    });

    it("detects condition_mismatch when run skipped and condition failed", () => {
        const wfId = "wf-cond";
        const trace = buildWorkflowOperationalTraceV1(
            baseSource({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                        entity_id: entityId,
                        payload: { new_status_key: "ready", entity_type: "opportunities" },
                    },
                ],
                workflows: [
                    {
                        id: wfId,
                        name: "Status mover",
                        enabled: true,
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                    },
                ],
                conditions_by_workflow: {
                    [wfId]: [
                        {
                            id: "c1",
                            workflow_id: wfId,
                            field_path: "opportunity.status_key",
                            operator: "eq",
                            value: "enrolled",
                            enabled: true,
                        },
                    ],
                },
                runs: [
                    {
                        id: "run-1",
                        workflow_id: wfId,
                        event_id: "ev-1",
                        status: "skipped",
                        error: null,
                        started_at: "2026-05-10T12:01:00Z",
                        completed_at: "2026-05-10T12:01:01Z",
                        event_payload: {
                            entity_type: "opportunities",
                            new_status_key: "ready",
                            opportunity: { status_key: "ready" },
                        },
                        has_failed_action: false,
                        workflow_name: "Status mover",
                        skip_reason: "conditions_not_met",
                    },
                ],
            })
        );
        expect(trace.outcome).toBe("condition_mismatch");
        expect(trace.condition_results.some((c) => !c.passed)).toBe(true);
        expect(trace.timeline.length).toBeGreaterThan(2);
    });

    it("detects action_failed", () => {
        const wfId = "wf-act";
        const runId = "run-1";
        const trace = buildWorkflowOperationalTraceV1(
            baseSource({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "message_queued",
                        entity_type: "opportunities",
                        entity_id: entityId,
                        payload: {},
                    },
                ],
                workflows: [
                    {
                        id: wfId,
                        name: "Notify",
                        enabled: true,
                        event_type: "message_queued",
                        entity_type: "opportunities",
                    },
                ],
                runs: [
                    {
                        id: runId,
                        workflow_id: wfId,
                        event_id: "ev-1",
                        status: "completed",
                        error: null,
                        started_at: "2026-05-10T12:01:00Z",
                        completed_at: "2026-05-10T12:02:00Z",
                        event_payload: {},
                        has_failed_action: true,
                        workflow_name: "Notify",
                        skip_reason: null,
                    },
                ],
                actions_by_run: {
                    [runId]: [
                        {
                            id: "ar-1",
                            workflow_run_id: runId,
                            action_order: 1,
                            action_type: "send_sms",
                            status: "failed",
                            error: "Missing phone",
                            started_at: "2026-05-10T12:01:05Z",
                            completed_at: "2026-05-10T12:01:06Z",
                        },
                    ],
                },
            })
        );
        expect(trace.outcome).toBe("action_failed");
    });

    it("detects run_successful", () => {
        const wfId = "wf-ok";
        const trace = buildWorkflowOperationalTraceV1(
            baseSource({
                events: [
                    {
                        id: "ev-1",
                        occurred_at: "2026-05-10T12:00:00Z",
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                        entity_id: entityId,
                        payload: {},
                    },
                ],
                workflows: [
                    {
                        id: wfId,
                        name: "OK",
                        enabled: true,
                        event_type: "opportunity_status_changed",
                        entity_type: "opportunities",
                    },
                ],
                runs: [
                    {
                        id: "run-1",
                        workflow_id: wfId,
                        event_id: "ev-1",
                        status: "completed",
                        error: null,
                        started_at: "2026-05-10T12:01:00Z",
                        completed_at: "2026-05-10T12:02:00Z",
                        event_payload: {},
                        has_failed_action: false,
                        workflow_name: "OK",
                        skip_reason: null,
                    },
                ],
            })
        );
        expect(trace.outcome).toBe("run_successful");
    });

    it("produces stable trace_id for same inputs", () => {
        const source = baseSource({
            events: [
                {
                    id: "ev-1",
                    occurred_at: "2026-05-10T12:00:00Z",
                    event_type: "opportunity_status_changed",
                    entity_type: "opportunities",
                    entity_id: entityId,
                    payload: {},
                },
            ],
        });
        const a = buildWorkflowOperationalTraceV1(source);
        const b = buildWorkflowOperationalTraceV1(source);
        expect(a.trace_id).toBe(b.trace_id);
    });

    it("builds explain v1 with explain_engine 1", () => {
        const trace = buildWorkflowOperationalTraceV1(baseSource());
        const ex = buildWorkflowAssistExplainFromTraceV1(
            { version: 1, entity_type: "opportunities", entity_id: entityId, range: "30d" },
            trace
        );
        expect(ex.explain_engine).toBe(1);
        expect(ex.context.trace_id).toBe(trace.trace_id);
    });
});
