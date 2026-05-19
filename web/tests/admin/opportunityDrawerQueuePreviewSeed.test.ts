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
                locationContext: "Downtown Campus",
                ageContext: null,
                attentionReason: null,
                familyNote: null,
            },
        };
        const seed = opportunityDrawerSeedFromQueueItem(item);
        expect(seed.title).toBe("Nguyen Family");
        expect(seed.stageLabel).toBe("Tour");
        expect(seed.locationLabel).toBe("Downtown Campus");
    });

    it("finds queue preview row by id", () => {
        const rows = [{ id: "a", title: "A", quickActions: [] }] as QueuePreviewItemVm[];
        expect(findQueuePreviewItemById(rows, "a")?.title).toBe("A");
        expect(findQueuePreviewItemById(rows, "missing")).toBeNull();
    });

    it("includes status and record hint from preview row", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-2",
            title: "Row",
            quickActions: [],
            metaLines: [{ label: "Record", value: "#1042" }],
            semanticCrmCompact: {
                primaryIdentity: "Smith",
                childName: null,
                stageLabel: null,
                statusLabel: "Waitlist",
                nextStep: null,
                lastActivity: null,
                commercialValue: "$1,200",
                contactSnippet: null,
                programContext: null,
                roomContext: null,
                locationContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
            },
            valueLabel: "$1,200/mo",
            urgencyTier: "warning",
        };
        const seed = opportunityDrawerSeedFromQueueItem(item);
        expect(seed.statusLabel).toBe("Waitlist");
        expect(seed.recordNumberHint).toBe("#1042");
        expect(seed.valueLabel).toBe("$1,200/mo");
        expect(seed.urgencyTier).toBe("warning");
    });
});
