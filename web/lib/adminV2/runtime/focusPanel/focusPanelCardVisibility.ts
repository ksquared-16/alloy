/**
 * Focus Panel card visibility — platform-owned configuration on card instances.
 *
 *   visible — renders in the initial Focus Panel composition
 *   linked  — fully configured/published/navigable; not in initial composition
 *   hidden  — unavailable (library only); not a link destination; never loaded
 *
 * Additive on Focus Panel section metadata. Missing/invalid → "visible".
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import type { FocusPanelCardSectionMeta } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import type { FocusPanelCardLink } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinks";

/** Minimal order entry shape — avoids importing summaryDocOps (circular with layout model). */
export type FocusPanelVisibilityOrderEntry = FocusPanelCardSectionMeta & { instanceId: string };

function entryId(entry: FocusPanelVisibilityOrderEntry): string {
    return entry.instanceId?.trim() || entry.key;
}

export const FOCUS_PANEL_CARD_VISIBILITIES = ["visible", "linked", "hidden"] as const;
export type FocusPanelCardVisibility = (typeof FOCUS_PANEL_CARD_VISIBILITIES)[number];

/** Enrollment default composition — Visible / Linked only (Hidden stay in library). */
export const ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS: readonly FocusPanelCardKey[] = [
    // The canonical successor, in the placement `current_work` held. Stored tenant configuration
    // naming the legacy key normalizes to this one, so the card keeps its position rather than
    // moving or disappearing.
    "business_process",
    "household",
    "children",
    "scheduling",
    "billing_preview",
    "employment",
    // The operating day. It renders against the SCOPED participant and stays quiet when none is
    // selected, so it earns a full row rather than competing with the family-level cards above.
    "attendance",
    // What is owed and what happened — the account, scoped to whoever the panel is about.
    "financials",
];

export const ENROLLMENT_DEFAULT_LINKED_CARD_KEYS: readonly FocusPanelCardKey[] = [
    "tour_summary",
    "communications",
    "milestones",
];

export function normalizeFocusPanelCardVisibility(value: unknown): FocusPanelCardVisibility {
    if (value === "linked" || value === "hidden" || value === "visible") return value;
    return "visible";
}

export function defaultVisibilityForEnrollmentCard(key: FocusPanelCardKey): FocusPanelCardVisibility {
    if ((ENROLLMENT_DEFAULT_LINKED_CARD_KEYS as readonly string[]).includes(key)) return "linked";
    if ((ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS as readonly string[]).includes(key)) return "visible";
    return "hidden";
}

export function cardVisibilityFromMeta(
    meta: Pick<FocusPanelCardSectionMeta, "visibility" | "key"> | null | undefined,
): FocusPanelCardVisibility {
    if (!meta) return "visible";
    if (meta.visibility) return normalizeFocusPanelCardVisibility(meta.visibility);
    return "visible";
}

export function partitionSummaryCardsByVisibility(
    order: readonly FocusPanelVisibilityOrderEntry[],
): {
    visible: FocusPanelVisibilityOrderEntry[];
    linked: FocusPanelVisibilityOrderEntry[];
    hidden: FocusPanelVisibilityOrderEntry[];
} {
    const visible: FocusPanelVisibilityOrderEntry[] = [];
    const linked: FocusPanelVisibilityOrderEntry[] = [];
    const hidden: FocusPanelVisibilityOrderEntry[] = [];
    for (const entry of order) {
        const visibility = cardVisibilityFromMeta(entry);
        if (visibility === "linked") linked.push(entry);
        else if (visibility === "hidden") hidden.push(entry);
        else visible.push(entry);
    }
    return { visible, linked, hidden };
}

export function setSummaryCardVisibility(
    order: readonly FocusPanelVisibilityOrderEntry[],
    instanceId: string,
    visibility: FocusPanelCardVisibility,
): FocusPanelVisibilityOrderEntry[] {
    return order.map((entry) =>
        entryId(entry) === instanceId ? { ...entry, visibility } : entry,
    );
}

/** Filter published layout geometry to Visible cards only (Linked/Hidden omitted). */
export function filterPublishedLayoutToVisibleCards(
    layout: FocusPanelPublishedLayout | null | undefined,
    visibilityByCardKey: ReadonlyMap<FocusPanelCardKey, FocusPanelCardVisibility>,
): FocusPanelPublishedLayout | null {
    if (!layout) return null;
    const isVisible = (card: string) =>
        (visibilityByCardKey.get(card as FocusPanelCardKey) ?? "visible") === "visible";

    if (layout.grid?.areas?.length) {
        const areas = layout.grid.areas.filter((area) => isVisible(area.card));
        return {
            ...layout,
            grid: { ...layout.grid, areas },
            rows: layout.rows
                ?.map((row) => ({
                    ...row,
                    cells: row.cells
                        .map((cell) => ({
                            ...cell,
                            cards: cell.cards.filter((card) => isVisible(card)),
                        }))
                        .filter((cell) => cell.cards.length > 0),
                }))
                .filter((row) => row.cells.length > 0),
        };
    }

    if (!layout.rows?.length) return layout;
    return {
        ...layout,
        rows: layout.rows
            .map((row) => ({
                ...row,
                cells: row.cells
                    .map((cell) => ({
                        ...cell,
                        cards: cell.cards.filter((card) => isVisible(card)),
                    }))
                    .filter((cell) => cell.cards.length > 0),
            }))
            .filter((row) => row.cells.length > 0),
    };
}

/** Link destinations may target Visible or Linked — never Hidden. */
export function isFocusPanelCardLinkDestinationEligible(
    visibility: FocusPanelCardVisibility | null | undefined,
): boolean {
    const v = normalizeFocusPanelCardVisibility(visibility ?? "visible");
    return v === "visible" || v === "linked";
}

export type HiddenCardLinkReference = {
    fromCard: FocusPanelCardKey;
    fromCardLabel: string;
    fromFieldKey: string;
    toCard: FocusPanelCardKey;
};

/** Builder warning payload when a Hidden card is still referenced by Linked fields. */
export function findHiddenCardLinkReferences(args: {
    links: readonly FocusPanelCardLink[] | null | undefined;
    visibilityByCardKey: ReadonlyMap<FocusPanelCardKey, FocusPanelCardVisibility>;
}): HiddenCardLinkReference[] {
    const out: HiddenCardLinkReference[] = [];
    for (const link of args.links ?? []) {
        const destVis = args.visibilityByCardKey.get(link.toCard) ?? "visible";
        if (destVis !== "hidden") continue;
        out.push({
            fromCard: link.fromCard,
            fromCardLabel: focusPanelCardCatalogLabel(link.fromCard),
            fromFieldKey: link.fromFieldKey ?? "",
            toCard: link.toCard,
        });
    }
    return out;
}

export function formatHiddenCardLinkWarning(refs: readonly HiddenCardLinkReference[]): string | null {
    if (!refs.length) return null;
    const lines = refs.map(
        (ref) => `${ref.fromCardLabel} → ${ref.fromFieldKey}`,
    );
    return `This card is currently referenced by: ${lines.join(", ")}. Choose: Move to Linked | Remove link | Choose another destination`;
}

/** Build visibility map from summary order entries. */
export function visibilityMapFromSummaryOrder(
    order: readonly FocusPanelVisibilityOrderEntry[],
): Map<FocusPanelCardKey, FocusPanelCardVisibility> {
    const map = new Map<FocusPanelCardKey, FocusPanelCardVisibility>();
    for (const entry of order) {
        map.set(entry.key, cardVisibilityFromMeta(entry));
    }
    return map;
}
