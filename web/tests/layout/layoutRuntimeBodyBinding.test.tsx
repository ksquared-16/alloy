/**
 * Layout runtime body render stats + empty-body fallback tests.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerLayoutRuntimeOverviewBody from "@/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { computeLayoutRuntimeBodyRenderStats } from "@/lib/layout/runtime/layoutRuntimeBodyRenderStats";
import QueueCardProofRenderer from "@/components/layout/QueueCardProofRenderer";
import { futureModuleWidget } from "@/lib/layout/runtime/proofLayoutHelpers";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import type { UseDrawerLayoutRuntimeBodyResult } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";

function layoutBodyResult(overrides: Partial<UseDrawerLayoutRuntimeBodyResult>): UseDrawerLayoutRuntimeBodyResult {
    return {
        cutoverEnabled: true,
        phase: "ready",
        presentation: "layout",
        useVmFallback: false,
        showHold: false,
        bodyReady: true,
        doc: null,
        record: null,
        layoutSource: "default",
        layoutKey: null,
        lastError: null,
        ...overrides,
    };
}

describe("computeLayoutRuntimeBodyRenderStats", () => {
    it("reports renderable items for default lead drawer doc", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: {
                name: "Johnson Family",
                "person.primary_contact_name": "Jamie Johnson",
                _inquiry_children: [{ id: "c1", display_name: "Alex Johnson" }],
            },
        });
        const stats = computeLayoutRuntimeBodyRenderStats(doc, record);
        expect(stats.sectionCount).toBeGreaterThan(0);
        expect(stats.productionSupportedCount).toBeGreaterThan(0);
        expect(stats.renderableItemCount).toBeGreaterThan(0);
        expect(stats.itemsWithValueCount).toBeGreaterThan(0);
        expect(stats.fallbackReason).toBeNull();
    });

    it("flags zero renderable items when doc only has unsupported widgets", () => {
        const doc = buildLeadDrawerDefaultDoc();
        doc.sections = [
            {
                ...doc.sections[0]!,
                rows: doc.sections[0]!.rows.map((row) => ({
                    ...row,
                    columns: row.columns.map((col) => ({
                        ...col,
                        items: [futureModuleWidget("opportunities", "x", "communications", "Communications")],
                    })),
                })),
            },
        ];
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: { name: "Test" },
        });
        const stats = computeLayoutRuntimeBodyRenderStats(doc, record);
        expect(stats.productionSupportedCount).toBe(0);
        expect(stats.fallbackReason).toBe("no_production_supported_items");
    });
});

describe("DrawerLayoutRuntimeOverviewBody empty fallback", () => {
    it("falls back to VM body when layout has zero renderable items", () => {
        const doc = buildLeadDrawerDefaultDoc();
        doc.sections = [
            {
                ...doc.sections[0]!,
                rows: doc.sections[0]!.rows.map((row) => ({
                    ...row,
                    columns: row.columns.map((col) => ({
                        ...col,
                        items: [futureModuleWidget("opportunities", "x", "communications", "Communications")],
                    })),
                })),
            },
        ];
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: { name: "Test" },
        });
        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeOverviewBody
                layoutBody={layoutBodyResult({ doc, record, layoutSource: "test" })}
                vmFallback={<div data-vm-fallback-marker="true">VM overview</div>}
                entityId="opp-1"
                surface="opportunity_drawer_overview"
            />,
        );
        expect(html).toContain('data-vm-fallback-marker="true"');
        expect(html).toContain("VM overview");
    });
});

describe("queue row layout binding", () => {
    it("renders household title and child rows from CRM compact data", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Johnson Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Johnson Family",
                childName: "Alex Johnson",
                contactDisplayName: "Jamie Johnson",
                contactPhoneDisplay: "(555) 234-8901",
                programContext: "Infant AM",
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: "(555) 234-8901",
                roomContext: "Main Campus",
                ageContext: "4y",
                attentionReason: null,
                familyNote: null,
                tourContext: "Jun 12",
                locationContext: "Main Campus",
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const html = renderToStaticMarkup(
            <QueueCardProofRenderer doc={doc} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain("Johnson Household");
        expect(html).toContain("Jamie Johnson");
        expect(html).toContain("Alex Johnson");
        expect(html).not.toContain(">Record<");
    });
});
