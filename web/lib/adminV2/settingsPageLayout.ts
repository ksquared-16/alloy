/**
 * Shared layout classes for AdminV2 Settings (`/adminV2/settings/*`).
 * Pages use full available width; keep readable line lengths inside cards/copy only.
 */

/** Page root wrapper — replaces legacy `max-w-5xl` / `max-w-6xl` shells. */
export const SETTINGS_PAGE_SHELL_CLASS = "w-full min-w-0 space-y-6 pb-6";

/** Compact pages (single-column forms) — still full width; inner fields may constrain themselves. */
export const SETTINGS_PAGE_SHELL_COMPACT_CLASS = "w-full min-w-0 space-y-4 pb-4";

/** Intro subtitles under page titles — not a page width cap. */
export const SETTINGS_PAGE_INTRO_CLASS = "max-w-3xl text-sm leading-relaxed text-alloy-midnight/60";

export const SETTINGS_PAGE_INTRO_XS_CLASS = "max-w-3xl text-xs leading-snug text-alloy-midnight/60";
