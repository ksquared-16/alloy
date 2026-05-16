import { describe, expect, it } from "vitest";
import {
    findQueuePreviewItemById,
    opportunityDrawerSeedFromQueueItem,
} from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

describe("opportunityDrawerQueuePreviewSeed", () => {
    it("builds title from CRM compact primary identity", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Fallback",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Nguyen Family",
                childName: null,
                stageLabel: "Tour",
                statusLabel: "Active",
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                programContext: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
            },
        };
        const seed = opportunityDrawerSeedFromQueueItem(item);
        expect(seed.title).toBe("Nguyen Family");
        expect(seed.stageLabel).toBe("Tour");
    });

    it("finds queue preview row by id", () => {
        const rows = [{ id: "a", title: "A", quickActions: [] }] as QueuePreviewItemVm[];
        expect(findQueuePreviewItemById(rows, "a")?.title).toBe("A");
        expect(findQueuePreviewItemById(rows, "missing")).toBeNull();
    });
});
