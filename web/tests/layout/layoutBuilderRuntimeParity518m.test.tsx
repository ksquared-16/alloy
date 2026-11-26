/**
 * Sprint 5.18M — related-list field persistence + drawer visual hierarchy.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import { AlertTriangle } from "lucide-react";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { patchLayoutEditorFieldDisplay } from "@/lib/layout/layoutEditorCompositionModel";
import { readLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import { shouldShowLayoutEditorFieldLabel } from "@/lib/layout/runtime/applyLayoutEditorFieldDisplay";
import {
    findRelatedListItemInSection,
    patchLayoutEditorRelatedListConfig,
    syncRelatedListSectionToItem,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { applyPeerCardWidth } from "@/lib/layout/layoutBuilderPeerCardRows";
import { segmentSectionsForRowLayout } from "@/lib/layout/layoutEditorSectionLayout";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";

function patchChildrenAgeColumn(
    doc: ReturnType<typeof buildLeadDrawerDefaultDoc>,
    display: { showLabel?: boolean; typographyIntent?: "secondary" | "emphasis" },
    label?: string,
) {
    const sectionKey = "children_enrollment";
    const located = findRelatedListItemInSection(doc.sections.find((s) => s.key === sectionKey)!);
    const ageIdx = located!.item.columns!.findIndex((c) => c.refKey === "child.dob_age");
    expect(ageIdx).toBeGreaterThanOrEqual(0);
    return patchLayoutEditorFieldDisplay(
        doc,
        { kind: "column", sectionKey, blockItemId: located!.item.id, colIdx: ageIdx },
        display,
        label,
    );
}

describe("layoutBuilderRuntimeParity 5.18M", () => {
    it("parseLayoutDoc preserves related-list column layoutEditorDisplay metadata", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = syncRelatedListSectionToItem(doc, "children_enrollment");
        doc = patchChildrenAgeColumn(doc, { showLabel: false, typographyIntent: "secondary" }, "Age");

        const roundTrip = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(roundTrip.ok).toBe(true);
        const section = roundTrip.doc!.sections.find((s) => s.key === "children_enrollment")!;
        const item = findRelatedListItemInSection(section)?.item;
        const ageCol = item?.columns?.find((c) => c.refKey === "child.dob_age");
        expect(ageCol?.label).toBe("Age");
        expect(readLayoutEditorDisplayConfig(ageCol as LayoutCollectionColumn).showLabel).toBe(false);
        expect(readLayoutEditorDisplayConfig(ageCol as LayoutCollectionColumn).typographyIntent).toBe("secondary");
    });

    it("related-list hide-label and emphasis survive row-layout sync", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = syncRelatedListSectionToItem(doc, "children_enrollment");
        doc = patchChildrenAgeColumn(doc, { showLabel: false, typographyIntent: "secondary" });

        const located = findRelatedListItemInSection(doc.sections.find((s) => s.key === "children_enrollment")!)!;
        doc = patchLayoutEditorRelatedListConfig(doc, "children_enrollment", {
            primaryRow: { fields: ["child.name", "child.dob_age", "child.start_date"] },
            secondaryRow: { fields: ["child.program", "child.room"] },
        });

        const after = findRelatedListItemInSection(doc.sections.find((s) => s.key === "children_enrollment")!)!;
        const ageCol = after.item.columns?.find((c) => c.refKey === "child.dob_age");
        expect(readLayoutEditorDisplayConfig(ageCol as LayoutCollectionColumn).showLabel).toBe(false);
        expect(readLayoutEditorDisplayConfig(ageCol as LayoutCollectionColumn).typographyIntent).toBe("secondary");
    });

    it("runtime honors related-list hide-label from column metadata", () => {
        const col: LayoutCollectionColumn = {
            refKey: "child.dob_age",
            label: "Age",
            metadata: { layoutEditorDisplay: { showLabel: false, typographyIntent: "secondary" } },
        };
        const display = readLayoutEditorDisplayConfig(col);
        expect(shouldShowLayoutEditorFieldLabel(display)).toBe(false);
        expect(display.typographyIntent).toBe("secondary");
    });

    it("KPI tile applies tone to rail, icon badge, and title", () => {
        const html = renderToStaticMarkup(
            <LeadOperatingSummaryCard title="Attention" icon={<AlertTriangle className="h-3.5 w-3.5" />} accent="red">
                <p>Needs follow-up</p>
            </LeadOperatingSummaryCard>,
        );
        expect(html).toContain('data-layout-runtime-widget-tone="red"');
        expect(html).toContain("border-l-red-500/70");
        expect(html).toContain("text-red-600/85");
        expect(html).toContain("text-red-600/85");
    });

    it("peer row cards stretch to equal height in section flow", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = applyPeerCardWidth(doc, "household_contact", "third");
        doc = applyPeerCardWidth(doc, "children_enrollment", "two_thirds");
        const sections = doc.sections.filter((s) => s.key === "household_contact" || s.key === "children_enrollment");
        const segments = segmentSectionsForRowLayout(sections);
        const row = segments.find((s) => s.kind === "row");
        expect(row?.kind).toBe("row");

        const html = renderToStaticMarkup(
            <LayoutEditorSectionFlowView
                sections={sections}
                rowCellClassName="min-w-0 flex h-full min-h-0 flex-col"
                renderSection={(section) => <div data-section-key={section.key}>Card</div>}
            />,
        );
        expect(html).toContain('data-layout-section-segment="row"');
        expect(html).toContain('data-layout-runtime-peer-row-card="true"');
        expect(html).toContain("flex h-full min-h-0 flex-col");
    });
});
