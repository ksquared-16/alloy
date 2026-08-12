/**
 * THE code-owned Focus Panel Summary default composition — one surface authority.
 *
 * This is the single place the platform declares "what the Enrollment Summary looks like when
 * the org has published nothing". Everything downstream is GENERATED from it:
 *
 *     composition ──▶ FOCUS_PANEL_SUMMARY_DEFAULT_DOC   (sections, reading order, visibility)
 *                 └─▶ metadata.focusPanelLayout          (the 12-column grid the runtime renders)
 *
 * A tenant-published `LayoutDoc` OVERRIDES this wholesale; it is never merged with it. See
 * `usePublishedFocusPanelSummaryDoc` (client) / `workUnitProvisioningAnswer` (server seed).
 *
 * ── Vocabulary ────────────────────────────────────────────────────────────────────────────
 * Placement is authored in the **12-column area** vocabulary (`colStart/colSpan/rowStart/rowSpan`)
 * because that is the ONE vocabulary that actually renders: the Summary composer authors it, it is
 * persisted as `metadata.focusPanelLayout`, and `planPublishedLayout` turns it into the published
 * lanes the operator sees. The area numbers below are surface-owned literals — they were the values
 * this surface already computed, now stated directly instead of derived through a card-keyed table.
 *
 * ── `encodedSpan` / `encodedDensity` are NOT placement authority ──────────────────────────
 * `readFocusPanelCardSectionMeta` rejects a section that lacks `span`/`density`, so every encoded
 * section must carry them and every persisted doc already does. They are **render-inert**: the
 * published path plans from grid areas, the composition path derives density from composition
 * weight, and the legacy grid path is unreachable for Summary. They are preserved here verbatim at
 * the encode/schema boundary for compatibility (stored docs, validators, the editor round-trip) and
 * carry no authority. Removing them is a schema migration, not a placement change.
 *
 * The card-owned placement capability layer remains intentionally empty: no card property has been
 * shown to travel across surfaces (Summary and Work place disjoint card sets). See
 * `docs/runtime/CARD-PLACEMENT-OWNERSHIP.md`.
 */

import type { FocusPanelCardKey, FocusPanelCardTier } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardDensity, FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import {
    FOCUS_PANEL_GRID_COLUMNS,
    type FocusPanelGridArea,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/** Where a card sits on the 12-column surface. Omitted for Linked cards (no initial geometry). */
export type SummaryCompositionArea = Pick<FocusPanelGridArea, "colStart" | "colSpan" | "rowStart" | "rowSpan">;

export type SummaryCompositionEntry = {
    key: FocusPanelCardKey;
    tier: FocusPanelCardTier;
    /** Visible cards occupy initial geometry; Linked cards stay navigable-only. */
    visibility: "visible" | "linked";
    /** 12-column placement. Present for Visible cards only. */
    area?: SummaryCompositionArea;
    /** Schema-required, render-inert. See module docblock. */
    encodedSpan: FocusPanelCardSpan;
    /** Schema-required, render-inert. See module docblock. */
    encodedDensity: FocusPanelCardDensity;
};

/**
 * Reading order is ARRAY ORDER (encoded as each section's `gridRow`).
 *
 * Layout: What's Next holds the left column full height; Household then Children stack in the right
 * column; Assignments and Billing Preview close the surface on a shared bottom row.
 */
export const FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION: readonly SummaryCompositionEntry[] = [
    {
        key: "current_work",
        tier: "work",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "household",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "children",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 4 },
        encodedSpan: 1,
        encodedDensity: "standard",
    },
    {
        key: "scheduling",
        tier: "reference",
        visibility: "visible",
        area: { colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    {
        key: "billing_preview",
        tier: "context",
        visibility: "visible",
        area: { colStart: 7, colSpan: 6, rowStart: 8, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    {
        // Employment closes the surface on its own row. Placed VISIBLE rather than Linked because
        // a Linked card is navigable but never rendered — `linkedCardKeys` feeds `focusTargets`
        // only — and an operator arriving from a staff gesture must SEE the answer, not merely be
        // able to hand off to it. For a family with no employed contact the card model reports
        // `visible: false`, which the readiness contract turns into `not_applicable`: the cell is
        // kept and renders its muted treatment rather than asserting a relationship.
        key: "employment",
        tier: "reference",
        visibility: "visible",
        // ⚠ SIX columns in the right-hand reference lane, not a full-width row. A card spanning all
        // 12 columns cannot be planned into lanes, so `planPublishedLayout` fell back from `lanes`
        // to `grid` for the WHOLE panel — every other card's placement changed with it. Employment
        // sits under Billing Preview, beside the other reference cards.
        area: { colStart: 7, colSpan: 6, rowStart: 10, rowSpan: 2 },
        encodedSpan: 1,
        encodedDensity: "compact",
    },
    { key: "tour_summary", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
    { key: "communications", tier: "reference", visibility: "linked", encodedSpan: 1, encodedDensity: "standard" },
    { key: "milestones", tier: "context", visibility: "linked", encodedSpan: 1, encodedDensity: "compact" },
];

/** The 12-column grid the runtime renders — generated from the composition (Visible cards only). */
export function focusPanelSummaryDefaultGrid(): FocusPanelGridLayout {
    const areas: FocusPanelGridArea[] = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.flatMap((entry) =>
        entry.area ? [{ card: entry.key, ...entry.area }] : [],
    );
    return { columns: FOCUS_PANEL_GRID_COLUMNS, areas };
}
