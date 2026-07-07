/**
 * Process Summary card accent → Alloy token classes.
 *
 * Doctrine sources:
 * - docs/platform/commercial/ownership-model.md (Color token audit)
 * - docs/platform/modules/operational-intelligence-platform.md (domain accent mapping)
 * - web/app/globals.css (@theme canonical tokens)
 *
 * `pine` persisted key → Bend Pine (#00A283). NOT legacy `alloy-pine` (#273F52 Midnight Forge).
 * `blue` → Alloy Blue (#00458C) — distinct from Bend Pine. Legacy `juniper` normalizes to `blue`.
 */

import type { ProcessCardAccent } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

export type ProcessCardAccentStyle = {
    chip: string;
    rail: string;
    hover: string;
    cta: string;
    metricText: string;
    metricTint: string;
    statusChip?: string;
};

/** Operator-facing accent labels in the builder picker. */
export const PROCESS_CARD_ACCENT_LABELS: Record<ProcessCardAccent, string> = {
    pine: "Bend Pine",
    blue: "Alloy Blue",
    ember: "Ember",
    midnight: "Midnight Forge",
    stone: "River Stone",
    gold: "Alloy Gold",
};

export const PROCESS_CARD_ACCENT_STYLES: Record<ProcessCardAccent, ProcessCardAccentStyle> = {
    pine: {
        chip: "bg-alloy-bend-pine/10 text-alloy-bend-pine",
        rail: "border-l-alloy-bend-pine/80",
        hover: "hover:border-alloy-bend-pine/35 hover:shadow-[0_4px_14px_rgba(0,162,131,0.14)]",
        cta: "border-alloy-bend-pine/35 bg-alloy-bend-pine/10 text-alloy-bend-pine hover:border-alloy-bend-pine hover:bg-alloy-bend-pine hover:text-white focus-visible:outline-alloy-bend-pine",
        metricText: "text-alloy-bend-pine",
        metricTint: "bg-alloy-bend-pine/[0.06]",
        statusChip: "bg-alloy-bend-pine/[0.06] text-alloy-bend-pine",
    },
    blue: {
        chip: "bg-alloy-blue/10 text-alloy-blue",
        rail: "border-l-alloy-blue/75",
        hover: "hover:border-alloy-blue/30 hover:shadow-[0_4px_14px_rgba(0,69,140,0.12)]",
        cta: "border-alloy-blue/35 bg-alloy-blue/10 text-alloy-blue hover:border-alloy-blue hover:bg-alloy-blue hover:text-white focus-visible:outline-alloy-blue",
        metricText: "text-alloy-blue",
        metricTint: "bg-alloy-blue/[0.06]",
        statusChip: "bg-alloy-blue/[0.06] text-alloy-blue",
    },
    ember: {
        chip: "bg-alloy-ember/10 text-alloy-ember",
        rail: "border-l-alloy-ember/80",
        hover: "hover:border-alloy-ember/35 hover:shadow-[0_4px_14px_rgba(188,67,0,0.14)]",
        cta: "border-alloy-ember/35 bg-alloy-ember/10 text-alloy-ember hover:border-alloy-ember hover:bg-alloy-ember hover:text-white focus-visible:outline-alloy-ember",
        metricText: "text-alloy-ember",
        metricTint: "bg-alloy-ember/[0.06]",
        statusChip: "bg-alloy-ember/[0.06] text-alloy-ember",
    },
    midnight: {
        chip: "bg-alloy-midnight-forge/10 text-alloy-midnight-forge",
        rail: "border-l-alloy-midnight-forge/70",
        hover: "hover:border-alloy-midnight-forge/30 hover:shadow-[0_4px_14px_rgba(39,63,82,0.12)]",
        cta: "border-alloy-midnight-forge/30 bg-alloy-midnight-forge/[0.06] text-alloy-midnight-forge hover:border-alloy-midnight-forge hover:bg-alloy-midnight-forge hover:text-white focus-visible:outline-alloy-midnight-forge",
        metricText: "text-alloy-midnight-forge",
        metricTint: "bg-alloy-midnight-forge/[0.06]",
        statusChip: "bg-alloy-midnight-forge/[0.06] text-alloy-midnight-forge",
    },
    stone: {
        chip: "bg-alloy-stone text-alloy-midnight/65",
        rail: "border-l-alloy-stone",
        hover: "hover:border-alloy-midnight/20 hover:shadow-[0_4px_14px_rgba(120,113,108,0.10)]",
        cta: "border-alloy-midnight/20 bg-alloy-stone text-alloy-midnight/70 hover:border-alloy-midnight/40 hover:bg-alloy-midnight hover:text-white focus-visible:outline-alloy-midnight",
        metricText: "text-alloy-midnight/70",
        metricTint: "bg-alloy-stone/70",
        statusChip: "bg-alloy-stone text-alloy-midnight/55",
    },
    gold: {
        chip: "bg-alloy-gold/25 text-alloy-gold-dark",
        rail: "border-l-alloy-gold-dark/70",
        hover: "hover:border-alloy-gold-dark/35 hover:shadow-[0_4px_14px_rgba(208,173,80,0.14)]",
        cta: "border-alloy-gold-dark/40 bg-alloy-gold/20 text-alloy-gold-dark hover:border-alloy-gold-dark hover:bg-alloy-gold-dark hover:text-white focus-visible:outline-alloy-gold-dark",
        metricText: "text-alloy-gold-dark",
        metricTint: "bg-alloy-gold/20",
        statusChip: "bg-alloy-gold/20 text-alloy-gold-dark",
    },
};

