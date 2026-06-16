/**
 * Layout V2 — field action-icon glyphs/labels (shared by builder + renderers).
 * Presentation only; no color/theme. Emoji keep V1 dependency-free.
 */

import type { LayoutAdornmentIcon } from "./layoutV2";

export const ADORNMENT_ICON_GLYPH: Record<LayoutAdornmentIcon, string> = {
    person: "👤",
    child: "👶",
    user: "🧑",
    opportunity: "🎯",
    calendar: "📅",
    birthday: "🎂",
    task: "✅",
    message: "💬",
    document: "📄",
    home: "🏠",
    phone: "📞",
    mail: "✉️",
    location: "📍",
    school: "🏫",
};

export const ADORNMENT_ICON_LABEL: Record<LayoutAdornmentIcon, string> = {
    person: "Person",
    child: "Child",
    user: "User",
    opportunity: "Opportunity",
    calendar: "Calendar",
    birthday: "Birthday",
    task: "Task",
    message: "Message",
    document: "Document",
    home: "Household (house)",
    phone: "Phone",
    mail: "Email",
    location: "Location",
    school: "School",
};
