/**
 * Server-side live-path audit: resolved layout doc + rendered operational row markup.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { buildOperationalQueueRecordViewModelFromLayout } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import { evaluateOpportunityQueueLayoutRuntime } from "@/lib/layout/runtime/evaluateOpportunityQueueLayoutRuntime";
import { resolveQueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const ORG_ID = process.env.DEV_QUEUE_ORG_ID ?? "93667019-bd28-49b5-a688-acc9bb1e0a19";

function findChildrenMaxItems(config: ReturnType<typeof resolveQueueRecordLayoutConfig>): number | null {
    for (const col of config.columns) {
        for (const block of col.blocks) {
            if (block.type === "repeated_record_block" && block.relationshipKey === "children") {
                return block.maxItems ?? 5;
            }
        }
    }
    return null;
}

function statusFieldDisplay(config: ReturnType<typeof resolveQueueRecordLayoutConfig>): string | null {
    for (const col of config.columns) {
        for (const block of col.blocks) {
            if (block.type !== "field_group") continue;
            const status = block.fields.find((f) => f.fieldKey === "opportunity.status_key");
            if (status) return status.display ?? null;
        }
    }
    return null;
}

describe("live Qualification queue row audit", () => {
    it("resolves layout runtime doc and queue_record_layout defaults for qualification lane", async () => {
        const supabase = createAdminClient();
        const result = await evaluateOpportunityQueueLayoutRuntime({
            orgId: ORG_ID,
            supabase,
            lane: { drillWorkUnitKey: "lifecycle_wu_qualification", grain: "case" },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const config = resolveQueueRecordLayoutConfig(result.doc);
        const savedMeta = (result.doc?.metadata as { queue_record_layout?: unknown } | undefined)?.queue_record_layout;

        expect(findChildrenMaxItems(config)).toBe(5);
        expect(statusFieldDisplay(config)).toBe("pill");

        const fallbackDoc = buildLeadQueueDefaultDoc();
        const usesBuiltinFallback = result.layoutSource === "builtin_fallback" || !savedMeta;
        if (usesBuiltinFallback) {
            expect(config.version).toBe(3);
            expect(config.variant).toBe("operational-row");
        }
    });

    it("renders task widget hierarchy and status pill classes on layout-runtime path", () => {
        const doc = buildLeadQueueDefaultDoc();
        const config = resolveQueueRecordLayoutConfig(doc);
        const item: QueuePreviewItemVm = {
            id: "opp-live-audit",
            title: "Nguyen Family",
            opportunityId: "opp-live-audit",
            semanticCrmCompact: {
                primaryIdentity: "Nguyen Family",
                contactDisplayName: "Mai Nguyen",
                contactPhoneDisplay: "(503) 555-0199",
                contactEmail: "mai@example.com",
                contactPersonId: "person-1",
                stageLabel: "Qualification",
                statusLabel: "Contact Attempted",
                childName: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                programContext: null,
                childrenLines: [
                    { primary: "An Nguyen", secondary: "3y", personId: "child-1" },
                    { primary: "Bo Nguyen", secondary: "5y", personId: "child-2" },
                    { primary: "Chi Nguyen", secondary: "7y", personId: "child-3" },
                    { primary: "Dao Nguyen", secondary: "9y", personId: "child-4" },
                ],
            },
            quickActions: [],
        };

        const record = {
            ...buildOpportunityQueueRowRecordFromPreview(item, doc),
            _inquiry_summary_tasks: {
                state: "loaded",
                open_count: 2,
                open_tasks: [
                    { id: "t1", title: "Follow up", due_at: "", status: "open", source: "" },
                    { id: "t2", title: "Send packet", due_at: "", status: "open", source: "" },
                ],
            },
        };
        const vm = buildOperationalQueueRecordViewModelFromLayout(doc, record, config);
        const html = renderToStaticMarkup(
            createElement(OperationalQueueRecordRow, {
                vm,
                record,
                config,
                onOpen: () => {},
                drawerHandlers: { onOpenPerson: () => {}, onOpenChild: () => {} },
                rowActions: item.quickActions,
                onRowAction: () => {},
            }),
        );

        expect(html).toContain('data-queue-children-max-items="5"');
        expect(html).toContain('data-queue-repeat-max="5"');
        expect(html).toContain("queue-record-field--primary-contact");
        expect(html).toContain("queue-record-field--pill");
        expect(html).toContain('data-queue-status-pill="true"');
        expect(html).toContain("queue-record-widget--tasks");
        expect(html).toContain("queue-record-widget__task-title");
        expect(html).toContain("Follow up");
        expect(html).toContain("Send packet");
        expect(html).toContain("data-queue-child-row");
        expect(html).toContain("operational-queue-row__child-list");
    });
});