/** Status-derived icon color when KPI accent is Auto (from calculation health). */
const STATUS_KPI_ICON: Record<string, string> = {
    healthy: "text-alloy-bend-pine",
    warning: "text-alloy-gold",
    critical: "text-alloy-ember",
    unknown: "text-alloy-midnight/40",
};

/**
 * Workspace Header KPI icon color — matches accent when configured, else status color.
 * Shared by builder preview and `/workspace` runtime (`WorkspaceHeader`).
 */
export function workspaceHeaderKpiIconClass(args: {
    accent: ProcessCardAccent | null;
    status: string;
}): string {
    if (args.accent && args.accent in PROCESS_CARD_ACCENT_STYLES) {
        return PROCESS_CARD_ACCENT_STYLES[args.accent].metricText;
    }
    return STATUS_KPI_ICON[args.status] ?? STATUS_KPI_ICON.unknown;
}

/**
 * Soft icon-well background per accent — the tint that sits BEHIND a KPI glyph. Reuses each
 * accent's existing `metricTint` (Alloy token at low alpha) so no new colors enter the palette.
 */
const STATUS_KPI_ICON_WELL: Record<string, string> = {
    healthy: "bg-alloy-bend-pine/[0.08]",
    warning: "bg-alloy-gold/20",
    critical: "bg-alloy-ember/[0.08]",
    unknown: "bg-alloy-midnight/[0.05]",
};

/**
 * Workspace Header KPI icon-well tint — matches accent when configured, else status color.
 * Pure Alloy tokens (accent `metricTint` / status low-alpha). Shared by builder + runtime.
 */
export function workspaceHeaderKpiIconWellClass(args: {
    accent: ProcessCardAccent | null;
    status: string;
}): string {
    if (args.accent && args.accent in PROCESS_CARD_ACCENT_STYLES) {
        return PROCESS_CARD_ACCENT_STYLES[args.accent].metricTint;
    }
    return STATUS_KPI_ICON_WELL[args.status] ?? STATUS_KPI_ICON_WELL.unknown;
}

/** Faint top accent on process tiles — identity without a colored body fill. */
export function processTileAccentTopBorder(accent: ProcessCardAccent | null | undefined): string {
    if (!accent || !(accent in PROCESS_CARD_ACCENT_STYLES)) return "";
    const top: Record<ProcessCardAccent, string> = {
        pine: "border-t-2 border-t-alloy-bend-pine/35",
        blue: "border-t-2 border-t-alloy-blue/30",
        ember: "border-t-2 border-t-alloy-ember/35",
        midnight: "border-t-2 border-t-alloy-midnight-forge/25",
        stone: "border-t-2 border-t-alloy-stone/60",
        gold: "border-t-2 border-t-alloy-gold-dark/35",
    };
    return top[accent];
}

