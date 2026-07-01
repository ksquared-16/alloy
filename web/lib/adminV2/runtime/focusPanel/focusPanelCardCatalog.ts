/**
 * In-context card catalog for the Surfaces editor (Structure mode).
 *
 * Each entry maps an operator-facing card name to a runtime card key. Entries
 * whose `cardKey` is null are catalogued business concepts that do not yet have a
 * runtime card model on this surface (shown but not addable) — we surface them
 * honestly rather than fabricating non-runtime cards. The list is the union of
 * the requested catalog and every card in the default Summary grid, so any
 * removal is reversible.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type FocusPanelCardCatalogEntry = {
    label: string;
    cardKey: FocusPanelCardKey | null;
    /** Shown when the concept exists but has no runtime card on this surface yet. */
    note?: string;
};

export const FOCUS_PANEL_CARD_CATALOG: readonly FocusPanelCardCatalogEntry[] = [
    { label: "Why Now", cardKey: "attention" },
    { label: "Current Mission", cardKey: "current_mission" },
    { label: "Current Work", cardKey: "current_work" },
    { label: "Enrollment Health", cardKey: "health" },
    { label: "Readiness", cardKey: "readiness_kpi" },
    { label: "Tour", cardKey: "tour_summary" },
    { label: "Household", cardKey: "household" },
    { label: "Children", cardKey: "children" },
    { label: "Communications", cardKey: "communications" },
    { label: "Documents", cardKey: "documents" },
    { label: "Tasks", cardKey: "tasks" },
    { label: "Billing Preview", cardKey: "billing_preview" },
    { label: "KPI / Metric", cardKey: null, note: "Bind an Operational Intelligence metric — next phase" },
];
