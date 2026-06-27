/**
 * Derive the Focus Panel grid from a `LayoutDoc` (config-driven read path).
 *
 * This converts the stored composition (Card = Section) into the existing
 * `FocusPanelCardGridSpec` consumed by `FocusPanelCardGrid`. The card MODELS
 * (content/insights) are unchanged — they still come from the VM via
 * `deriveOpportunityFocusPanelPresentation`. Only WHICH cards appear, in what
 * order, span, and grid row becomes configuration. The renderer is identical,
 * so a published surface and an editable surface are visually identical.
 */

import { readFocusPanelCardSectionMeta } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import type { FocusPanelCardGridSpec } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

type GridCell = FocusPanelCardGridSpec["rows"][number]["cells"][number];

/**
 * Build a `FocusPanelCardGridSpec` from a Focus Panel Summary `LayoutDoc`.
 *
 * Sections carrying Focus Panel card metadata are grouped by `gridRow` (rows
 * sorted ascending), preserving document order within each row. Sections
 * without valid Focus Panel metadata are skipped defensively. Empty rows are
 * omitted so an empty doc yields `{ rows: [] }` (caller falls back).
 */
export function deriveFocusPanelGridFromLayoutDoc(doc: LayoutDoc | null | undefined): FocusPanelCardGridSpec {
    if (!doc || !Array.isArray(doc.sections) || doc.sections.length === 0) {
        return { rows: [] };
    }

    const byRow = new Map<number, { order: number; cell: GridCell }[]>();

    doc.sections.forEach((section, order) => {
        const meta = readFocusPanelCardSectionMeta(section);
        if (!meta) return;
        const cell: GridCell = {
            key: meta.key,
            span: meta.span,
            density: meta.density,
            tier: meta.tier,
            instanceKey: meta.instanceId ?? meta.key,
        };
        const bucket = byRow.get(meta.gridRow) ?? [];
        bucket.push({ order, cell });
        byRow.set(meta.gridRow, bucket);
    });

    const rows = [...byRow.keys()]
        .sort((a, b) => a - b)
        .map((rowKey) => ({
            cells: byRow
                .get(rowKey)!
                .sort((a, b) => a.order - b.order)
                .map((entry) => entry.cell),
        }))
        .filter((row) => row.cells.length > 0);

    return { rows };
}

/** Resolved per-instance binding for runtime model + config lookup. */
export type FocusPanelInstanceResolution = {
    typeKey: string;
    config: FocusPanelCardConfig | null;
};

/**
 * Map each placed instance key → its card TYPE and per-card config, so the
 * operator runtime can resolve the base model by type and apply the published
 * config (effective model). Keyed by `instanceKey` to match grid cells.
 */
export function deriveFocusPanelInstanceMap(
    doc: LayoutDoc | null | undefined,
): Map<string, FocusPanelInstanceResolution> {
    const map = new Map<string, FocusPanelInstanceResolution>();
    if (!doc || !Array.isArray(doc.sections)) return map;
    doc.sections.forEach((section) => {
        const meta = readFocusPanelCardSectionMeta(section);
        if (!meta) return;
        map.set(meta.instanceId ?? meta.key, { typeKey: meta.key, config: meta.config ?? null });
    });
    return map;
}
