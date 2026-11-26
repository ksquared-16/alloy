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
import { normalizeProcessCardAccent } from "@/lib/presentation/runtime/processCardAccentStyles";

export type TodaysWorkSort =
    /** Records needing attention first (then overdue, then count) — the operational default. */
    | "attention"
    /** Highest lane count first. */
    | "count"
    /** Keep the configured work_views_v1 order. */
    | "configured";

/**
 * Presentation-only layout for the primary + supporting metric block. Both modes render the
 * SAME configured calculations + labels — no calculation logic, no new metric.
 *   inline  — primary value+label beside supporting value+label (`25 Families • 42 Children`).
 *   stacked — primary value+label above the supporting value+label, primary visually dominant.
 * Absent → `inline` (the current runtime default).
 */
export const PROCESS_METRIC_PRESENTATIONS = ["inline", "stacked"] as const;
export type ProcessMetricPresentation = (typeof PROCESS_METRIC_PRESENTATIONS)[number];

export function normalizeProcessMetricPresentation(
    raw: unknown,
): ProcessMetricPresentation | undefined {
    if (typeof raw !== "string") return undefined;
    const key = raw.trim();
    return (PROCESS_METRIC_PRESENTATIONS as readonly string[]).includes(key)
        ? (key as ProcessMetricPresentation)
        : undefined;
}

/**
 * Identity accents an operator may assign to a process card. A CLOSED set mapped to existing
 * Alloy tokens only (no new colors). Applied to the card's IDENTITY chip — never the semantic
 * state rail, which stays owned by the operational signal.
 */
export const PROCESS_CARD_ACCENTS = ["pine", "blue", "ember", "midnight", "stone", "gold"] as const;
export type ProcessCardAccent = (typeof PROCESS_CARD_ACCENTS)[number];

/** Generic identity glyphs — domain-neutral labels in the builder. */
export const PROCESS_CARD_ICONS = [
    "grid",
    "spark",
    "route",
    "users",
    "calendar",
    "clipboard",
    "chart",
    "message",
    "shield",
    "book",
    "bolt",
    "layers",
] as const;
export type ProcessCardIcon = (typeof PROCESS_CARD_ICONS)[number];

export const PROCESS_CARD_ICON_LABELS: Record<ProcessCardIcon, string> = {
    grid: "Grid",
    spark: "Spark",
    route: "Route",
    users: "Users",
    calendar: "Calendar",
    clipboard: "Clipboard",
    chart: "Chart",
    message: "Message",
    shield: "Shield",
    book: "Book",
    bolt: "Bolt",
    layers: "Layers",
};

const LEGACY_PROCESS_CARD_ICONS: Record<string, ProcessCardIcon> = {
    generic: "grid",
    leads: "users",
    enrollment: "route",
    billing: "chart",
    roster: "users",
    tour: "calendar",
    waitlist: "clipboard",
};

export function normalizeProcessCardIcon(raw: unknown): ProcessCardIcon | undefined {
    if (typeof raw !== "string" || !raw.trim()) return undefined;
    const key = raw.trim();
    if ((PROCESS_CARD_ICONS as readonly string[]).includes(key)) return key as ProcessCardIcon;
    return LEGACY_PROCESS_CARD_ICONS[key];
}

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
    /** Presentation label for the primary signal metric; blank → calculation registry label. */
    primarySignalLabel?: string;
    /** Presentation label for the supporting signal metric; blank → calculation registry label. */
    supportingSignalLabel?: string;
    /** Inline vs stacked layout for the primary + supporting metric block. Absent → inline. */
    metricPresentation?: ProcessMetricPresentation;
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
    /**
     * Per-Work-View row glyph, keyed by the Work View id (the nav entry's `work_view_id`, falling
     * back to its `platformKey` for stage-backed lanes). Assigned in the Surface Builder; the Work
     * View OWNS its icon. Absent key → the row renders the neutral fallback glyph. Never keyed by a
     * stage/view NAME — no hardcoded Enrollment icons.
     */
    workViewIconById: Record<string, ProcessCardIcon>;
    /**
     * Lifecycle catalog ids (`departmentId:processId`) with an authored Workspace Process Summary.
     * When absent, the Surfaces UI bootstraps a single visible catalog process (Enrollment-only orgs).
     */
    summaryCatalogIds?: string[];
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
    workViewIconById: {},
    todaysWork: {
        visible: true,
        maxRows: 0,
        // The operator ORDERED their Work Views. Respecting that is the default; attention-first is a
        // choice they make, not one made for them. This was `"attention"`, and because the parser
        // coerced an ABSENT sort to the same value, every surface published before this field existed
        // was attention-sorted having never chosen it — which reads as the tile ignoring configured
        // order rather than as a setting. An EXPLICIT `"attention"` is untouched by this change.
        sort: "configured",
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
    if (typeof v.accent === "string") {
        const accent = normalizeProcessCardAccent(v.accent);
        if (accent) out.accent = accent;
    }
    const icon = normalizeProcessCardIcon(v.icon);
    if (icon) out.icon = icon;
    const supportingSignalKey = trimmedOrUndefined(v.supportingSignalKey);
    if (supportingSignalKey) out.supportingSignalKey = supportingSignalKey;
    const ctaLabel = trimmedOrUndefined(v.ctaLabel);
    if (ctaLabel) out.ctaLabel = ctaLabel;
    const primarySignalLabel = trimmedOrUndefined(v.primarySignalLabel);
    if (primarySignalLabel) out.primarySignalLabel = primarySignalLabel;
    const supportingSignalLabel = trimmedOrUndefined(v.supportingSignalLabel);
    if (supportingSignalLabel) out.supportingSignalLabel = supportingSignalLabel;
    const metricPresentation = normalizeProcessMetricPresentation(v.metricPresentation);
    if (metricPresentation) out.metricPresentation = metricPresentation;
    // Drop an override that carries nothing (all fields empty/invalid).
    return Object.keys(out).length ? out : null;
}

