/**
 * Canonical workspace design tokens (Alloy UX convergence).
 *
 * One visual language for every operational workspace — POS, Forms, Layout Builder,
 * Processing, Communications. Values are derived from the SHIPPED Communications /
 * drawer chrome so surfaces are pixel-consistent:
 *   • white canvas + white panels, subtle alloy-stone borders
 *   • Bend Pine (#00A283 / alloy-juniper) for accents + selection
 *   • emerald wash for panel header bands; emerald/amber reserved for status
 *   • midnight for text
 * No navy slabs, no beige page fields, no generic SaaS tabs.
 */

import {
    DRAWER_OVERVIEW_PANEL_HEADER,
    DRAWER_OVERVIEW_PANEL_ICON_BADGE,
    DRAWER_OVERVIEW_PANEL_SURFACE,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { PRESENTATION_SECTION_EYEBROW, PRESENTATION_SECTION_HEADER } from "@/lib/presentation/presentationTypography";

/** Bend Pine — the Alloy mark color. Primary action + accent. */
export const BEND_PINE = "#00A283";
export const BEND_PINE_HOVER = "#009276";

/** Canvas: white platform surface (no beige). */
export const WS_CANVAS = "bg-white";
/** Optional faint page field behind floating panels (kept near-white, never beige). */
export const WS_PAGE_FIELD = "bg-[#f7f6f3]";
/** Column / region separators. */
export const WS_DIVIDER = "border-alloy-stone/12";
/** Title bar: white, subtle bottom border, midnight text (never navy). */
export const WS_TITLEBAR = "border-b border-alloy-stone/15 bg-white";

/** Panel chrome (identical to drawer/comms panels): white + pine left accent + emerald header. */
export const WS_PANEL_SURFACE = DRAWER_OVERVIEW_PANEL_SURFACE;
export const WS_PANEL_HEADER = DRAWER_OVERVIEW_PANEL_HEADER;
export const WS_PANEL_ICON_BADGE = DRAWER_OVERVIEW_PANEL_ICON_BADGE;
/** A flatter panel (no pine accent) for secondary/neutral regions. */
export const WS_PANEL_SURFACE_FLAT =
    "overflow-hidden rounded-lg border border-alloy-stone/15 bg-white shadow-[0_1px_4px_rgba(24,39,58,0.05)]";

export const WS_EYEBROW = PRESENTATION_SECTION_EYEBROW;
export const WS_SECTION_HEADER = PRESENTATION_SECTION_HEADER;

/** Left-nav item states (white sidebar, pine active). */
export const WS_NAV_ITEM_ACTIVE = "bg-alloy-juniper/[0.10] text-alloy-juniper";
export const WS_NAV_ITEM_IDLE = "text-alloy-midnight/65 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight";
export const WS_NAV_GROUP_LABEL = "text-[9px] font-semibold uppercase tracking-[0.09em] text-alloy-midnight/35";

/** Selection accent for list rows (queue, form list). */
export const WS_ROW_SELECTED = "border-alloy-juniper bg-alloy-juniper/[0.07]";
export const WS_ROW_IDLE = "border-transparent hover:bg-alloy-stone/[0.05]";

/** Action affordances. */
export const WS_ACTION_PRIMARY =
    "rounded-md bg-[#00A283] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#009276] disabled:opacity-50";
export const WS_ACTION_SECONDARY =
    "rounded-md border border-alloy-stone/20 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-alloy-midnight/75 hover:border-alloy-stone/35 disabled:opacity-50";
