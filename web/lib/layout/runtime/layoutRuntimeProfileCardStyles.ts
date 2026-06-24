/**
 * Shared profile-card chrome for related-list rows (household contacts, connected children, etc.).
 * Layout engine owns structure; widgets own content.
 */

export const LAYOUT_RUNTIME_PROFILE_CARD_LIST = "flex flex-col gap-3 p-3";

export const LAYOUT_RUNTIME_PROFILE_CARD_SURFACE =
    "rounded-lg border border-alloy-stone/22 bg-white px-3.5 py-3 shadow-[0_1px_3px_rgba(24,39,58,0.05)] transition-shadow hover:shadow-[0_2px_7px_rgba(24,39,58,0.08)]";

export const LAYOUT_RUNTIME_PROFILE_CARD_HEADER_ROW = "flex items-start gap-3";

export const LAYOUT_RUNTIME_PROFILE_CARD_META_PRIMARY =
    "mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs font-medium text-alloy-midnight/80";

export const LAYOUT_RUNTIME_PROFILE_CARD_META_DETAIL =
    "mt-1 flex flex-col gap-y-1 text-[11px] leading-snug text-alloy-midnight/55";
