/**
 * buildOpportunityQueueLayoutRuntimeRecordFromVm — queue VM slots → refKey record.
 */

import { describe, expect, it } from "vitest";
import { buildOpportunityQueueLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityQueueLayoutRuntimeRecordFromVm";
import type { QueueItemVm } from "@/lib/ui-v2/workspace-types";

function makeItem(over: Partial<QueueItemVm> = {}): QueueItemVm {
    return {
        id: "row-1",
        title: "Nguyen",
        quickActions: [],
        opportunityId: "opp-1",
        ...over,
    } as QueueItemVm;
}

describe("buildOpportunityQueueLayoutRuntimeRecordFromVm", () => {
    it("maps semantic slots to queue card refKeys", () => {
        const item = makeItem({
            semanticCrmCompact: {
                primaryIdentity: "Nguyen Household",
                childName: null,
                childrenLines: [
                    { primary: "Avery (3y)", programInline: "Preschool", personId: "p-child-1" },
                    { primary: "Bryce (1y)", programInline: "Infant", personId: "p-child-2" },
                ],
                stageLabel: null,
                statusLabel: "Qualified",
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: "Jordan Nguyen",
                contactDisplayName: "Jordan Nguyen",
                contactPhoneDisplay: "(555) 010-2244",
                contactEmail: "jordan@example.com",
                programContext: null,
                roomContext: null,
                ageContext: null,
                attentionReason: "Tour Jun 12 — confirm details",
                locationContext: "North Campus",
                tourContext: "Jun 12",
                familyNote: null,
            } as QueueItemVm["semanticCrmCompact"],
        });

        const record = buildOpportunityQueueLayoutRuntimeRecordFromVm(item);

        expect(record.last_name).toBe("Nguyen"); // " Household" stripped, no doubling
        expect(record._status_display).toBe("Qualified");
        expect(record["opportunity.status_key"]).toBe("Qualified");
        expect(record._attention).toBe("Tour Jun 12 — confirm details");
        expect(record["opportunity.location"]).toBe("North Campus");
        expect(record["person.primary_contact_name"]).toBe("Jordan Nguyen");
        expect(record["person.primary_phone"]).toBe("(555) 010-2244");
        const children = record.children as Record<string, string>[];
        expect(children).toHaveLength(2);
        expect(children[0]["child.name"]).toBe("Avery (3y)");
        expect(children[0]["child.program"]).toBe("Preschool");
        expect(children[1]["child.name"]).toBe("Bryce (1y)");
    });

    it("falls back to bare title when no semantic slots", () => {
        const record = buildOpportunityQueueLayoutRuntimeRecordFromVm(makeItem({ title: "Smith", subtitle: "Lead" }));
        expect(record.last_name).toBe("Smith");
        expect(record["opportunity.status_key"]).toBe("Lead");
        expect(record.children).toEqual([]);
    });
});
