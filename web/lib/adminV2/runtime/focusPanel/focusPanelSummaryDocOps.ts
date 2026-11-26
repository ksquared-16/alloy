/**
 * Local structure operations on the Enrollment Focus Panel Summary working LayoutDoc (C2).
 *
 * These are pure helpers used by the Surfaces editor to mutate a *local* working
 * `LayoutDoc` — add / reorder / remove / resize a card. No DB persistence, no
 * publish, no data binding. The card MODELS are unchanged; only which cards
 * appear, in what order, and at what span becomes configuration.
 *
 * Layout note: `FocusPanelCardGrid` flattens all rows into one responsive grid
 * (`rows.flatMap`), so the working order is a single flat sequence. We persist it
 * as a one-row LayoutDoc (every card on `gridRow: 0`) which derives to the exact
 * same visual sequence as the multi-row default — preserving parity.
 */

import {
    buildFocusPanelCardSection,
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    FOCUS_PANEL_SUMMARY_SURFACE,
    readFocusPanelCardSectionMeta,
    type FocusPanelCardSectionMeta,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import type { FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import type { FocusPanelCardSpan } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc } from "@/lib/layout/layoutV2";

/**
 * A card in the working summary order (flattened; gridRow is normalized away).
 * `instanceId` is always present in the working order (`readSummaryCardOrder`
 * defaults it to `key`), uniquely identifying a placed card so the same TYPE can
 * be duplicated. Structure ops key by `instanceId`.
 */
export type SummaryCardOrderEntry = FocusPanelCardSectionMeta & { instanceId: string };

/** Resolve an order entry's stable instance id (falls back to the card type key). */
export function entryInstanceId(entry: FocusPanelCardSectionMeta): string {
    return entry.instanceId && entry.instanceId.trim() ? entry.instanceId : entry.key;
}

/** Span cycle for the resize op: 1 → 2 → full row → 1. */
export const SUMMARY_CARD_SPAN_CYCLE: readonly FocusPanelCardSpan[] = [1, 2, "row"];

/** Read the ordered card list from a doc (sorted by gridRow, then document order). */
export function readSummaryCardOrder(doc: LayoutDoc | null | undefined): SummaryCardOrderEntry[] {
    if (!doc || !Array.isArray(doc.sections)) return [];
    const collected: { order: number; meta: FocusPanelCardSectionMeta }[] = [];
    doc.sections.forEach((section, order) => {
        const meta = readFocusPanelCardSectionMeta(section);
        if (meta) collected.push({ order, meta });
    });
    collected.sort((a, b) => a.meta.gridRow - b.meta.gridRow || a.order - b.order);
    return collected.map((entry) => ({ ...entry.meta, instanceId: entryInstanceId(entry.meta) }));
}

/** Build a one-row working LayoutDoc from an ordered card list (gridRow normalized to 0). */
export function buildSummaryDocFromOrder(order: readonly SummaryCardOrderEntry[]): LayoutDoc {
    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: FOCUS_PANEL_SUMMARY_SURFACE,
        entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
        sections: order.map((meta) => buildFocusPanelCardSection({ ...meta, gridRow: 0 })),
        metadata: {
            focusPanelMode: "summary",
            layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
        },
    };
}

/**
 * Apply Focus Panel Summary working edits onto the latest canonical document.
 *
 * Persistence law: never rebuild a saved document from a partial form projection.
 * Untouched metadata (card links, forward-compatible keys, nested surfaces not in
 * the working map, etc.) survives. Sections + known composition keys are replaced
 * by the typed mutation inputs.
 */
export function mergeFocusPanelSummaryWorkingDoc(args: {
    base: LayoutDoc;
    order: readonly SummaryCardOrderEntry[];
    /** When set, replaces published layout metadata; when null/undefined, preserves base. */
    publishedLayoutMetadata?: Record<string, unknown> | null;
    /** When set, replaces nestedSurfaces; when null/undefined, preserves base. */
    nestedSurfaces?: Record<string, unknown> | null;
}): LayoutDoc {
    const { base, order } = args;
    const baseMeta =
        base.metadata && typeof base.metadata === "object" && !Array.isArray(base.metadata)
            ? { ...base.metadata }
            : {};
    const metadata: Record<string, unknown> = {
        ...baseMeta,
        focusPanelMode: "summary",
        layoutKey: FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    };
    if (args.publishedLayoutMetadata) {
        Object.assign(metadata, args.publishedLayoutMetadata);
    }
    if (args.nestedSurfaces) {
        metadata.nestedSurfaces = args.nestedSurfaces;
    }
    return {
        ...base,
        formatVersion: base.formatVersion ?? LAYOUT_DOC_FORMAT_VERSION,
        surface: FOCUS_PANEL_SUMMARY_SURFACE,
        entityType: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
        sections: order.map((meta) => buildFocusPanelCardSection({ ...meta, gridRow: 0 })),
        metadata,
    };
}

