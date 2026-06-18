/**
 * Sprint 5.18N — final builder/runtime detail pass.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import { MessageSquare } from "lucide-react";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { patchLayoutEditorFieldDisplay } from "@/lib/layout/layoutEditorCompositionModel";
import {
    resolveLayoutCollectionColumnAdornment,
    resolveLayoutCollectionColumnShowIcon,
} from "@/lib/layout/layoutEditorDisplayConfig";
import {
    findRelatedListItemInSection,
    syncRelatedListSectionToItem,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import { resolveOpportunityLeadLocationFields } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import { resolveLayoutEditorWidgetToneHeaderWashClass } from "@/lib/layout/layoutEditorWidgetStyle";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";

describe("layoutBuilderRuntimeParity 5.18N", () => {
    it("preserves opportunity location_id UUID on runtime record after VM mapping", () => {
        const siteId = "11111111-1111-4111-8111-111111111111";
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            vmRecord: {
                id: "opp-1",
                location_id: siteId,
                _location_label: "North Campus",
                _inquiry_children: [{ location_id: "22222222-2222-4222-8222-222222222222", location_label: "South" }],
            },
            opportunityId: "opp-1",
            doc: buildLeadDrawerDefaultDoc(),
        });
        expect(record["opportunity.location_id"]).toBe(siteId);
        expect(record.location_id).toBe(siteId);
        expect(record["opportunity.location"]).toBe("North Campus");
    });

    it("resolveOpportunityLeadLocationFields prefers native opportunity row over child aggregate", () => {
        const lead = resolveOpportunityLeadLocationFields({
            location_id: "11111111-1111-4111-8111-111111111111",
            _location_label: "North Campus",
            _inquiry_children: [{ location_id: "22222222-2222-4222-8222-222222222222", location_label: "South" }],
        });
        expect(lead.locationId).toBe("11111111-1111-4111-8111-111111111111");
        expect(lead.locationLabel).toBe("North Campus");
    });

    it("related-list show-icon enables default adornment from refKey", () => {
        const col: LayoutCollectionColumn = {
            refKey: "child.dob_age",
            label: "Age",
            metadata: { layoutEditorDisplay: { showIcon: true } },
        };
        expect(resolveLayoutCollectionColumnShowIcon(col)).toBe(true);
        const adornment = resolveLayoutCollectionColumnAdornment(col);
        expect(adornment?.icon).toBe("calendar");
        expect(adornment?.position).toBe("left");
    });

    it("related-list explicit icon persists through display patch", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = syncRelatedListSectionToItem(doc, "children_enrollment");
        const located = findRelatedListItemInSection(doc.sections.find((s) => s.key === "children_enrollment")!)!;
        const nameIdx = located.item.columns!.findIndex((c) => c.refKey === "child.name");
        doc = patchLayoutEditorFieldDisplay(
            doc,
            { kind: "column", sectionKey: "children_enrollment", blockItemId: located.item.id, colIdx: nameIdx },
            { showIcon: true, icon: "child" },
        );
        const after = findRelatedListItemInSection(doc.sections.find((s) => s.key === "children_enrollment")!)!;
        const col = after.item.columns![nameIdx]!;
        expect(resolveLayoutCollectionColumnAdornment(col)?.icon).toBe("child");
    });

    it("KPI tile header wash coordinates with tone", () => {
        const html = renderToStaticMarkup(
            <LeadOperatingSummaryCard title="Activity" icon={<MessageSquare className="h-3.5 w-3.5" />} accent="blue">
                <p>Recent activity</p>
            </LeadOperatingSummaryCard>,
        );
        expect(html).toContain(resolveLayoutEditorWidgetToneHeaderWashClass("blue").split(" ")[0]);
        expect(html).toContain('data-layout-runtime-widget-tone="blue"');
        expect(html).toContain("Activity");
    });
});
