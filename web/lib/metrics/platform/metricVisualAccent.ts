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
};

export const METRIC_VISUAL_ACCENTS: MetricVisualAccent[] = [
    { key: "enrollment", label: "Green", swatch: "bg-alloy-juniper", ring: "ring-alloy-juniper/40", rail: "border-l-alloy-juniper/70", text: "text-alloy-juniper/85" },
    { key: "operational", label: "Slate", swatch: "bg-alloy-midnight/70", ring: "ring-alloy-midnight/30", rail: "border-l-alloy-midnight/55", text: "text-alloy-midnight/75" },
    { key: "forms", label: "Violet", swatch: "bg-violet-500", ring: "ring-violet-400/40", rail: "border-l-violet-500/70", text: "text-violet-600/85" },
    { key: "communications", label: "Blue", swatch: "bg-alloy-blue", ring: "ring-alloy-blue/40", rail: "border-l-alloy-blue/70", text: "text-alloy-blue/85" },
    { key: "amber", label: "Amber", swatch: "bg-amber-500", ring: "ring-amber-400/40", rail: "border-l-amber-500/75", text: "text-amber-700" },
    { key: "critical", label: "Red", swatch: "bg-alloy-ember", ring: "ring-alloy-ember/40", rail: "border-l-alloy-ember/75", text: "text-alloy-ember" },
    { key: "neutral", label: "Gray", swatch: "bg-alloy-stone/50", ring: "ring-alloy-stone/40", rail: "border-l-alloy-stone/30", text: "text-alloy-midnight/55" },
];

const NEUTRAL = METRIC_VISUAL_ACCENTS.find((a) => a.key === "neutral")!;

export function resolveMetricVisualAccent(accent: string | null | undefined): MetricVisualAccent {
    const key = accent === "ops" ? "operational" : accent ?? "neutral";
    return METRIC_VISUAL_ACCENTS.find((a) => a.key === key) ?? NEUTRAL;
}
