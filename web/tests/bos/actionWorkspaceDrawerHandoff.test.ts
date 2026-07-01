// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    BOS_ACTION_WORKSPACE_OPEN_ATTR,
    setActionWorkspaceOpenDocumentFlag,
} from "@/lib/bos/bosRailPresentationFlags";
import { queueActionWorkspaceLeadHandoff } from "@/lib/bos/actionWorkspaceDrawerHandoff";

describe("queueActionWorkspaceLeadHandoff", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setActionWorkspaceOpenDocumentFlag(true);
    });

    afterEach(() => {
        vi.useRealTimers();
        setActionWorkspaceOpenDocumentFlag(false);
    });

    it("clears workspace flag, closes modal, then opens lead after layout frames", () => {
        const openLead = vi.fn();
        const closeWorkspace = vi.fn();

        queueActionWorkspaceLeadHandoff("opp-123", openLead, closeWorkspace);

        expect(document.documentElement.getAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR)).toBeNull();
        expect(closeWorkspace).toHaveBeenCalledTimes(1);
        expect(openLead).not.toHaveBeenCalled();

        vi.runAllTimers();

        expect(openLead).toHaveBeenCalledWith("opp-123");
    });
});
