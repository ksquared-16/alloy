/**
 * Shared row-alignment contract — Builder preview and published drawer runtime
 * must produce equivalent row structure/classes for peer sections in a row group.
 *
 * Contract owner: `LayoutEditorSectionFlowView` (the single shared section-flow
 * primitive). Used by the Builder canvas (`OpportunityDrawerLayoutEditorCanvas`)
 * and every drawer runtime composition (Lead / Person / Child) via
 * `LayoutRuntimeSectionFlowView`. This suite proves the contract does not fork
 * per drawer and survives uneven content heights.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import LeadOverviewRuntimeComposition from "@/components/layout/LeadOverviewRuntimeComposition";
import PersonOverviewRuntimeComposition from "@/components/layout/person/PersonOverviewRuntimeComposition";
import ChildOverviewRuntimeComposition from "@/components/layout/child/ChildOverviewRuntimeComposition";

import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import { buildProofChildRecord } from "@/lib/layout/runtime/buildProofChildRecord";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import {
    LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
    LAYOUT_RUNTIME_SECTION_STACK_CLASS,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";

vi.mock("@/components/childcareOperational/ChildOperationalEnrollmentPanel", () => ({
    default: () => React.createElement("div", { "data-testid": "operational-panel" }, "panel"),
    ChildOperationalEnrollmentPanelShell: () =>
        React.createElement("div", { "data-testid": "operational-panel-shell" }, "panel"),
}));

const ROW_GROUP = "row_alignment_fixture_group";

/** Build a field section with `fieldCount` items so peer sections have uneven content heights. */
function makeFieldSection(key: string, title: string, fieldCount: number): LayoutSection {
    return {
        id: `sec_${key}`,
        key,
        title,
        rows: [
            {
                id: `row_${key}`,
                columns: [
                    {
                        id: `col_${key}`,
                        width: 12,
                        items: Array.from({ length: fieldCount }, (_, i) => ({
                            id: `item_${key}_${i}`,
                            kind: "field" as const,
                            refKey: `person.fixture_${key}_${i}`,
                            label: `${title} field ${i + 1}`,
                        })),
                    },
                ],
            },
        ],
        metadata: {
            layoutEditorSectionRowGroup: ROW_GROUP,
            layoutEditorSectionRowSpan: 6,
        },
    };
}

/** Two peer sections in one row group with deliberately uneven content heights. */
function unevenRowSections(): LayoutSection[] {
    return [makeFieldSection("uneven_short", "Short", 1), makeFieldSection("uneven_tall", "Tall", 6)];
}

/** Append the uneven row-group sections to a drawer doc; unknown keys flow to overflow. */
function withRowGroupedOverflow(doc: LayoutDoc): LayoutDoc {
    return { ...doc, sections: [...doc.sections, ...unevenRowSections()] };
}

function rowGroupSignature(html: string): {
    hasRowSegment: boolean;
    hasAlignedMarker: boolean;
    hasGridDisplay: boolean;
    hasStretch: boolean;
    peerCellCount: number;
    everyPeerCellFullHeight: boolean;
} {
    const peerCells = html.match(/data-layout-runtime-peer-row-card="true"[^>]*/g) ?? [];
    // Each peer cell <div> carries class before the data attribute; capture the class token list.
    const cellClassMatches = html.match(/<div class="([^"]*)"[^>]*data-layout-runtime-peer-row-card="true"/g) ?? [];
    const everyPeerCellFullHeight =
        cellClassMatches.length > 0 && cellClassMatches.every((m) => m.includes("h-full"));
    return {
        hasRowSegment: html.includes('data-layout-section-segment="row"'),
        hasAlignedMarker: html.includes('data-layout-section-row-aligned="true"'),
        hasGridDisplay: html.includes("display:grid"),
        hasStretch: html.includes("align-items:stretch"),
        peerCellCount: peerCells.length,
        everyPeerCellFullHeight,
    };
}

