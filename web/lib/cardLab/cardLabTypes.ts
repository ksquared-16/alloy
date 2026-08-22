/**
 * Card Lab — shared presentation vocabulary for the five specified cards.
 *
 * These mirror the platform's existing card vocabulary (`FocusPanelCardTier`,
 * `FocusPanelCardArchetype`, `UniversalCardProps["statusTone"]`) without importing the
 * production card-key union, so nothing here can leak into a registered surface.
 *
 * @see docs/platform/operator/operational-card-system-expansion.md
 */

/** The five specified cards. NOT `FocusPanelCardKey` — deliberately a separate union. */
export const CARD_LAB_KEYS = [
    "process_journey",
    "health_safety",
    "staff",
    "attendance",
    "billing",
] as const;

export type CardLabKey = (typeof CARD_LAB_KEYS)[number];

/** Handoff target — a production card key, expressed as a plain string on purpose. */
export type CardLabHandoff = string | null;

export type CardLabStatusTone = "ready" | "blocked" | "at-risk" | "due" | "done" | "neutral";

/**
 * The three answer postures every specified card must be able to hold.
 *
 * `unresolved` is the one the platform keeps re-learning: no authoritative source has spoken.
 * It is NOT `empty` (a source spoke and there is nothing) and it must never produce a verdict.
 * @see buildBillingPreviewCardEvidence — "unresolved must never fabricate business truth"
 */
export type CardLabResolution = "settled" | "unresolved" | "empty";

export type CardLabEvidenceBase = {
    answerLine: string;
    supportingLine: string | null;
    statusChip: string | null;
    statusTone: CardLabStatusTone;
    resolution: CardLabResolution;
};

export function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}