/** Record<workViewId, ProcessCardIcon>, dropping empty keys and non-vocabulary icons. */
function normalizeWorkViewIconMap(value: unknown): Record<string, ProcessCardIcon> {
    if (!value || typeof value !== "object") return {};
    const out: Record<string, ProcessCardIcon> = {};
    for (const [k, raw] of Object.entries(value as Record<string, unknown>)) {
        const key = k.trim();
        if (!key) continue;
        const icon = normalizeProcessCardIcon(raw);
        if (icon) out[key] = icon;
    }
    return out;
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
    const workViewIconById = normalizeWorkViewIconMap(v.workViewIconById);
    const summaryCatalogIds = Array.isArray(v.summaryCatalogIds)
        ? v.summaryCatalogIds.filter((id): id is string => typeof id === "string" && id.includes(":"))
        : undefined;
    const tw = v.todaysWork;
    if (!tw || typeof tw !== "object") {
        return {
            ...d,
            primarySignalByProcess,
            cardByProcess,
            workViewIconById,
            ...(summaryCatalogIds?.length ? { summaryCatalogIds } : {}),
        };
    }
    const t = tw as Record<string, unknown>;
    // EVERY recognized mode is preserved, including an explicit `"attention"` — a surface that chose
    // attention-first keeps it. Only an absent or unrecognized value falls to the default, and that
    // default is now the operator's configured order. Previously this branch could not tell "chose
    // attention" from "said nothing", and answered both with attention.
    const sort: TodaysWorkSort =
        t.sort === "count" || t.sort === "configured" || t.sort === "attention"
            ? t.sort
            : d.todaysWork.sort;
    const maxRows =
        typeof t.maxRows === "number" && Number.isFinite(t.maxRows) && t.maxRows >= 0
            ? Math.floor(t.maxRows)
            : d.todaysWork.maxRows;
    return {
        version: 1,
        primarySignalByProcess,
        cardByProcess,
        workViewIconById,
        ...(summaryCatalogIds?.length ? { summaryCatalogIds } : {}),
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
    /** Primary signal metric title override, or null → registry label. */
    primarySignalLabel: string | null;
    /** Supporting signal metric title override, or null → registry label. */
    supportingSignalLabel: string | null;
    /** Metric block layout — always resolved ("inline" default). */
    metricPresentation: ProcessMetricPresentation;
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
        icon: card?.icon ?? "grid",
        supportingSignalKey: card?.supportingSignalKey?.trim() || null,
        ctaLabel: card?.ctaLabel?.trim() || null,
        primarySignalLabel: card?.primarySignalLabel?.trim() || null,
        supportingSignalLabel: card?.supportingSignalLabel?.trim() || null,
        metricPresentation: card?.metricPresentation ?? "inline",
    };
}

/**
 * Resolve the configured glyph for a Work View row. Prefers the `work_view_id` assignment, then
 * the lane's `platformKey` (stage-backed lanes). Null → the row renders the neutral fallback glyph.
 * Pure — the runtime maps rows through this so tile + builder agree on the icon.
 */
export function resolveWorkViewIcon(
    config: WorkspaceProcessSurfaceConfig,
    ids: { workViewId?: string | null; platformKey?: string | null },
): ProcessCardIcon | null {
    const map = config.workViewIconById ?? {};
    const viewKey = ids.workViewId?.trim();
    if (viewKey && map[viewKey]) return map[viewKey];
    const laneKey = ids.platformKey?.trim();
    if (laneKey && map[laneKey]) return map[laneKey];
    return null;
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
