/**
 * Layout editor widget presentation metadata (Phase 5.14B + Experience Builder 5.17).
 */

export const LAYOUT_EDITOR_WIDGET_STYLE_METADATA_KEY = "layoutEditorWidgetStyle" as const;

/** Operator-facing tone palette — maps to runtime accent rails via resolvers below. */
export const LAYOUT_EDITOR_WIDGET_TONES = [
    "green",
    "blue",
    "amber",
    "red",
    "purple",
    "neutral",
    "work",
    "attention",
    "muted",
] as const;
export type LayoutEditorWidgetTone = (typeof LAYOUT_EDITOR_WIDGET_TONES)[number];

export type LayoutEditorWidgetStyle = {
    tone?: LayoutEditorWidgetTone;
    description?: string;
    subtitle?: string;
    icon?: string;
    hidden?: boolean;
    width?: "auto" | "equal" | "compact";
};

export const LAYOUT_EDITOR_WIDGET_TONE_LABELS: Record<LayoutEditorWidgetTone, string> = {
    green: "Green (success / work)",
    blue: "Blue (information)",
    amber: "Amber (attention)",
    red: "Red (urgent)",
    purple: "Purple (highlight)",
    neutral: "Neutral",
    work: "Work (juniper)",
    attention: "Attention (ember)",
    muted: "Muted",
};

export const LAYOUT_EDITOR_WIDGET_TONE_SWATCH_CLASS: Record<LayoutEditorWidgetTone, string> = {
    green: "bg-alloy-juniper",
    blue: "bg-alloy-blue",
    amber: "bg-alloy-ember",
    red: "bg-red-500",
    purple: "bg-violet-500",
    neutral: "bg-alloy-stone/50",
    work: "bg-alloy-juniper",
    attention: "bg-alloy-ember",
    muted: "bg-alloy-stone/35",
};

export function readLayoutEditorWidgetStyle(metadata: Record<string, unknown> | undefined): LayoutEditorWidgetStyle {
    const raw = metadata?.[LAYOUT_EDITOR_WIDGET_STYLE_METADATA_KEY];
    if (!raw || typeof raw !== "object") return {};
    const bag = raw as Record<string, unknown>;
    const tone =
        typeof bag.tone === "string" && (LAYOUT_EDITOR_WIDGET_TONES as readonly string[]).includes(bag.tone) ?
            (bag.tone as LayoutEditorWidgetTone)
        :   undefined;
    const description = typeof bag.description === "string" ? bag.description.trim() : undefined;
    const subtitle = typeof bag.subtitle === "string" ? bag.subtitle.trim() : undefined;
    const icon = typeof bag.icon === "string" ? bag.icon.trim() : undefined;
    const hidden = typeof bag.hidden === "boolean" ? bag.hidden : undefined;
    const width =
        bag.width === "auto" || bag.width === "equal" || bag.width === "compact" ?
            bag.width
        :   undefined;
    return { tone, description, subtitle, icon, hidden, width };
}

export function writeLayoutEditorWidgetStyle(
    metadata: Record<string, unknown> | undefined,
    patch: LayoutEditorWidgetStyle,
): Record<string, unknown> {
    const prev = readLayoutEditorWidgetStyle(metadata);
    const merged = { ...prev, ...patch };
    const bag: Record<string, unknown> = {};
    if (merged.tone) bag.tone = merged.tone;
    if (merged.description) bag.description = merged.description;
    if (merged.subtitle) bag.subtitle = merged.subtitle;
    if (merged.icon) bag.icon = merged.icon;
    if (merged.hidden !== undefined) bag.hidden = merged.hidden;
    if (merged.width) bag.width = merged.width;
    return {
        ...(metadata ?? {}),
        [LAYOUT_EDITOR_WIDGET_STYLE_METADATA_KEY]: bag,
    };
}

function normalizeWidgetTone(tone: LayoutEditorWidgetTone | undefined): LayoutEditorWidgetTone | undefined {
    if (!tone) return undefined;
    if (tone === "work") return "green";
    if (tone === "attention") return "amber";
    return tone;
}

/** Runtime tone for widgets — maps legacy work/attention aliases to operator palette. */
export type LayoutEditorWidgetRuntimeTone =
    | "green"
    | "blue"
    | "amber"
    | "red"
    | "purple"
    | "neutral"
    | "muted";

export function resolveLayoutEditorWidgetRuntimeTone(
    style: LayoutEditorWidgetStyle | undefined,
): LayoutEditorWidgetRuntimeTone {
    const tone = normalizeWidgetTone(style?.tone);
    if (
        tone === "green"
        || tone === "blue"
        || tone === "amber"
        || tone === "red"
        || tone === "purple"
        || tone === "neutral"
        || tone === "muted"
    ) {
        return tone;
    }
    return "neutral";
}

/** Accepts runtime tones plus legacy summary-card aliases (`work`, `attention`). */
export type LeadOperatingCardAccentInput = LayoutEditorWidgetRuntimeTone | "work" | "attention";

export function resolveLeadOperatingCardAccent(
    accent: LeadOperatingCardAccentInput | undefined,
): LayoutEditorWidgetRuntimeTone {
    if (!accent) return "neutral";
    if (accent === "work") return "green";
    if (accent === "attention") return "amber";
    return accent;
}

export function resolveLayoutEditorWidgetAccentRail(
    style: LayoutEditorWidgetStyle | undefined,
): "work" | "attention" | undefined {
    const tone = normalizeWidgetTone(style?.tone);
    if (tone === "green" || tone === "work") return "work";
    if (tone === "amber" || tone === "red" || tone === "attention") return "attention";
    return undefined;
}

export function resolveLayoutEditorWidgetLeadCardAccent(
    style: LayoutEditorWidgetStyle | undefined,
): LayoutEditorWidgetRuntimeTone {
    return resolveLayoutEditorWidgetRuntimeTone(style);
}

export function resolveLayoutEditorWidgetToneDotClass(tone: LayoutEditorWidgetRuntimeTone | undefined): string {
    switch (tone ?? "neutral") {
        case "green":
            return "bg-alloy-juniper/80";
        case "blue":
            return "bg-alloy-blue/80";
        case "amber":
            return "bg-alloy-ember/80";
        case "red":
            return "bg-red-500/80";
        case "purple":
            return "bg-violet-500/75";
        case "muted":
            return "bg-alloy-stone/35";
        default:
            return "bg-alloy-stone/50";
    }
}

export function resolveLayoutEditorWidgetToneRailClass(tone: LayoutEditorWidgetTone | undefined): string {
    const normalized = normalizeWidgetTone(tone) ?? "neutral";
    switch (normalized) {
        case "green":
            return "border-l-alloy-juniper/70";
        case "blue":
            return "border-l-alloy-blue/70";
        case "amber":
            return "border-l-alloy-ember/75";
        case "red":
            return "border-l-red-500/70";
        case "purple":
            return "border-l-violet-500/65";
        case "muted":
            return "border-l-alloy-stone/15";
        default:
            return "border-l-alloy-stone/25";
    }
}
