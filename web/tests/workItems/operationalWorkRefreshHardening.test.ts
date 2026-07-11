/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { processingWorkItemId } from "@/lib/workItems/mapProcessingCaseToWorkItemRow";
import {
    ADMIN_V2_PROCESSING_QUEUE_REFRESH,
    dispatchOperationalWorkRefresh,
} from "@/lib/workItems/operationalWorkRefresh";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";

vi.mock("@/lib/pos/processingQueueWarmCache", () => ({
    warmProcessingQueueCache: vi.fn().mockResolvedValue(undefined),
}));

describe("operationalWorkRefresh hardening", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not emit duplicate processing refresh events for a single mutation", () => {
        const processingEvents: Event[] = [];
        const handler = (e: Event) => processingEvents.push(e);
        window.addEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, handler);

        dispatchOperationalWorkRefresh({
            opportunity_id: "opp-1",
            processing_case_id: "case-1",
            kind: "complete",
        });

        expect(processingEvents).toHaveLength(1);

        window.removeEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, handler);
    });

    it("clears projected selection when row disappears from merged tasks", () => {
        const projectedId = processingWorkItemId("case-gone");
        const merged: MyTasksTaskRow[] = [];
        const selectedTaskId = projectedId;
        const stillExists = merged.some((t) => t.id === selectedTaskId);
        expect(stillExists).toBe(false);
    });

    it("includes opportunity refresh for BP-style completion detail", () => {
        const events: string[] = [];
        const handler = (e: Event) => events.push(e.type);
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, handler);
        window.addEventListener("adminv2:opportunity-updated", handler);

        dispatchOperationalWorkRefresh({
            opportunity_id: "opp-bp-1",
            task_id: "task-bp-1",
            kind: "complete",
        });

        expect(events).toContain(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH);
        expect(events).toContain("adminv2:opportunity-updated");

        window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, handler);
        window.removeEventListener("adminv2:opportunity-updated", handler);
    });
});
