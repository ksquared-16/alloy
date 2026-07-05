/**
 * Presentation Runtime V2 — Workspace Process Surface config (pure).
 *
 * The Workspace Process Surface is ONE template the runtime repeats per configured
 * business process (ProcessSummaryCard). The card grammar is fixed —
 *   Identity → Operational Answer → Evidence → Today's Work → CTA
 * — and its CONTENT is live runtime data (ProcessTileModel). The only thing an operator
 * configures is the BEHAVIOR of the Today's Work section: whether it shows, how many rows,
 * the row order, and whether counts render. This module is that config + the pure function
 * the runtime applies to the live work-view list.
 *
 * Persistence: `entity_layouts` (surface="workspace", entityType="workspace",
 * layoutKey="workspace_processes") with the config in `doc.metadata.workspaceProcessSurface`.
 */

import type { WorkViewLinkModel } from "@/lib/presentation/runtime/types";

export type TodaysWorkSort =
    /** Records needing attention first (then overdue, then count) — the operational default. */
    | "attention"
    /** Highest lane count first. */
    | "count"
    /** Keep the configured work_views_v1 order. */
    | "configured";

/**
 * Identity accents an operator may assign to a process card. A CLOSED set mapped to existing
 * Alloy tokens only (no new colors). Applied to the card's IDENTITY chip — never the semantic
 * state rail, which stays owned by the operational signal.
 */
export const PROCESS_CARD_ACCENTS = ["pine", "juniper", "ember", "firewood", "midnight", "stone"] as const;
export type ProcessCardAccent = (typeof PROCESS_CARD_ACCENTS)[number];

/** Identity glyph vocabulary — CLOSED set (no arbitrary strings; the card maps each to an inline icon). */
export const PROCESS_CARD_ICONS = ["leads", "enrollment", "billing", "roster", "tour", "waitlist", "generic"] as const;
export type ProcessCardIcon = (typeof PROCESS_CARD_ICONS)[number];

/**
 * Per-process card identity + presentation an operator owns in the Surface Builder. Every field is
 * optional; absent → the runtime default (process label / description / neutral identity / canonical
 * CTA). The card GRAMMAR stays fixed and domain-neutral — this configures content, not layout.
 */
export type ProcessCardConfig = {
    /** Title override; blank → the runtime process label. */
    title?: string;
    /** One-line subtitle; blank → the runtime process description. */
    subtitle?: string;
    /** Identity accent (Alloy token). Absent → neutral identity (no accent). */
    accent?: ProcessCardAccent;
    /** Identity glyph (closed vocabulary). Absent → "generic". */
    icon?: ProcessCardIcon;
    /** A SECOND Operational Calculation key, rendered as a text-only supporting line. Blank → none. */
    supportingSignalKey?: string;
    /** CTA label override; the TARGET stays canonical (the signal drill / process entry). Blank → default. */
    ctaLabel?: string;
};

export type WorkspaceProcessSurfaceConfig = {
    version: 1;
    /**
     * The Primary Signal each process presents — a selected Operational Calculation key,
     * keyed by the process's business process (internal binding: the
     * `primaryOperationalAnswerKey`). Surface Builder chooses WHICH signal; it does not
     * configure the calculation. Absent → the runtime uses the registry default for the
     * process (never a hardcoded health metric).
     */
    primarySignalByProcess: Record<string, string>;
    /**
     * Per-process card identity + presentation overrides, keyed by business process (the SAME key
     * as `primarySignalByProcess` — one keying scheme). Absent entry → all runtime defaults.
     */
    cardByProcess: Record<string, ProcessCardConfig>;
    todaysWork: {
        /** Show the Today's Work section on each process card. */
        visible: boolean;
        /** Max work-view rows per card; 0 = show all. */
        maxRows: number;
        /** Row ordering behavior. */
        sort: TodaysWorkSort;
        /** Render the per-view count badge. */
        showCounts: boolean;
    };
};

export const DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG: WorkspaceProcessSurfaceConfig = {
    version: 1,
    primarySignalByProcess: {},
    cardByProcess: {},
    todaysWork: {
        visible: true,
        maxRows: 0,
        sort: "attention",
        showCounts: true,
    },
};

/** String→string record of process → calculation key, ignoring non-string entries. */
function normalizePrimarySignalMap(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
}

function trimmedOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Coerce one persisted card override, dropping empties and clamping enums to their closed sets. */
function normalizeProcessCardConfig(value: unknown): ProcessCardConfig | null {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const out: ProcessCardConfig = {};
    const title = trimmedOrUndefined(v.title);
    if (title) out.title = title;
    const subtitle = trimmedOrUndefined(v.subtitle);
    if (subtitle) out.subtitle = subtitle;
    if (typeof v.accent === "string" && (PROCESS_CARD_ACCENTS as readonly string[]).includes(v.accent)) {
        out.accent = v.accent as ProcessCardAccent;
    }
    if (typeof v.icon === "string" && (PROCESS_CARD_ICONS as readonly string[]).includes(v.icon)) {
        out.icon = v.icon as ProcessCardIcon;
    }
    const supportingSignalKey = trimmedOrUndefined(v.supportingSignalKey);
    if (supportingSignalKey) out.supportingSignalKey = supportingSignalKey;
    const ctaLabel = trimmedOrUndefined(v.ctaLabel);
    if (ctaLabel) out.ctaLabel = ctaLabel;
    // Drop an override that carries nothing (all fields empty/invalid).
    return Object.keys(out).length ? out : null;
}

