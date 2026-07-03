import { describe, expect, it } from "vitest";

import {
    ENROLLMENT_QUEUE_ROW_PREVIEW_ACTIONS,
    normalizeEnrollmentQueueRowPreviewActions,
    resolveQueueRowPreviewActionsForWorkUnit,
    stripPlacementAuthoredPreviewTokens,
} from "@/lib/ui-v2/enrollmentQueueRowPreviewPolicy";

describe("enrollmentQueueRowPreviewPolicy", () => {
    it("canonical default is open only", () => {
        expect(ENROLLMENT_QUEUE_ROW_PREVIEW_ACTIONS).toEqual(["open"]);
    });

    it("strips call, email, and placement-authored tokens", () => {
        expect(normalizeEnrollmentQueueRowPreviewActions(["call", "open", "email", "message"])).toEqual(["open"]);
        expect(normalizeEnrollmentQueueRowPreviewActions(["open", "orchestrator"])).toEqual(["open"]);
    });

    it("stripPlacementAuthoredPreviewTokens removes message for all queues", () => {
        expect(stripPlacementAuthoredPreviewTokens(["open", "message", "call"])).toEqual(["open", "call"]);
    });

    it("resolve applies enrollment policy only for enrollment-like work units", () => {
        expect(
            resolveQueueRowPreviewActionsForWorkUnit({
                actions: ["open", "call", "email", "message"],
                enrollmentLike: true,
            })
        ).toEqual(["open"]);
        expect(
            resolveQueueRowPreviewActionsForWorkUnit({
                actions: ["open", "call", "message"],
                enrollmentLike: false,
            })
        ).toEqual(["open", "call"]);
    });
});
