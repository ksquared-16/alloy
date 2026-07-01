/**
 * Focus Panel ↔ LayoutDoc mapping model (Enrollment Summary vertical slice).
 *
 * Presentation Runtime primitives map onto the existing `LayoutDoc` schema so the
 * slice adds ZERO new storage types:
 *   - Design Surface (Focus Panel Summary) → one `entity_layouts` row (`LayoutDoc`)
 *   - Card                                 → `LayoutSection` (key = card key)
 *   - Slot                                 → `LayoutItem` (added in the configure phase)
 *
 * Phase 1 (read path + parity) reads CARD-level presentation metadata from each
 * section to reconstruct the Focus Panel grid. Slot-level (item) binding arrives
 * in the configure phase; sections may carry empty `rows` until then.
 *
 * Storage decision (approved): reuse `surface = 'drawer'` with a dedicated
 * `layout_key = 'focus_panel_summary'`. No migration; no new `surface` enum.
 */

import type {
    FocusPanelCardDensity,
    FocusPanelCardSpan,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import {
    FOCUS_PANEL_CARD_KEYS,
    FOCUS_PANEL_CARD_TIERS,
    type FocusPanelCardKey,
    type FocusPanelCardTier,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { isFocusPanelCardConfigEmpty } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import type { LayoutSection } from "@/lib/layout/layoutV2";

/** Reused storage identity for the Focus Panel Summary design surface. */
export const FOCUS_PANEL_SUMMARY_ENTITY_TYPE = "opportunities" as const;
export const FOCUS_PANEL_SUMMARY_SURFACE = "drawer" as const;
export const FOCUS_PANEL_SUMMARY_LAYOUT_KEY = "focus_panel_summary" as const;

/** Section metadata key carrying Focus Panel card presentation. */
export const FOCUS_PANEL_CARD_METADATA_KEY = "focusPanelCard" as const;
/** Section metadata key carrying the per-card content/appearance config. */
export const FOCUS_PANEL_CARD_CONFIG_KEY = "focusPanelCardConfig" as const;

/** Card-level presentation persisted on a `LayoutSection.metadata`. */
export type FocusPanelCardSectionMeta = {
    key: FocusPanelCardKey;
    /**
     * Stable per-instance id. Card TYPES are platform-owned; INSTANCES are what an
     * operator places (so the same type can be duplicated). Absent → equals `key`
     * for backward compatibility with the code-built default (one instance/type).
     */
    instanceId?: string;
    span: FocusPanelCardSpan;
    density: FocusPanelCardDensity;
    tier: FocusPanelCardTier;
    /** Grid row index (0-based) used to reconstruct the responsive grid. */
    gridRow: number;
    /** Optional per-card content/appearance config (Inspector output). */
    config?: FocusPanelCardConfig;
};

const FOCUS_PANEL_CARD_SPANS: readonly FocusPanelCardSpan[] = [1, 2, "row"];
const FOCUS_PANEL_CARD_DENSITIES: readonly FocusPanelCardDensity[] = [
    "micro",
    "compact",
    "standard",
    "expanded",
];

function isFocusPanelCardKey(v: unknown): v is FocusPanelCardKey {
    return typeof v === "string" && (FOCUS_PANEL_CARD_KEYS as readonly string[]).includes(v);
}

function isFocusPanelCardSpan(v: unknown): v is FocusPanelCardSpan {
    return v === 1 || v === 2 || v === "row";
}

function isFocusPanelCardDensity(v: unknown): v is FocusPanelCardDensity {
    return typeof v === "string" && (FOCUS_PANEL_CARD_DENSITIES as readonly string[]).includes(v);
}

function isFocusPanelCardTier(v: unknown): v is FocusPanelCardTier {
    return typeof v === "string" && (FOCUS_PANEL_CARD_TIERS as readonly string[]).includes(v);
}

/**
 * Read + validate Focus Panel card presentation from a section. Returns `null`
 * for any section that is not a well-formed Focus Panel card (defensive: an
 * unknown/legacy section is skipped rather than corrupting the grid).
 */
export function readFocusPanelCardSectionMeta(
    section: LayoutSection,
): FocusPanelCardSectionMeta | null {
    const raw = section.metadata?.[FOCUS_PANEL_CARD_METADATA_KEY];
    if (!raw || typeof raw !== "object") return null;
    const meta = raw as Record<string, unknown>;

    const key = meta.key;
    const span = meta.span;
    const density = meta.density;
    const tier = meta.tier;
    const gridRow = meta.gridRow;

    if (!isFocusPanelCardKey(key)) return null;
    if (!isFocusPanelCardSpan(span)) return null;
    if (!isFocusPanelCardDensity(density)) return null;
    if (!isFocusPanelCardTier(tier)) return null;
    if (typeof gridRow !== "number" || !Number.isFinite(gridRow) || gridRow < 0) return null;

    const instanceId = typeof meta.instanceId === "string" && meta.instanceId.trim() ? meta.instanceId : key;
    const config = readFocusPanelCardConfig(section);

    return {
        key,
        instanceId,
        span,
        density,
        tier,
        gridRow: Math.trunc(gridRow),
        ...(config ? { config } : {}),
    };
}

/**
 * Read the per-card content/appearance config from a section. Config is stored
 * opaquely (structured Inspector output); we accept any well-formed object and
 * let downstream consumers validate field-by-field. Returns `null` when absent.
 */
export function readFocusPanelCardConfig(section: LayoutSection): FocusPanelCardConfig | null {
    const raw = section.metadata?.[FOCUS_PANEL_CARD_CONFIG_KEY];
    if (!raw || typeof raw !== "object") return null;
    return raw as FocusPanelCardConfig;
}

function humanizeCardKey(key: FocusPanelCardKey): string {
    return key
        .split("_")
        .map((part) => (part.length ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(" ");
}

/**
 * Build a `LayoutSection` for one Focus Panel card. `rows` is empty in Phase 1
 * (read path); slot items are added in the configure phase. `title` is cosmetic
 * — the live grid renders card models, which carry their own titles.
 */
export function buildFocusPanelCardSection(meta: FocusPanelCardSectionMeta): LayoutSection {
    const instanceId = meta.instanceId && meta.instanceId.trim() ? meta.instanceId : meta.key;
    const persistConfig = !isFocusPanelCardConfigEmpty(meta.config);
    return {
        id: `fp-card-${instanceId}`,
        key: meta.key,
        title: humanizeCardKey(meta.key),
        rows: [],
        metadata: {
            [FOCUS_PANEL_CARD_METADATA_KEY]: {
                key: meta.key,
                instanceId,
                span: meta.span,
                density: meta.density,
                tier: meta.tier,
                gridRow: meta.gridRow,
            },
            ...(persistConfig ? { [FOCUS_PANEL_CARD_CONFIG_KEY]: meta.config } : {}),
        },
    };
}
