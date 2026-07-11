/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH,
    ADMIN_V2_PROCESSING_QUEUE_REFRESH,
    dispatchOperationalWorkRefresh,
} from "@/lib/workItems/operationalWorkRefresh";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";

vi.mock("@/lib/communications/v2/commandCenterPrefetchCache", () => ({
    prefetchCommandCenterConversations: vi.fn().mockResolvedValue({ conversations: [], fetchedAt: Date.now(), error: null }),
}));

describe("dispatchOperationalWorkRefresh", () => {
    it("dispatches unified operational and processing refresh events", () => {
        const events: string[] = [];
        const handler = (e: Event) => events.push(e.type);
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, handler);
        window.addEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, handler);
        window.addEventListener("adminv2:opportunity-updated", handler);

        dispatchOperationalWorkRefresh({
            opportunity_id: "opp-1",
            processing_case_id: "case-1",
            kind: "processing_review",
        });

        expect(events).toContain(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH);
        expect(events).toContain(ADMIN_V2_PROCESSING_QUEUE_REFRESH);
        expect(events).toContain("adminv2:opportunity-updated");

        window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, handler);
        window.removeEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, handler);
        window.removeEventListener("adminv2:opportunity-updated", handler);
    });
});


describe("dispatchOperationalWorkRefresh communications", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("dispatches communications queue refresh for reply mutations", () => {
        const events: string[] = [];
        const handler = (e: Event) => events.push(e.type);
        window.addEventListener(ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH, handler);

        dispatchOperationalWorkRefresh({
            communication_thread_id: "thread-1",
            kind: "communications_reply",
        });

        expect(events).toContain(ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH);

        window.removeEventListener(ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH, handler);
    });
});
