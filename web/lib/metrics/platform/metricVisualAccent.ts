/**
 * Canonical accent palette for metric-platform visualizations.
 *
 * The operator picks a *color* (not a business meaning). These tokens drive the
 * swatch in the builder AND the rendered KPI/trend/comparison card accent rail so
 * the choice is visible on every surface (OI, workspace header, work unit, BP tile).
 */

export type MetricVisualAccentKey =
    | "enrollment"
    | "operational"
    | "forms"
    | "communications"
    | "amber"
    | "critical"
    | "neutral";

export type MetricVisualAccent = {
    key: MetricVisualAccentKey;
    /** User-facing color name (color-first, not purpose-first). */
    label: string;
    /** Solid swatch background for pickers. */
    swatch: string;
    /** Focus ring for the selected swatch. */
    ring: string;
    /** Left accent rail applied to rendered cards. */
    rail: string;
    /** Section-label / title text tint. */
    text: string;
    /** Low-opacity wash for the "soft" fill treatment. */
    softBg: string;
    /** Border tint paired with the soft/filled fill. */
    softBorder: string;
    /** Stronger wash for the "filled" treatment. */
    filledBg: string;
};

export const METRIC_VISUAL_ACCENTS: MetricVisualAccent[] = [
    { key: "enrollment", label: "Green", swatch: "bg-alloy-juniper", ring: "ring-alloy-juniper/40", rail: "border-l-alloy-juniper/70", text: "text-alloy-juniper/85", softBg: "bg-alloy-juniper/[0.06]", softBorder: "border-alloy-juniper/25", filledBg: "bg-alloy-juniper/15" },
    { key: "operational", label: "Slate", swatch: "bg-alloy-midnight/70", ring: "ring-alloy-midnight/30", rail: "border-l-alloy-midnight/55", text: "text-alloy-midnight/75", softBg: "bg-alloy-midnight/[0.05]", softBorder: "border-alloy-midnight/20", filledBg: "bg-alloy-midnight/[0.12]" },
    { key: "forms", label: "Violet", swatch: "bg-violet-500", ring: "ring-violet-400/40", rail: "border-l-violet-500/70", text: "text-violet-600/85", softBg: "bg-violet-500/[0.06]", softBorder: "border-violet-500/25", filledBg: "bg-violet-500/15" },
    { key: "communications", label: "Blue", swatch: "bg-alloy-blue", ring: "ring-alloy-blue/40", rail: "border-l-alloy-blue/70", text: "text-alloy-blue/85", softBg: "bg-alloy-blue/[0.06]", softBorder: "border-alloy-blue/25", filledBg: "bg-alloy-blue/15" },
    { key: "amber", label: "Amber", swatch: "bg-amber-500", ring: "ring-amber-400/40", rail: "border-l-amber-500/75", text: "text-amber-700", softBg: "bg-amber-500/[0.07]", softBorder: "border-amber-500/25", filledBg: "bg-amber-500/15" },
    { key: "critical", label: "Red", swatch: "bg-alloy-ember", ring: "ring-alloy-ember/40", rail: "border-l-alloy-ember/75", text: "text-alloy-ember", softBg: "bg-alloy-ember/[0.06]", softBorder: "border-alloy-ember/25", filledBg: "bg-alloy-ember/15" },
    { key: "neutral", label: "Gray", swatch: "bg-alloy-stone/50", ring: "ring-alloy-stone/40", rail: "border-l-alloy-stone/30", text: "text-alloy-midnight/55", softBg: "bg-alloy-stone/[0.08]", softBorder: "border-alloy-stone/25", filledBg: "bg-alloy-stone/20" },
];

const NEUTRAL = METRIC_VISUAL_ACCENTS.find((a) => a.key === "neutral")!;

// Maps builder accent option values to runtime MetricVisualAccentKey.
// Builder writes: "juniper", "ember", "blue", "pine" — runtime METRIC_VISUAL_ACCENTS
// uses semantic keys. This table bridges them so stored placements always resolve.
const ACCENT_ALIAS: Partial<Record<string, MetricVisualAccentKey>> = {
    juniper: "enrollment",
    ember: "critical",
    blue: "communications",
    pine: "enrollment",
    ops: "operational",
};

export function resolveMetricVisualAccent(accent: string | null | undefined): MetricVisualAccent {
    const key = (ACCENT_ALIAS[accent ?? ""] ?? accent ?? "neutral") as MetricVisualAccentKey;
    return METRIC_VISUAL_ACCENTS.find((a) => a.key === key) ?? NEUTRAL;
}

export type MetricVisualFill = "border" | "soft" | "filled";

export function normalizeMetricVisualFill(fill: string | null | undefined): MetricVisualFill {
    return fill === "soft" || fill === "filled" ? fill : "border";
}

/**
 * Resolve the card surface classes for a given accent + fill treatment.
 * "border" keeps a white card with the accent rail; "soft"/"filled" wash the
 * whole card with the selected color at low/medium opacity.
 */
export function resolveMetricCardSurface(accent: MetricVisualAccent, fill: MetricVisualFill): string {
    if (fill === "soft") return `border ${accent.softBorder} ${accent.softBg}`;
    if (fill === "filled") return `border ${accent.softBorder} ${accent.filledBg}`;
    return "border border-alloy-stone/15 bg-white";
}
