/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { QueueRecordWidgetRenderer } from "@/components/layout/QueueRecordFieldRenderer";
import { createWidgetBlock, type QueueRecordBlockConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const activityRecord: ProofRuntimeRecord = {
    id: "opp-1",
    last_activity: "2026-06-01T12:00:00.000Z",
    "opportunity.status_key": "contacted",
    "opportunity.status_label": "Contacted",
    _status_display: "Contacted",
};

function renderWidget(block: Extract<QueueRecordBlockConfig, { type: "widget" }>) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<QueueRecordWidgetRenderer block={block} record={activityRecord} />);
    });
    return container;
}

describe("QueueRecordWidgetRenderer activity_timeline", () => {
    it("renders compact activity timeline widget for allowed key", () => {
        const block = createWidgetBlock("activity_timeline", "Recent activity", { displayMode: "compact" });
        if (block.type !== "widget") throw new Error("expected widget block");
        const container = renderWidget(block);
        expect(container.querySelector("[data-queue-activity-timeline-widget]")).not.toBeNull();
        expect(container.querySelector("[data-layout-runtime-activity-timeline-mode='compact_feed']")).not.toBeNull();
    });

    it("returns null for disallowed widget keys", () => {
        const block = createWidgetBlock("follow_ups", "Follow-ups");
        if (block.type !== "widget") throw new Error("expected widget block");
        const container = renderWidget(block);
        expect(container.firstChild).toBeNull();
    });

    it("still renders tasks widget", () => {
        const block = createWidgetBlock("tasks", "Tasks");
        if (block.type !== "widget") throw new Error("expected widget block");
        const container = renderWidget(block);
        expect(container.querySelector("[data-queue-tasks-widget]")).not.toBeNull();
    });
});
