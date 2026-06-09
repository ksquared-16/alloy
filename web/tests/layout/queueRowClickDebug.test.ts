// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    isQueueRowClickDebugEnabled,
    logQueueRowDomClick,
    logQueueRowLinkDispatch,
} from "@/lib/debug/queueRowClickDebug";

describe("queueRowClickDebug", () => {
    const original = process.env.NEXT_PUBLIC_QUEUE_ROW_CLICK_DEBUG;

    beforeEach(() => {
        process.env.NEXT_PUBLIC_QUEUE_ROW_CLICK_DEBUG = "1";
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_QUEUE_ROW_CLICK_DEBUG = original;
        vi.restoreAllMocks();
    });

    it("is enabled when env flag is set", () => {
        expect(isQueueRowClickDebugEnabled()).toBe(true);
    });

    it("logs dom click summaries in test env", () => {
        document.body.innerHTML = `<button class="operational-queue-row__link-icon-btn" data-queue-row-link="true">Go</button>`;
        const btn = document.querySelector("button")!;
        logQueueRowDomClick("test", { target: btn, defaultPrevented: false });
        expect(console.info).toHaveBeenCalled();
    });

    it("logs link dispatch with child row context", () => {
        logQueueRowLinkDispatch({
            surface: "queue_record",
            linkTarget: "child_drawer",
            resolvedEntityId: "person-child-1",
            dispatchOk: true,
            record: {
                id: "person-child-1",
                person_id: "person-child-1",
                "child.id": "person-child-1",
                "child.name": "Alex",
            },
            anchorRecord: { id: "opp-1", "opportunity.id": "opp-1" },
            propagationStopped: true,
        });
        expect(console.info).toHaveBeenCalled();
    });
});
