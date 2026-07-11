/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import {
    ADMIN_V2_PROCESSING_QUEUE_REFRESH,
    dispatchOperationalWorkRefresh,
} from "@/lib/workItems/operationalWorkRefresh";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";

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
