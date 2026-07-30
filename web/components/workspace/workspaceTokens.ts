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

/** Optional faint page field behind floating panels — cool neutral, never beige. */
export const WS_PAGE_FIELD = "bg-neutral-50";
/** Column / region separators — visible stone hairlines (doctrine: must read in browser). */
export const WS_DIVIDER = "border-alloy-stone/22";
/** Divider fill for WorkspaceDivider spans (matches WS_DIVIDER). */
export const WS_DIVIDER_FILL = "bg-alloy-stone/22";
/** Nav band → workspace content separator (full-width under secondary tabs). */
export const WS_NAV_CONTENT_DIVIDER = "";

/** Top control band → workspace body (full inner width). */
export const WS_CONTROL_BAND_DIVIDER = "border-b border-alloy-stone/30";
/** Title bar: white, subtle bottom border, midnight text (never navy). */
export const WS_TITLEBAR = "border-b border-alloy-stone/15 bg-white";

/** Panel chrome (identical to drawer/comms panels): white + pine left accent + emerald header. */
export const WS_PANEL_SURFACE = DRAWER_OVERVIEW_PANEL_SURFACE;
export const WS_PANEL_HEADER = DRAWER_OVERVIEW_PANEL_HEADER;
export const WS_PANEL_ICON_BADGE = DRAWER_OVERVIEW_PANEL_ICON_BADGE;
/** A flatter panel (no pine accent) for secondary/neutral regions. */
export const WS_PANEL_SURFACE_FLAT =
    "overflow-hidden rounded-xl border border-alloy-stone/22 bg-white shadow-[0_2px_10px_rgba(24,39,58,0.07)] ring-1 ring-alloy-stone/[0.06]";

/** Search / filter field chrome — matches global search visual weight on white surfaces. */
export const WS_FIELD_SEARCH_CHROME =
    "rounded-md border border-alloy-stone/55 bg-white px-3 py-1.5 text-[12px] text-alloy-midnight shadow-[0_1px_3px_rgba(24,39,58,0.06)] placeholder:text-alloy-midnight/40 focus-visible:border-alloy-bend-pine/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-alloy-bend-pine/35";

/** Compact select matching WS_FIELD_SEARCH_CHROME — white field, midnight value text (same as inputs). */
export const WS_FIELD_SELECT_CHROME =
    "rounded-md border border-alloy-stone/55 bg-white px-2.5 py-1.5 text-[12px] text-alloy-midnight shadow-[0_1px_3px_rgba(24,39,58,0.06)] focus-visible:border-alloy-bend-pine/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-alloy-bend-pine/35";

/**
 * Queue utility toolbar — visually separates Search/Filters from the row list so the
 * controls read as a toolbar, not the first queue card.
 */
export const WS_QUEUE_TOOLBAR_CHROME =
    "border-b border-alloy-stone/30 bg-alloy-stone/[0.05] shadow-[0_2px_6px_rgba(24,39,58,0.06)]";

/**
 * Mini metric unit inside a process tile — miniature KPI card grammar.
 * Border-first, soft lift, neutral wash; numbers hero, label supports.
 */
export const WS_METRIC_UNIT_CHROME =
    "flex h-full min-h-[4.25rem] flex-col justify-end rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.025] px-2.5 py-2.5 shadow-[0_1px_3px_rgba(24,39,58,0.04)]";

/**
 * Workspace Header KPI card chrome — border-first separation from the canvas, then a soft lift.
 * Lighter than process tiles so depth reads: canvas → KPI → process tile.
 */
export const WS_KPI_CARD_CHROME =
    "rounded-xl border border-alloy-stone/22 bg-white shadow-[0_2px_8px_rgba(24,39,58,0.07)]";

/**
 * Workspace process tile chrome — primary object on the page; slightly stronger elevation than KPIs.
 */
export const WS_PROCESS_TILE_CHROME =
    "rounded-xl border border-alloy-stone/24 bg-white shadow-[0_3px_12px_rgba(24,39,58,0.09)] ring-1 ring-alloy-stone/[0.08]";

/** Resting process tile hover — quiet confidence, not floating dashboard cards. */
export const WS_PROCESS_TILE_CHROME_HOVER =
    "transition-shadow hover:shadow-[0_4px_16px_rgba(24,39,58,0.11)] hover:ring-alloy-stone/10";

/**
 * Workspace panel eyebrow — Alloy green type on a clean white header (the Review & Decide
 * treatment). Keeps the shared Tier-2 eyebrow token untouched for non-workspace surfaces; the
 * green lives in the type rather than a washed tint band behind it.
 */
export const WS_EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.07em] text-alloy-bend-pine";
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

/* ── Alloy Workspace Doctrine V1 — frozen palette & surfaces ───────────────────
   Midnight Forge (#273F52 / alloy-midnight-forge) — structure, navigation, typography, icons
   Bend Pine (#00A283) — primary action, selection, progress, success (never decoration)
   Alloy Gold — attention, published
   White — surfaces and cards
   River Stone (#F4F6F9) — workspace field (~7% wash — visible separation, not gray/beige)
   No other accent colors in operational module workspaces. */

/** Stone workspace field — white cards float above this layer. */
export const WS_FIELD = "bg-alloy-stone/[0.07]";

/** Nav band → workspace body separator (full-width under shell chrome). */
export const WS_SHELL_BODY_SEPARATOR = "";

/** White gutter inset between modal shell chrome and the stone workspace field (~16px). */
export const WS_SHELL_INSET =
    "flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-4 pb-4 pt-3";

/** Rounded stone operational canvas inside the shell inset (Layer 2). */
export const WS_FIELD_CANVAS =
    `flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl ring-1 ring-alloy-stone/25 ${WS_FIELD}`;

