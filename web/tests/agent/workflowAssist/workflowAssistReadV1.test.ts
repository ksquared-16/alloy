import { describe, expect, it } from "vitest";

import {
    buildWorkflowAssistReadCardPayload,
    parseWorkflowAssistReadIntent,
    type WorkflowAssistReadIntentV1,
    type WorkflowAssistSummaryRowV1,
} from "@/lib/agent/workflowAssist/workflowAssistReadV1";

describe("parseWorkflowAssistReadIntent", () => {
    it("classifies explain / why-not-moved", () => {
        const p = parseWorkflowAssistReadIntent("Why didn't this family get moved?", { hasAmbientOpportunity: true });
        expect(p.sub_intent).toBe("explain_v1");
        expect(p.parse_reason).toContain("ambient");
    });

    it("classifies failed runs this week", () => {
        const p = parseWorkflowAssistReadIntent("Show me workflows that failed this week");
        expect(p.sub_intent).toBe("failed_runs_last_7d");
    });

    it("classifies enrollment touch", () => {
        const p = parseWorkflowAssistReadIntent("Which workflows touch enrollment?");
        expect(p.sub_intent).toBe("enrollment_touch");
    });

    it("classifies explicit summary", () => {
        const p = parseWorkflowAssistReadIntent("Show workflow summary");
        expect(p.sub_intent).toBe("workflow_summary");
    });

    it("defaults workflow-like commands to summary", () => {
        const p = parseWorkflowAssistReadIntent("When forms complete move them to ready to enroll");
        expect(p.sub_intent).toBe("workflow_summary");
    });
});

describe("buildWorkflowAssistReadCardPayload", () => {
    const summaryFixture = {
        workflows: [
            {
                id: "w1",
                name: "Tour follow-up",
                enabled: true,
                entity_type: "opportunity",
                event_type: "message_queued",
                steps_count: 2,
                last_run: {
                    id: "r1",
                    status: "completed",
                    started_at: "2026-05-01T12:00:00Z",
                    has_failed_action: false,
                },
            },
            {
                id: "w2",
                name: "Enrollment packet",
                enabled: true,
                entity_type: "opportunity",
                event_type: "entity_status_changed",
                steps_count: 1,
                last_run: null,
            },
        ],
    };

    it("builds summary card", () => {
        const intent: WorkflowAssistReadIntentV1 = {
            version: 1,
            sub_intent: "workflow_summary",
            parse_reason: "test",
        };
        const out = buildWorkflowAssistReadCardPayload(intent, summaryFixture, null, null, null);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.payload.variant).toBe("workflow_summary");
        if (out.payload.variant !== "workflow_summary") return;
        expect(out.payload.total_count).toBe(2);
        expect(out.payload.workflows).toHaveLength(2);
    });

    it("builds enrollment filter card", () => {
        const intent: WorkflowAssistReadIntentV1 = {
            version: 1,
            sub_intent: "enrollment_touch",
            parse_reason: "test",
        };
        const out = buildWorkflowAssistReadCardPayload(intent, summaryFixture, null, null, null);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.payload.variant).toBe("enrollment_touch");
        if (out.payload.variant !== "enrollment_touch") return;
        expect(out.payload.workflows.some((w: WorkflowAssistSummaryRowV1) => w.workflow_id === "w2")).toBe(true);
    });

    it("builds failed runs card from run list", () => {
        const intent: WorkflowAssistReadIntentV1 = {
            version: 1,
            sub_intent: "failed_runs_last_7d",
            parse_reason: "test",
        };
        const runs = {
            runs: [
                {
                    id: "run-a",
                    workflow_id: "w1",
                    workflow_name: "Bad",
                    status: "completed",
                    started_at: "2026-05-10T10:00:00Z",
                    has_failed_action: true,
                },
                {
                    id: "run-b",
                    workflow_id: "w2",
                    workflow_name: "OK",
                    status: "completed",
                    started_at: "2026-05-10T11:00:00Z",
                    has_failed_action: false,
                },
            ],
        };
        const kpis = { kpis: { failed_last_7d: 3 } };
        const out = buildWorkflowAssistReadCardPayload(intent, summaryFixture, runs, kpis, null);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.payload.variant).toBe("failed_runs");
        if (out.payload.variant !== "failed_runs") return;
        expect(out.payload.runs).toHaveLength(1);
        expect(out.payload.runs[0]!.run_id).toBe("run-a");
        expect(out.payload.failed_last_7d_kpi).toBe(3);
    });

    it("explain_v0 does not build from summary aggregation", () => {
        const intent: WorkflowAssistReadIntentV1 = {
            version: 1,
            sub_intent: "explain_v0",
            parse_reason: "test",
        };
        const out = buildWorkflowAssistReadCardPayload(intent, { workflows: [] }, null, null, null);
        expect(out.ok).toBe(false);
    });

    it("exposes workflow-assist propose/apply API routes (Cards 4–5)", async () => {
        const { existsSync } = await import("node:fs");
        const { join } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const here = fileURLToPath(new URL(".", import.meta.url));
        const base = join(here, "../../../app/api/admin/ai/workflow-assist");
        expect(existsSync(join(base, "propose", "route.ts"))).toBe(true);
        expect(existsSync(join(base, "apply", "route.ts"))).toBe(true);
        expect(existsSync(join(base, "explain", "route.ts"))).toBe(true);
    });

    it("rejects bad summary response", () => {
        const intent: WorkflowAssistReadIntentV1 = {
            version: 1,
            sub_intent: "workflow_summary",
            parse_reason: "test",
        };
        const out = buildWorkflowAssistReadCardPayload(intent, { not_workflows: [] }, null, null, null);
        expect(out.ok).toBe(false);
    });
});
