import type { DrillDestinationKind, Tone } from "./types";

/** Shared Alloy-native tone + drill tokens for Slice 2 charts and panels. */

export const TONE_TEXT: Record<Tone, string> = {
    healthy: "text-alloy-juniper",
    warning: "text-amber-500",
    critical: "text-alloy-ember",
    unknown: "text-alloy-stone/50",
    neutral: "text-alloy-pine",
};

export const TONE_BG: Record<Tone, string> = {
    healthy: "bg-alloy-juniper",
    warning: "bg-amber-500",
    critical: "bg-alloy-ember",
    unknown: "bg-alloy-stone/40",
    neutral: "bg-alloy-pine",
};

export const TONE_RAIL: Record<Tone, string> = {
    healthy: "border-l-alloy-juniper/70",
    warning: "border-l-amber-500/75",
    critical: "border-l-alloy-ember/75",
    unknown: "border-l-alloy-stone/30",
    neutral: "border-l-alloy-pine/60",
};

export const TONE_SOFT: Record<Tone, string> = {
    healthy: "bg-alloy-juniper/[0.07] border-alloy-juniper/25",
    warning: "bg-amber-500/[0.08] border-amber-500/25",
    critical: "bg-alloy-ember/[0.07] border-alloy-ember/25",
    unknown: "bg-alloy-stone/[0.08] border-alloy-stone/20",
    neutral: "bg-alloy-pine/[0.06] border-alloy-pine/20",
};

export function tone(t: Tone | undefined): Tone {
    return t ?? "neutral";
}

/** Glyph + short label per deterministic drill destination kind. */
export const DRILL_META: Record<DrillDestinationKind, { glyph: string; kindLabel: string }> = {
    queue: { glyph: "▤", kindLabel: "Queue" },
    records: { glyph: "☷", kindLabel: "Records" },
    work_unit: { glyph: "◳", kindLabel: "Work unit" },
    business_process: { glyph: "⛓", kindLabel: "Process" },
    drawer: { glyph: "▸", kindLabel: "Drawer" },
    report_detail: { glyph: "⤓", kindLabel: "Report" },
    workflow: { glyph: "⚡", kindLabel: "Workflow" },
    optimization_center: { glyph: "◎", kindLabel: "Optimize" },
};
