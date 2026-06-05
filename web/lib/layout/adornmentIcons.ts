/**
 * Layout V2 — field action-icon glyphs/labels (shared by builder + renderers).
 * Presentation only; no color/theme. Emoji keep V1 dependency-free.
 */

import type { LayoutAdornmentIcon } from "./layoutV2";

export const ADORNMENT_ICON_GLYPH: Record<LayoutAdornmentIcon, string> = {
    person: "👤",
    child: "👶",
    opportunity: "🎯",
    calendar: "📅",
    task: "✅",
    message: "💬",
    document: "📄",
};

export const ADORNMENT_ICON_LABEL: Record<LayoutAdornmentIcon, string> = {
    person: "Person",
    child: "Child",
    opportunity: "Opportunity",
    calendar: "Calendar",
    task: "Task",
    message: "Message",
    document: "Document",
};