/** Allocate a unique instance id for a card type, given the existing order. Pure. */
export function nextInstanceId(order: readonly SummaryCardOrderEntry[], key: string): string {
    const taken = new Set(order.map((card) => entryInstanceId(card)));
    if (!taken.has(key)) return key;
    let n = 2;
    while (taken.has(`${key}-${n}`)) n += 1;
    return `${key}-${n}`;
}

/** Move a card one position earlier (-1) or later (+1) in the flat order. Pure. */
export function moveSummaryCard(
    order: readonly SummaryCardOrderEntry[],
    instanceId: string,
    direction: -1 | 1,
): SummaryCardOrderEntry[] {
    const index = order.findIndex((card) => entryInstanceId(card) === instanceId);
    if (index < 0) return order.slice();
    const target = index + direction;
    if (target < 0 || target >= order.length) return order.slice();
    const next = order.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    return next;
}

/** Remove a card instance from the order. Pure. */
export function removeSummaryCard(
    order: readonly SummaryCardOrderEntry[],
    instanceId: string,
): SummaryCardOrderEntry[] {
    return order.filter((card) => entryInstanceId(card) !== instanceId);
}

/** Append a card to the end of the order (no-op if the TYPE is already present). Pure. */
export function addSummaryCard(
    order: readonly SummaryCardOrderEntry[],
    meta: FocusPanelCardSectionMeta,
): SummaryCardOrderEntry[] {
    if (order.some((card) => card.key === meta.key)) return order.slice();
    return [...order, { ...meta, gridRow: 0, instanceId: meta.key }];
}

/** Duplicate a card instance (new unique instance id, inserted right after). Pure. */
export function duplicateSummaryCard(
    order: readonly SummaryCardOrderEntry[],
    instanceId: string,
): SummaryCardOrderEntry[] {
    const index = order.findIndex((card) => entryInstanceId(card) === instanceId);
    if (index < 0) return order.slice();
    const source = order[index]!;
    const clone: SummaryCardOrderEntry = {
        ...source,
        gridRow: 0,
        instanceId: nextInstanceId(order, source.key),
        ...(source.config ? { config: JSON.parse(JSON.stringify(source.config)) as FocusPanelCardConfig } : {}),
    };
    const next = order.slice();
    next.splice(index + 1, 0, clone);
    return next;
}

/** Insert a card at a specific index (clamped; no-op if the TYPE is already present). Pure. */
export function insertSummaryCard(
    order: readonly SummaryCardOrderEntry[],
    meta: FocusPanelCardSectionMeta,
    index: number,
): SummaryCardOrderEntry[] {
    if (order.some((card) => card.key === meta.key)) return order.slice();
    const next = order.slice();
    const clamped = Math.max(0, Math.min(index, next.length));
    next.splice(clamped, 0, { ...meta, gridRow: 0, instanceId: meta.key });
    return next;
}

/** Move a card to a specific index in the flat order (drag-and-drop). Pure. */
export function moveSummaryCardToIndex(
    order: readonly SummaryCardOrderEntry[],
    instanceId: string,
    targetIndex: number,
): SummaryCardOrderEntry[] {
    const index = order.findIndex((card) => entryInstanceId(card) === instanceId);
    if (index < 0) return order.slice();
    const next = order.slice();
    const [moved] = next.splice(index, 1);
    const clamped = Math.max(0, Math.min(targetIndex, next.length));
    next.splice(clamped, 0, moved!);
    return next;
}

/** Cycle a card's span (1 → 2 → row → 1). Pure. */
export function cycleSummaryCardSpan(
    order: readonly SummaryCardOrderEntry[],
    instanceId: string,
): SummaryCardOrderEntry[] {
    return order.map((card) => {
        if (entryInstanceId(card) !== instanceId) return card;
        const current = SUMMARY_CARD_SPAN_CYCLE.indexOf(card.span);
        const nextSpan = SUMMARY_CARD_SPAN_CYCLE[(current + 1) % SUMMARY_CARD_SPAN_CYCLE.length]!;
        return { ...card, span: nextSpan };
    });
}

/** Replace a card instance's content/appearance config (Inspector output). Pure. */
export function updateSummaryCardConfig(
    order: readonly SummaryCardOrderEntry[],
    instanceId: string,
    config: FocusPanelCardConfig,
): SummaryCardOrderEntry[] {
    return order.map((card) => (entryInstanceId(card) === instanceId ? { ...card, config } : card));
}
