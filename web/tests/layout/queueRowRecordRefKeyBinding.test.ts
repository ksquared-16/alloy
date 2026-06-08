/**
 * Queue row LayoutDoc refKey → runtime record binding (card data fix).
 *
 * Mirrors the drawer fix: every configured queue-card field refKey must be present
 * on the row record (mapped from the raw item/CRM/enrichment, else "") so the card
 * renders real data where present and a label + placeholder where absent.
 */

import { describe, expect, it } from "vitest";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

function previewItem(): QueuePreviewItemVm {
    return {
        id: "opp-1",
        title: "Nguyen Household",
        semanticCrmCompact: {
            primaryIdentity: "Nguyen Household",
            statusLabel: "Qualified",
            contactDisplayName: "Jordan Nguyen",
            contactPhoneDisplay: "(555) 010-2244",
            contactEmail: "jordan@example.com",
        },
    } as unknown as QueuePreviewItemVm;
}

/** Queue card doc with a configured field refKey outside the builder's standard set. */
function queueDoc(): LayoutDoc {
    const field = (id: string, refKey: string, zone: string) => ({
        id, kind: "field" as const, refKey, label: refKey, renderHint: "text" as const, metadata: { zone },
    });
    return {
        formatVersion: 1,
        surface: "queue",
        entityType: "opportunities",
        sections: [
            {
                id: "card",
                key: "card",
                title: "Card",
                rows: [
                    {
                        id: "r0",
                        columns: [
                            {
                                id: "c0",
                                width: 12,
                                items: [
                                    field("f-status", "opportunity.status_key", "header.status"),
                                    field("f-contact", "person.primary_contact_name", "body.contact"),
                                    field("f-custom", "opportunity.custom_queue_field", "context.primary"),
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
        metadata: { renderAs: "work_unit_card" },
    } as unknown as LayoutDoc;
}

describe("buildOpportunityQueueRowRecordFromPreview — doc refKey binding", () => {
    it("maps standard refKeys from the preview item", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(previewItem(), queueDoc());
        expect(record["opportunity.status_key"]).toBe("Qualified");
        expect(record["person.primary_contact_name"]).toBe("Jordan Nguyen");
    });

    it("guarantees configured refKeys with no source are present (blank, not absent)", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(previewItem(), queueDoc());
        expect(record).toHaveProperty("opportunity.custom_queue_field");
        expect(record["opportunity.custom_queue_field"]).toBe("");
    });

    it("without a doc, the custom refKey stays absent (proves the doc-driven fix)", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(previewItem());
        expect(record["opportunity.custom_queue_field"]).toBeUndefined();
    });
});