/**
 * Module shell nav band padding (header → mode tabs → section tabs).
 *
 * The bottom rule runs the FULL width of the shell so the header reads as a distinct band rather
 * than floating above the body — the section tabs and the metrics strip previously ran straight into
 * the canvas with nothing separating them.
 */
export const WS_SHELL_NAV_CLASS = "border-b border-alloy-stone/22 bg-white px-4 pb-3 pt-1";

/** Queue / list rail — white column with visible vertical stone separator. */
export const WS_QUEUE_RAIL = "border-r border-alloy-stone/30 bg-white";

/** Primary working canvas inside a module workspace. */
export const WS_CANVAS = "bg-white shadow-[0_1px_6px_rgba(24,39,58,0.06)]";

/** Secondary inspector column beside the canvas. */
export const WS_INSPECTOR = "bg-alloy-stone/[0.02] border-l border-alloy-stone/12";

/** Metric-band eyebrow — stacked above operational health or legacy metric tiles. */
export const WS_METRIC_EYEBROW =
    "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-slate";

/** @deprecated use stacked `WS_METRIC_EYEBROW` via `WorkspaceMetricTiles` `eyebrow` prop */
export const WS_METRIC_EYEBROW_INLINE = WS_METRIC_EYEBROW;

/** Shared execution body beneath module nav — stone field. */
export const WS_EXECUTION_BODY =
    "flex min-h-0 flex-1 flex-col overflow-hidden bg-alloy-stone/[0.07]";

/** Scrollable content padding on stone field surfaces. */
export const WS_SURFACE_CONTENT_PAD = "p-4 lg:p-6";

/**
 * Overview content column — expands intentionally on large desktops (1440–1920) without
 * stretching empty cards. Narrow/tablet keeps the former max-w-6xl comfort width.
 */
export const WS_OVERVIEW_CONTENT =
    "mx-auto w-full max-w-6xl xl:max-w-[80rem] 2xl:max-w-[90rem]";

/** Vertical rhythm for overview landings (action → activity → information). */
export const WS_OVERVIEW_STACK = "space-y-5";

/** Three-card action row — full width of the overview column from md up. */
export const WS_OVERVIEW_ACTION_GRID = "grid gap-3 md:grid-cols-3 xl:gap-4";

/** Four-up launch / attention cards (Scheduling overview). */
export const WS_OVERVIEW_LAUNCH_GRID = "grid grid-cols-2 gap-3 md:grid-cols-4 xl:gap-4";

/** Today's activity tiles — 2×2 → four columns at large widths. */
export const WS_OVERVIEW_ACTIVITY_GRID = "grid grid-cols-2 gap-2 lg:grid-cols-4 xl:gap-3";

/**
 * Lower information zones — two equal columns from lg; at xl a calm 2/3 + 1/3 + 1/3 track
 * so the primary continue/recent panel reads wider without stretching empty cards.
 */
export const WS_OVERVIEW_INFO_GRID =
    "grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_minmax(0,1fr)] 2xl:gap-5";

/** Apply to the primary continue/recent panel inside WS_OVERVIEW_INFO_GRID (full-width on lg). */
export const WS_OVERVIEW_INFO_PRIMARY = "min-w-0 lg:col-span-2 xl:col-span-1";

/**
 * Alternate 2/3 + 1/3 information split for two-zone overviews (e.g. Scheduling decisions + week).
 * Pair with a full-width recent-changes band below.
 */
export const WS_OVERVIEW_INFO_SPLIT =
    "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] 2xl:gap-5";

/**
 * Artifact canvas — white document surface with stone border and soft depth.
 * Wraps scroll/viewport content inside artifact-heavy module zones (Processing source document).
 */
export const WS_ARTIFACT_CANVAS =
    "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-alloy-stone/20 bg-white shadow-[0_2px_8px_rgba(24,39,58,0.06)] ring-1 ring-alloy-stone/[0.06]";

/**
 * Artifact viewport — flex column inside WS_ARTIFACT_CANVAS.
 * Parent must be `flex min-h-0 flex-col`; scroll stays inside the document zone.
 */
export const WS_ARTIFACT_VIEWPORT = "flex min-h-0 flex-1 flex-col overflow-hidden";

/** Internal scroll region for stacked artifact pages (bottom padding avoids clipped edge). */
export const WS_ARTIFACT_VIEWPORT_SCROLL =
    "min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain px-3 pb-4 pt-0";

/* ── Typography hierarchy (three levels only — Workspace Doctrine V2 freeze) ─── */

/** Primary — titles, section headers, selected tabs, primary information (Midnight Forge). */
export const WS_TEXT_PRIMARY = "text-alloy-midnight";

/** Secondary — descriptions, metadata, timestamps (slate gray). */
export const WS_TEXT_SECONDARY = "text-alloy-slate";

/** Muted — disabled and de-emphasized states only (light gray). */
export const WS_TEXT_MUTED = "text-alloy-midnight/40";

/** @deprecated use WS_TEXT_MUTED */
export const WS_TEXT_DISABLED = WS_TEXT_MUTED;

/* ── Icon hierarchy (Workspace Doctrine V1 freeze) ─────────────────────────── */

/** Structural icons — navigation chrome, folder/list affordances. */
export const WS_ICON_STRUCTURAL = "text-alloy-midnight-forge";

/** Interactive icons — actions, links, map/edit controls on hover path. */
export const WS_ICON_INTERACTIVE = "text-alloy-bend-pine";

/** Attention / publish — warnings and published-state marks. */
export const WS_ICON_ATTENTION = "text-alloy-gold-dark";

/** Disabled icon treatment. */
export const WS_ICON_DISABLED = "text-alloy-midnight/40";