/** Process tile resting + hover accent border — quiet identity reinforcement. */
export function processTileAccentBorderHover(accent: ProcessCardAccent | null | undefined): string {
    if (!accent || !(accent in PROCESS_CARD_ACCENT_STYLES)) return "";
    const hover: Record<ProcessCardAccent, string> = {
        pine: "hover:border-alloy-bend-pine/25",
        blue: "hover:border-alloy-blue/22",
        ember: "hover:border-alloy-ember/25",
        midnight: "hover:border-alloy-midnight-forge/20",
        stone: "hover:border-alloy-stone/45",
        gold: "hover:border-alloy-gold-dark/28",
    };
    return hover[accent];
}

/** Work View row icon well — process accent tint. */
export function workViewRowIconWellClass(accent: ProcessCardAccent | null | undefined): string {
    return processTileIdentityWellClass(accent);
}

/** Work View row icon glyph color from process accent. */
export function workViewRowIconClass(accent: ProcessCardAccent | null | undefined): string {
    if (accent && accent in PROCESS_CARD_ACCENT_STYLES) {
        return PROCESS_CARD_ACCENT_STYLES[accent].metricText;
    }
    return "text-alloy-midnight/45";
}

/** Work View row icon well hover — deepens accent tint on row hover. */
export function workViewRowIconWellHoverClass(accent: ProcessCardAccent | null | undefined): string {
    if (!accent || !(accent in PROCESS_CARD_ACCENT_STYLES)) {
        return "group-hover/row:bg-alloy-midnight/[0.07]";
    }
    const hover: Record<ProcessCardAccent, string> = {
        pine: "group-hover/row:bg-alloy-bend-pine/14",
        blue: "group-hover/row:bg-alloy-blue/14",
        ember: "group-hover/row:bg-alloy-ember/12",
        midnight: "group-hover/row:bg-alloy-midnight-forge/10",
        stone: "group-hover/row:bg-alloy-stone/40",
        gold: "group-hover/row:bg-alloy-gold/18",
    };
    return hover[accent];
}

/** Work View row hover — left accent rail + soft wash (no solid fill). */
export function workViewRowHoverClass(accent: ProcessCardAccent | null | undefined): string {
    if (!accent || !(accent in PROCESS_CARD_ACCENT_STYLES)) {
        return "hover:border-l-alloy-midnight/20 hover:bg-alloy-midnight/[0.04]";
    }
    const hover: Record<ProcessCardAccent, string> = {
        pine: "hover:border-l-alloy-bend-pine/55 hover:bg-alloy-bend-pine/[0.06]",
        blue: "hover:border-l-alloy-blue/50 hover:bg-alloy-blue/[0.06]",
        ember: "hover:border-l-alloy-ember/55 hover:bg-alloy-ember/[0.05]",
        midnight: "hover:border-l-alloy-midnight-forge/35 hover:bg-alloy-midnight-forge/[0.04]",
        stone: "hover:border-l-alloy-stone/55 hover:bg-alloy-stone/35",
        gold: "hover:border-l-alloy-gold-dark/45 hover:bg-alloy-gold/[0.14]",
    };
    return `border-l-2 border-l-transparent ${hover[accent]}`;
}

/** Process identity icon well — richer tint when accent is configured. */
export function processTileIdentityWellClass(accent: ProcessCardAccent | null | undefined): string {
    if (accent && accent in PROCESS_CARD_ACCENT_STYLES) {
        return PROCESS_CARD_ACCENT_STYLES[accent].metricTint;
    }
    return "bg-alloy-midnight/[0.04]";
}

/** Legacy persisted accent keys → current closed palette. */
export function normalizeProcessCardAccent(raw: unknown): ProcessCardAccent | undefined {
    if (typeof raw !== "string" || !raw.trim()) return undefined;
    const key = raw.trim();
    if (key === "juniper" || key === "firewood") return key === "juniper" ? "blue" : "ember";
    if (key in PROCESS_CARD_ACCENT_STYLES) return key as ProcessCardAccent;
    return undefined;
}
