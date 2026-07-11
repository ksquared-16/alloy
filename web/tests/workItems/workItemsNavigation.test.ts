/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    ADMIN_V2_OPEN_COMMUNICATIONS_THREAD,
    ADMIN_V2_OPEN_PROCESSING_CASE,
    ADMIN_V2_OPEN_WORK_ITEMS_TASK,
    dispatchOpenCommunicationsThread,
    dispatchOpenProcessingCase,
    dispatchOpenWorkItemsTask,
} from "@/lib/workItems/workItemsNavigation";

vi.mock("@/lib/adminV2/workspaceModalCoordinator", () => ({
    openWorkspaceModal: vi.fn(),
}));

vi.mock("@/lib/adminV2/workspaceModalEvents", () => ({
    dispatchAdminV2OpenProcessingModal: vi.fn(),
    dispatchAdminV2OpenInboxModal: vi.fn(),
}));

vi.mock("@/lib/communications/v2/commandCenterPrefetchCache", () => ({
    setCommandCenterPendingSelection: vi.fn(),
    prefetchCommandCenterConversations: vi.fn().mockResolvedValue({ conversations: [], fetchedAt: Date.now(), error: null }),
}));

import { openWorkspaceModal } from "@/lib/adminV2/workspaceModalCoordinator";
import { dispatchAdminV2OpenInboxModal, dispatchAdminV2OpenProcessingModal } from "@/lib/adminV2/workspaceModalEvents";
import { prefetchCommandCenterConversations, setCommandCenterPendingSelection } from "@/lib/communications/v2/commandCenterPrefetchCache";

describe("workItemsNavigation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("opens Work Items panel and dispatches task selection", () => {
        const events: CustomEvent[] = [];
        const handler = (e: Event) => events.push(e as CustomEvent);
        window.addEventListener(ADMIN_V2_OPEN_WORK_ITEMS_TASK, handler);

        dispatchOpenWorkItemsTask({ task_id: "task-1", opportunity_id: "opp-1" });

        expect(openWorkspaceModal).toHaveBeenCalledWith("tasks");
        expect(events[0]?.detail).toEqual({ task_id: "task-1", opportunity_id: "opp-1" });

        window.removeEventListener(ADMIN_V2_OPEN_WORK_ITEMS_TASK, handler);
    });

    it("opens Processing modal and dispatches case selection", () => {
        const events: CustomEvent[] = [];
        const handler = (e: Event) => events.push(e as CustomEvent);
        window.addEventListener(ADMIN_V2_OPEN_PROCESSING_CASE, handler);

        dispatchOpenProcessingCase("case-42");

        expect(dispatchAdminV2OpenProcessingModal).toHaveBeenCalled();
        expect(events[0]?.detail).toEqual({ case_id: "case-42" });

        window.removeEventListener(ADMIN_V2_OPEN_PROCESSING_CASE, handler);
    });
});


    it("opens Communications inbox and selects the exact thread", () => {
        const events: CustomEvent[] = [];
        const handler = (e: Event) => events.push(e as CustomEvent);
        window.addEventListener(ADMIN_V2_OPEN_COMMUNICATIONS_THREAD, handler);

        dispatchOpenCommunicationsThread("thread-42");

        expect(dispatchAdminV2OpenInboxModal).toHaveBeenCalled();
        expect(prefetchCommandCenterConversations).toHaveBeenCalledWith({ force: true });
        expect(setCommandCenterPendingSelection).toHaveBeenCalledWith("thread-42");
        expect(events[0]?.detail).toEqual({ thread_id: "thread-42" });

        window.removeEventListener(ADMIN_V2_OPEN_COMMUNICATIONS_THREAD, handler);
    });
