/**
 * Section composition diagnostics for visual editor vs runtime parity (Phase 5.12).
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { listSectionCompositionRows } from "@/lib/layout/layoutEditorSectionComposition";
import {
    shouldHonorLayoutDocHouseholdBlocks,
    sectionHasLayoutOwnedComposition,
} from "@/lib/layout/runtime/resolveLayoutEditorHouseholdRendering";

export type SectionCompositionDiagnostic = {
    sectionKey: string;
    publishedLayoutVersion: number | null;
    publishedLayoutId: string | null;
    rowCount: number;
    columnCounts: number[];
    itemCount: number;
    runtimeCompositionSource: string;
    honorsLayoutDocRows: boolean;
};

export type CompositionDiagnosticContext = {
    layoutRecordId?: string | null;
    layoutVersion?: number | null;
    surface: "editor_preview" | "live_drawer_runtime";
    honorLayoutDocBlocks?: boolean;
    opportunityEntityLayoutsVisualConfig?: boolean;
};

export function summarizeSectionCompositionDiagnostic(
    doc: LayoutDoc,
    sectionKey: string,
    ctx: CompositionDiagnosticContext,
): SectionCompositionDiagnostic | null {
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) return null;

    const rows = listSectionCompositionRows(doc, sectionKey);
    const honorsLayoutDocRows =
        sectionHasLayoutOwnedComposition(section)
        || shouldHonorLayoutDocHouseholdBlocks({
            sectionKey,
            compositionSectionSurface: true,
            operatorSurfaces: true,
            honorLayoutDocBlocks: ctx.honorLayoutDocBlocks,
            opportunityEntityLayoutsVisualConfig: ctx.opportunityEntityLayoutsVisualConfig,
        });

    let runtimeCompositionSource = "layout_doc_rows";
    if (
        (sectionKey === "household_contact" || sectionKey === "household_relationships")
        && !honorsLayoutDocRows
    ) {
        runtimeCompositionSource = "drawer_household_profile_substitution";
    } else if (ctx.surface === "editor_preview") {
        runtimeCompositionSource = "visual_editor_preview";
    } else if (ctx.honorLayoutDocBlocks || ctx.opportunityEntityLayoutsVisualConfig) {
        runtimeCompositionSource = "published_entity_layout_doc";
    }

    return {
        sectionKey,
        publishedLayoutVersion: ctx.layoutVersion ?? null,
        publishedLayoutId: ctx.layoutRecordId ?? null,
        rowCount: rows.length,
        columnCounts: rows.map((r) => r.columnCount),
        itemCount: rows.reduce((n, r) => n + r.columns.reduce((m, c) => m + c.items.length, 0), 0),
        runtimeCompositionSource,
        honorsLayoutDocRows,
    };
}

export function summarizeLayoutDocCompositionDiagnostics(
    doc: LayoutDoc,
    ctx: Omit<CompositionDiagnosticContext, "surface"> & { surface?: CompositionDiagnosticContext["surface"] },
): SectionCompositionDiagnostic[] {
    const surface = ctx.surface ?? "live_drawer_runtime";
    return doc.sections
        .map((section) =>
            summarizeSectionCompositionDiagnostic(doc, section.key, {
                ...ctx,
                surface,
            }),
        )
        .filter((d): d is SectionCompositionDiagnostic => d != null);
}