/** Record<businessProcess, ProcessCardConfig>, ignoring empty/invalid entries. */
function normalizeCardByProcessMap(value: unknown): Record<string, ProcessCardConfig> {
    if (!value || typeof value !== "object") return {};
    const out: Record<string, ProcessCardConfig> = {};
    for (const [k, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!k.trim()) continue;
        const card = normalizeProcessCardConfig(raw);
        if (card) out[k] = card;
    }
    return out;
}

/** Coerce an unknown persisted value into a valid config (defaults fill any gaps). */
export function normalizeWorkspaceProcessSurfaceConfig(value: unknown): WorkspaceProcessSurfaceConfig {
    const d = DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG;
    if (!value || typeof value !== "object") return d;
    const v = value as Record<string, unknown>;
    const primarySignalByProcess = normalizePrimarySignalMap(v.primarySignalByProcess);
    const cardByProcess = normalizeCardByProcessMap(v.cardByProcess);
    const tw = v.todaysWork;
    if (!tw || typeof tw !== "object") {
        return { ...d, primarySignalByProcess, cardByProcess };
    }
    const t = tw as Record<string, unknown>;
    const sort: TodaysWorkSort =
        t.sort === "count" || t.sort === "configured" ? t.sort : "attention";
    const maxRows =
        typeof t.maxRows === "number" && Number.isFinite(t.maxRows) && t.maxRows >= 0
            ? Math.floor(t.maxRows)
            : d.todaysWork.maxRows;
    return {
        version: 1,
        primarySignalByProcess,
        cardByProcess,
        todaysWork: {
            visible: typeof t.visible === "boolean" ? t.visible : d.todaysWork.visible,
            maxRows,
            sort,
            showCounts: typeof t.showCounts === "boolean" ? t.showCounts : d.todaysWork.showCounts,
        },
    };
}

/** The card's identity/presentation after overrides — every field resolved to a safe default. */
export type ResolvedProcessCardIdentity = {
    /** Title override, or null → the card falls back to the runtime process label. */
    title: string | null;
    /** Subtitle override, or null → the card falls back to the runtime description. */
    subtitle: string | null;
    /** Identity accent (Alloy token) or null (neutral identity). */
    accent: ProcessCardAccent | null;
    /** Identity glyph — always resolved ("generic" default). */
    icon: ProcessCardIcon;
    /** A second Operational Calculation key to resolve as a supporting line, or null. */
    supportingSignalKey: string | null;
    /** CTA label override, or null → the card's default CTA label. */
    ctaLabel: string | null;
};

/**
 * Resolve the card identity for a process (keyed by its business process). Pure — the runtime and
 * the card both read overrides through this so their notion of "what the operator configured" agrees.
 */
export function resolveProcessCardConfig(
    config: WorkspaceProcessSurfaceConfig,
    processConfigKey: string | null | undefined,
): ResolvedProcessCardIdentity {
    const map = config.cardByProcess ?? {};
    const card = processConfigKey ? map[processConfigKey] : undefined;
    return {
        title: card?.title?.trim() || null,
        subtitle: card?.subtitle?.trim() || null,
        accent: card?.accent ?? null,
        icon: card?.icon ?? "generic",
        supportingSignalKey: card?.supportingSignalKey?.trim() || null,
        ctaLabel: card?.ctaLabel?.trim() || null,
    };
}

function positive(n: number | null | undefined): number {
    return typeof n === "number" && n > 0 ? n : 0;
}

/**
 * Apply the Today's Work behavior config to a process's live work-view rows. Pure: sorts
 * (stable) and truncates per the config; visibility:false → empty. Never fabricates rows or
 * counts — it only orders and slices what the runtime already resolved.
 */
export function applyTodaysWorkConfig(
    workViews: readonly WorkViewLinkModel[],
    config: WorkspaceProcessSurfaceConfig,
): WorkViewLinkModel[] {
    const { visible, maxRows, sort } = config.todaysWork;
    if (!visible) return [];

    const indexed = workViews.map((view, index) => ({ view, index }));
    if (sort === "attention") {
        indexed.sort((a, b) => {
            const aScore = positive(a.view.attentionCount) * 1_000_000 + positive(a.view.overdueCount) * 1_000 + positive(a.view.count);
            const bScore = positive(b.view.attentionCount) * 1_000_000 + positive(b.view.overdueCount) * 1_000 + positive(b.view.count);
            if (aScore !== bScore) return bScore - aScore;
            return a.index - b.index; // stable within equal scores
        });
    } else if (sort === "count") {
        indexed.sort((a, b) => {
            const diff = positive(b.view.count) - positive(a.view.count);
            return diff !== 0 ? diff : a.index - b.index;
        });
    }
    // "configured" → keep original order (indexed is already in order).

    const ordered = indexed.map((e) => e.view);
    return maxRows > 0 ? ordered.slice(0, maxRows) : ordered;
}
