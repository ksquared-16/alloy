/**
 * Layout runtime body render stats + empty-body fallback tests.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerLayoutRuntimeOverviewBody from "@/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
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
        layoutRecordId: null,
        layoutVersion: null,
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

    it("counts future-module widgets as production-supported (placeholder chrome)", () => {
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
        expect(stats.productionSupportedCount).toBeGreaterThan(0);
        expect(stats.fallbackReason).toBeNull();
    });
});

describe("DrawerLayoutRuntimeOverviewBody empty fallback", () => {
    it("renders future-module placeholder instead of VM fallback", () => {
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
        expect(html).toContain("Future module");
        expect(html).toContain("Communications");
        expect(html).not.toContain('data-vm-fallback-marker="true"');
    });

    it("renders configured layout fields with placeholders when record values are blank", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-blank",
            vmRecord: { name: "Test Household" },
        });
        const html = renderToStaticMarkup(
            <DrawerLayoutRuntimeOverviewBody
                layoutBody={layoutBodyResult({ doc, record, layoutSource: "default" })}
                vmFallback={<div data-vm-fallback-marker="true">VM overview</div>}
                entityId="opp-blank"
                surface="opportunity_drawer_overview"
            />,
        );
        expect(html).toContain('data-drawer-layout-runtime-overview="true"');
        expect(html).not.toContain('data-vm-fallback-marker="true"');
        expect(html).toContain("—");
    });
});

describe("LayoutRuntimeDrawerBodyView blank configured fields", () => {
    it("renders field labels and em dash placeholders for empty values", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-empty-fields",
            vmRecord: {},
        });
        const html = renderToStaticMarkup(<LayoutRuntimeDrawerBodyView doc={doc} record={record} />);
        expect(html).toContain("—");
        expect(html).not.toContain('data-drawer-layout-runtime-empty-fallback="true"');
    });

    it("renders empty tasks widget chrome in production", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-tasks",
            vmRecord: { name: "Test" },
        });
        const html = renderToStaticMarkup(<LayoutRuntimeDrawerBodyView doc={doc} record={record} />);
        expect(html.toLowerCase()).toMatch(/no tasks yet|tasks/);
    });

    it("renders actions, notes, and recent communication widget chrome when empty", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-widgets",
            vmRecord: { name: "Test" },
        });
        const html = renderToStaticMarkup(<LayoutRuntimeDrawerBodyView doc={doc} record={record} />);
        expect(html).toContain("Actions");
        expect(html).toContain("Notes");
        expect(html).toContain("Recent communication");
        expect(html.toLowerCase()).toMatch(/no actions yet/);
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

    it("renders scalar-only queue child columns for every repeater row (published v9 shape)", () => {
        const childLink = {
            position: "left" as const,
            icon: "child" as const,
            action: { type: "open_drawer" as const, entity: "child" as const, idPath: "child.id" },
        };
        const doc = buildLeadQueueDefaultDoc();
        const base = doc.sections[0]!;
        const col = base.rows[0]!.columns[0]!;
        const withoutChildren = col.items.filter(
            (item) => (item.metadata as { zone?: string } | undefined)?.zone !== "body.children",
        );
        const scalarChildren = [
            {
                id: "q-child-first",
                kind: "field" as const,
                refKey: "child.first_name",
                label: "First Name",
                renderHint: "text" as const,
                metadata: { zone: "body.children" },
                adornment: childLink,
            },
            {
                id: "q-child-last",
                kind: "field" as const,
                refKey: "child.last_name",
                label: "Last Name",
                renderHint: "text" as const,
                metadata: { zone: "body.children" },
            },
        ];
        const v9Doc = {
            ...doc,
            sections: [{
                ...base,
                rows: [{
                    ...base.rows[0]!,
                    columns: [{ ...col, items: [...withoutChildren, ...scalarChildren] }],
                }],
            }],
        } as import("@/lib/layout/layoutV2").LayoutDoc;
        const item: QueuePreviewItemVm = {
            id: "opp-mitchell",
            title: "Mitchell Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Family",
                childName: null,
                contactDisplayName: "Parent Name",
                contactPhoneDisplay: null,
                programContext: null,
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [
                    { primary: "Jim Pat", personId: "p1" },
                    { primary: "Alex Johnson", personId: "p2" },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, v9Doc);
        const html = renderToStaticMarkup(
            <QueueCardProofRenderer doc={v9Doc} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain("Jim");
        expect(html).toContain("Pat");
        expect(html).toContain("Alex");
        expect(html).toContain("Johnson");
    });

    it("renders child names when queue related_list has rows but empty columns (published shape)", () => {
        const doc = buildLeadQueueDefaultDoc();
        const base = doc.sections[0]!;
        const col = base.rows[0]!.columns[0]!;
        const emptyList = {
            id: "q-children-list",
            kind: "related_list" as const,
            refKey: "children",
            source: "children",
            displayMode: "rows" as const,
            related: { entityType: "child" },
            columns: [],
            metadata: { zone: "body.children" },
        };
        const withoutChildren = col.items.filter(
            (item) => (item.metadata as { zone?: string } | undefined)?.zone !== "body.children",
        );
        const queueDoc = {
            ...doc,
            sections: [{
                ...base,
                rows: [{
                    ...base.rows[0]!,
                    columns: [{ ...col, items: [...withoutChildren, emptyList] }],
                }],
            }],
        };
        const item: QueuePreviewItemVm = {
            id: "opp-mitchell",
            title: "Mitchell Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Family",
                childName: null,
                contactDisplayName: "Parent Name",
                contactPhoneDisplay: null,
                programContext: null,
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [
                    { primary: "Jim Pat", personId: "p1" },
                    { primary: "Alex Johnson", personId: "p2" },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item, queueDoc);
        const html = renderToStaticMarkup(
            <QueueCardProofRenderer doc={queueDoc} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain("Jim Pat");
        expect(html).toContain("Alex Johnson");
    });

    it("renders child rows from _inquiry_children when CRM compact child name is absent", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-mitchell",
            title: "Mitchell Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Family",
                childName: null,
                contactDisplayName: "Parent Name",
                contactPhoneDisplay: null,
                programContext: null,
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
            },
            layoutRuntimeEnrichment: {
                inquiryChildren: [
                    { first_name: "Jim", last_name: "Pat", person_id: "p1", display_name: "Jim Pat" },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const html = renderToStaticMarkup(
            <QueueCardProofRenderer doc={doc} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain("Jim Pat");
        expect(html).not.toContain("No children on this record yet");
    });

    it("renders configured contact and tour placeholders when values are blank", () => {
        const doc = buildLeadQueueDefaultDoc();
        const item: QueuePreviewItemVm = {
            id: "opp-blank",
            title: "Morgan Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Morgan Family",
                childName: null,
                contactDisplayName: null,
                contactPhoneDisplay: null,
                programContext: null,
                statusLabel: null,
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const html = renderToStaticMarkup(
            <QueueCardProofRenderer doc={doc} record={record} onOpen={() => {}} />,
        );
        expect(html).toContain("Morgan Household");
        expect(html).toContain("—");
        expect(html).toContain("Tour");
    });
});
