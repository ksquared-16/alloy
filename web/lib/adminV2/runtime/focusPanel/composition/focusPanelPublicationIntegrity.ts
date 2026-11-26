/**
 * PUBLICATION INTEGRITY — a published Focus Panel document may not contradict itself.
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────────────────────
 *
 * A Focus Panel Summary document carries TWO independent records of one composition:
 *
 *   1. `doc.sections`                   — the authored cards: key, tier, span, density, visibility
 *   2. `doc.metadata.focusPanelLayout`  — the operator-published explicit layout, and the runtime
 *                                          SOURCE OF TRUTH (`readFocusPanelPublishedLayout`)
 *
 * When an explicit layout is present the runtime renders exactly the cards it names. A section can
 * therefore be authored, marked `visible`, pass every existing validator, publish with a 200, and
 * be drawn by nothing — because the other list never learned about it. Nothing anywhere reported an
 * error; the card simply was not there.
 *
 * That is what happened on this tenant. `billing_preview` — the card that owns acceptance of
 * recurring tuition terms — was added to `sections` in v159 and made visible in v160, while
 * `metadata.focusPanelLayout.grid.areas` continued to name the same six cards it always had. The
 * published document said the card existed; the runtime rendered six cards; and the gap between
 * those two statements cost several runs of investigation, because every surface an investigator
 * can read said the card was placed.
 *
 * ── WHY PUBLICATION, NOT RENDER ───────────────────────────────────────────────────────────────
 *
 * The render-time repair would be to fall back to auto-composition for an unplaced visible card.
 * That hides the contradiction rather than ending it: the operator's published geometry and the
 * rendered geometry would differ, silently, forever. A document that cannot be rendered as written
 * should not become the published record. So the check runs where the publish route already says
 * *"a published doc must be renderable"* — and refuses.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────────────────────────
 *
 * Not card-specific. It names no card; it compares two lists. `billing_preview` is protected by it
 * exactly as much as `household` is, and a card added next year is protected without being added
 * here.
 *
 * Not a grain check. Grain compatibility is a property of the RECORD a card renders against, not of
 * the document — one document serves every record on its surface — so it is resolved downstream and
 * is deliberately outside this rule.
 *
 * Not applied to documents without an explicit layout. With no `focusPanelLayout` there is one list,
 * the Composition Engine places the authored sections, and there is nothing to contradict.
 */

import { readFocusPanelPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { isCardProviderUnavailable } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardProviders";
import { cardVisibilityFromMeta } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { readFocusPanelCardSectionMeta } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

export type FocusPanelPublicationIntegrityIssue = {
    /**
     * `visible_card_not_placed`   — authored visible, absent from the explicit layout: the operator
     *                                is told the card is on the panel and the runtime never draws it.
     * `placed_card_not_authored`  — the explicit layout places a card the document does not author,
     *                                so the runtime draws a card carrying no configuration.
     */
    code: "visible_card_not_placed" | "placed_card_not_authored";
    card: FocusPanelCardKey;
    message: string;
};

/** Is this the Focus Panel Summary document shape (the only one carrying two card lists)? */
export function isFocusPanelSummaryLayoutDoc(doc: LayoutDoc | null | undefined): boolean {
    const metadata = doc?.metadata;
    return !!metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).focusPanelMode === "summary";
}

/** Every card key the explicit layout places — grid areas and the rows projection together. */
function cardsPlacedByPublishedLayout(doc: LayoutDoc): Set<string> | null {
    const layout = readFocusPanelPublishedLayout(doc as { metadata?: Record<string, unknown> | null });
    if (!layout) return null;
    const placed = new Set<string>();
    for (const area of layout.grid?.areas ?? []) placed.add(area.card);
    for (const row of layout.rows ?? []) {
        for (const cell of row.cells) for (const card of cell.cards) placed.add(card);
    }
    return placed;
}

/**
 * The two lists, compared. Empty means the document renders as it reads.
 *
 * Provider-unavailable cards are treated exactly as the runtime treats them — as hidden — so a
 * capability awaiting its adapter is not mistaken for a publication defect.
 */
export function focusPanelPublicationIntegrityIssues(
    doc: LayoutDoc | null | undefined,
): FocusPanelPublicationIntegrityIssue[] {
    if (!doc || !isFocusPanelSummaryLayoutDoc(doc)) return [];
    const placed = cardsPlacedByPublishedLayout(doc);
    // No explicit layout → one list → no contradiction is possible.
    if (!placed) return [];

    const issues: FocusPanelPublicationIntegrityIssue[] = [];
    const authored = new Set<string>();

    for (const section of doc.sections ?? []) {
        const meta = readFocusPanelCardSectionMeta(section);
        if (!meta) continue;
        authored.add(meta.key);
        if (isCardProviderUnavailable(meta.key)) continue;
        if (cardVisibilityFromMeta(meta) !== "visible") continue;
        if (placed.has(meta.key)) continue;
        issues.push({
            code: "visible_card_not_placed",
            card: meta.key,
            message:
                `"${focusPanelCardCatalogLabel(meta.key)}" (${meta.key}) is published as a visible card but the ` +
                `published layout does not place it, so the runtime would render the document without it. ` +
                `Place the card in the layout, or set its visibility to Linked or Hidden.`,
        });
    }

    for (const card of placed) {
        if (authored.has(card)) continue;
        issues.push({
            code: "placed_card_not_authored",
            card: card as FocusPanelCardKey,
            message:
                `The published layout places "${focusPanelCardCatalogLabel(card as FocusPanelCardKey)}" (${card}) ` +
                `but the document authors no such card, so the runtime would render it with no configuration. ` +
                `Add the card to the document, or remove it from the layout.`,
        });
    }

    return issues;
}

/** The publication verdict: a contradictory document is refused rather than stored as the record. */
export function validateFocusPanelPublicationIntegrity(
    doc: LayoutDoc | null | undefined,
): { ok: boolean; errors: string[] } {
    const issues = focusPanelPublicationIntegrityIssues(doc);
    return { ok: issues.length === 0, errors: issues.map((i) => i.message) };
}