describe("drawer runtime row alignment — shared primitive contract", () => {
    it("Builder caller config and runtime wrapper emit equivalent row structure/classes (uneven content)", () => {
        const sections = unevenRowSections();

        const builderHtml = renderToStaticMarkup(
            React.createElement(LayoutEditorSectionFlowView, {
                sections,
                // Builder canvas summary-strip caller config.
                stackClassName: "min-w-0",
                rowClassName: "min-w-0 w-full",
                rowCellClassName: LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
                renderSection: (section: LayoutSection) =>
                    React.createElement(
                        "div",
                        { "data-builder-section": section.key },
                        section.rows[0]?.columns[0]?.items.map((it) =>
                            React.createElement("p", { key: it.id }, it.label),
                        ),
                    ),
            }),
        );

        const runtimeHtml = renderToStaticMarkup(
            React.createElement(LayoutRuntimeSectionFlowView, {
                doc: { id: "fixture", version: 2, surface: "person_drawer", sections } as unknown as LayoutDoc,
                sections,
                record: { id: "fixture-1" },
                entityId: "fixture-1",
            }),
        );

        const builderSig = rowGroupSignature(builderHtml);
        const runtimeSig = rowGroupSignature(runtimeHtml);

        // Structural row contract is identical across Builder and runtime.
        expect(builderSig.hasRowSegment).toBe(true);
        expect(runtimeSig.hasRowSegment).toBe(true);
        expect(builderSig.hasAlignedMarker).toBe(true);
        expect(runtimeSig.hasAlignedMarker).toBe(true);
        expect(builderSig.hasGridDisplay).toBe(true);
        expect(runtimeSig.hasGridDisplay).toBe(true);
        expect(builderSig.hasStretch).toBe(true);
        expect(runtimeSig.hasStretch).toBe(true);
        expect(builderSig.peerCellCount).toBe(2);
        expect(runtimeSig.peerCellCount).toBe(2);
        expect(builderSig.everyPeerCellFullHeight).toBe(true);
        expect(runtimeSig.everyPeerCellFullHeight).toBe(true);
    });

    it("peer-row cell stretch contract cannot drift when caller omits height classes", () => {
        const html = renderToStaticMarkup(
            React.createElement(LayoutEditorSectionFlowView, {
                sections: unevenRowSections(),
                // Intentionally minimal cell class — primitive must still force full-height stretch.
                rowCellClassName: "min-w-0",
                renderSection: (section: LayoutSection) =>
                    React.createElement("div", { "data-test-section": section.key }),
            }),
        );
        const sig = rowGroupSignature(html);
        expect(sig.everyPeerCellFullHeight).toBe(true);
        expect(html).toContain("flex h-full min-h-0 flex-col");
    });

    it("canonical stack rhythm is a single source (≥5px gap)", () => {
        expect(LAYOUT_RUNTIME_SECTION_STACK_CLASS).toContain("gap-5");
    });
});

describe("drawer runtime row alignment — all drawer paths use the shared primitive", () => {
    it("Opportunity / Lead drawer runtime aligns peer row sections", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const bodyDoc = withRowGroupedOverflow(
            splitDrawerLayoutDocShellZones(doc, "opportunity").bodyDoc,
        );
        const html = renderToStaticMarkup(
            React.createElement(LeadOverviewRuntimeComposition, {
                doc: bodyDoc,
                record: buildProofOpportunityRecord(),
                entityId: "opp-1",
            }),
        );
        expect(html).toContain('data-debug-drawer-path="LeadOverviewRuntimeComposition"');
        expect(html).toContain('data-layout-section-row-aligned="true"');
        expect(html).toContain('data-layout-section-segment="row"');
    });

    it("Person drawer runtime aligns peer row sections", () => {
        const doc = withRowGroupedOverflow(buildPersonDrawerDefaultDoc());
        const html = renderToStaticMarkup(
            React.createElement(PersonOverviewRuntimeComposition, {
                doc,
                record: buildProofPersonRecord(),
                entityId: "person-1",
            }),
        );
        expect(html).toContain('data-debug-drawer-path="PersonOverviewRuntimeComposition"');
        expect(html).toContain('data-layout-section-row-aligned="true"');
        expect(html).toContain('data-layout-section-segment="row"');
    });

    it("Child drawer runtime aligns peer row sections", () => {
        const doc = withRowGroupedOverflow(buildChildDrawerDefaultDoc());
        const html = renderToStaticMarkup(
            React.createElement(ChildOverviewRuntimeComposition, {
                doc,
                record: buildProofChildRecord(),
                entityId: "child-1",
            }),
        );
        expect(html).toContain('data-debug-drawer-path="ChildOverviewRuntimeComposition"');
        expect(html).toContain('data-layout-section-row-aligned="true"');
        expect(html).toContain('data-layout-section-segment="row"');
    });
});
