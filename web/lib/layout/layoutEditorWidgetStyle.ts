/**
 * Layout editor widget presentation metadata (Phase 5.14B).
 */

export const LAYOUT_EDITOR_WIDGET_STYLE_METADATA_KEY = "layoutEditorWidgetStyle" as const;

export const LAYOUT_EDITOR_WIDGET_TONES = ["work", "attention", "neutral", "muted"] as const;
export type LayoutEditorWidgetTone = (typeof LAYOUT_EDITOR_WIDGET_TONES)[number];

export type LayoutEditorWidgetStyle = {
    tone?: LayoutEditorWidgetTone;
    description?: string;
};

export const LAYOUT_EDITOR_WIDGET_TONE_LABELS: Record<LayoutEditorWidgetTone, string> = {
    work: "Work (juniper)",
    attention: "Attention (ember)",
    neutral: "Neutral",
    muted: "Muted",
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
    return { tone, description };
}

export function writeLayoutEditorWidgetStyle(
    metadata: Record<string, unknown> | undefined,
    patch: LayoutEditorWidgetStyle,
): Record<string, unknown> {
    const prev = readLayoutEditorWidgetStyle(metadata);
    return {
        ...(metadata ?? {}),
        [LAYOUT_EDITOR_WIDGET_STYLE_METADATA_KEY]: {
            tone: patch.tone ?? prev.tone,
            ...(patch.description !== undefined ? { description: patch.description } : prev.description ? { description: prev.description } : {}),
        },
    };
}

export function resolveLayoutEditorWidgetAccentRail(
    style: LayoutEditorWidgetStyle | undefined,
): "work" | "attention" | undefined {
    if (style?.tone === "work") return "work";
    if (style?.tone === "attention") return "attention";
    return undefined;
}

export function resolveLayoutEditorWidgetLeadCardAccent(
    style: LayoutEditorWidgetStyle | undefined,
): "attention" | "work" | "neutral" | "muted" {
    if (style?.tone === "attention") return "attention";
    if (style?.tone === "work") return "work";
    if (style?.tone === "muted") return "muted";
    return "neutral";
}
