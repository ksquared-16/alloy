/**
 * In-context card catalog for the Surfaces editor (Structure mode).
 *
 * Each entry maps an operator-facing card name to a runtime card key. Entries
 * whose `cardKey` is null are catalogued business concepts that do not yet have a
 * runtime card model on this surface (shown but not addable) — we surface them
 * honestly rather than fabricating non-runtime cards. The list is the union of
 * the requested catalog and every card in the default Summary grid, so any
 * removal is reversible.
 *
 * Card identity: runtime storage key stays canonical (`current_work`). Operator-
 * facing builder/runtime label is **What's Next**. Legacy labels/keys normalize
 * to that one identity — never duplicate Current Work + What's Next in catalog.
 */

import {
    FOCUS_PANEL_CARD_KEYS,
    type FocusPanelCardKey,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type FocusPanelCardCatalogEntry = {
    label: string;
    cardKey: FocusPanelCardKey | null;
    /** Shown when the concept exists but has no runtime card on this surface yet. */
    note?: string;
};

/** Canonical runtime key for the What's Next / Current Work surface. */
export const FOCUS_PANEL_WHATS_NEXT_CARD_KEY = "current_work" as const satisfies FocusPanelCardKey;

/** Operator-facing catalog + builder label (runtime micro-label matches). */
export const FOCUS_PANEL_WHATS_NEXT_LABEL = "What's Next";

/**
 * Legacy stored keys that still resolve to the canonical What's Next card.
 * New authoring always persists {@link FOCUS_PANEL_WHATS_NEXT_CARD_KEY}.
 */
const FOCUS_PANEL_CARD_KEY_ALIASES: Readonly<Record<string, FocusPanelCardKey>> = {
    whats_next: FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
    "whats-next": FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
    "current-work": FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
};

/** Legacy operator labels that search/resolve to the same card. */
const FOCUS_PANEL_CARD_LABEL_ALIASES: Readonly<Record<string, FocusPanelCardKey>> = {
    "current work": FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
    "what's next": FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
    "whats next": FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
    /** Legacy Surfaces / catalog label for the Assignments card (runtime key stays `scheduling`). */
    scheduling: "scheduling",
    assignments: "scheduling",
};

export const FOCUS_PANEL_CARD_CATALOG: readonly FocusPanelCardCatalogEntry[] = [
    { label: "Why Now", cardKey: "attention" },
    { label: "Current Mission", cardKey: "current_mission" },
    { label: FOCUS_PANEL_WHATS_NEXT_LABEL, cardKey: FOCUS_PANEL_WHATS_NEXT_CARD_KEY },
    { label: "Enrollment Health", cardKey: "health" },
    { label: "Readiness", cardKey: "readiness_kpi" },
    { label: "Tour", cardKey: "tour_summary" },
    { label: "Household", cardKey: "household" },
    { label: "Children", cardKey: "children" },
    { label: "Employment", cardKey: "employment" },
    { label: "Milestones", cardKey: "milestones" },
    { label: "Assignments", cardKey: "scheduling" },
    { label: "Communications", cardKey: "communications" },
    { label: "Documents", cardKey: "documents" },
    { label: "Tasks", cardKey: "tasks" },
    { label: "Billing Preview", cardKey: "billing_preview" },
    { label: "KPI / Metric", cardKey: null, note: "Bind an Operational Intelligence metric — next phase" },
];

const CATALOG_LABEL_BY_KEY = new Map<FocusPanelCardKey, string>(
    FOCUS_PANEL_CARD_CATALOG.filter((e): e is FocusPanelCardCatalogEntry & { cardKey: FocusPanelCardKey } =>
        Boolean(e.cardKey),
    ).map((e) => [e.cardKey, e.label]),
);

function humanizeCardKey(key: FocusPanelCardKey): string {
    return key
        .split("_")
        .map((part) => (part.length ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(" ");
}

/** Operator-facing catalog label for a canonical card key (builder / search / reset). */
export function focusPanelCardCatalogLabel(key: FocusPanelCardKey): string {
    return CATALOG_LABEL_BY_KEY.get(key) ?? humanizeCardKey(key);
}

/**
 * Normalize a stored key, alias, or operator label to the canonical Focus Panel card key.
 *
 * Trace for What's Next:
 *   stored legacy key (`whats_next` / `current-work`) or label ("Current Work")
 *   → normalizeFocusPanelCardKey
 *   → canonical builder identity (`current_work` + "What's Next")
 *   → runtime identity (`current_work`, microLabel "What's Next")
 */
export function normalizeFocusPanelCardKey(raw: unknown): FocusPanelCardKey | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if ((FOCUS_PANEL_CARD_KEYS as readonly string[]).includes(trimmed)) {
        return trimmed as FocusPanelCardKey;
    }

    const lower = trimmed.toLowerCase();
    const fromKeyAlias = FOCUS_PANEL_CARD_KEY_ALIASES[lower];
    if (fromKeyAlias) return fromKeyAlias;

    const fromLabelAlias = FOCUS_PANEL_CARD_LABEL_ALIASES[lower];
    if (fromLabelAlias) return fromLabelAlias;

    const catalogHit = FOCUS_PANEL_CARD_CATALOG.find(
        (e) => e.cardKey && e.label.toLowerCase() === lower,
    );
    return catalogHit?.cardKey ?? null;
}

/** Search the catalog by operator label (includes legacy "Current Work"). */
export function findFocusPanelCatalogEntryByQuery(query: string): FocusPanelCardCatalogEntry | null {
    const key = normalizeFocusPanelCardKey(query);
    if (!key) {
        const q = query.trim().toLowerCase();
        if (!q) return null;
        return (
            FOCUS_PANEL_CARD_CATALOG.find(
                (e) => e.label.toLowerCase().includes(q) || (e.note?.toLowerCase().includes(q) ?? false),
            ) ?? null
        );
    }
    return FOCUS_PANEL_CARD_CATALOG.find((e) => e.cardKey === key) ?? null;
}
