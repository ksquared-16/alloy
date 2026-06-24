/** Shared Alloy layout-runtime surface tokens (drawer + queue). */

export const LAYOUT_RUNTIME_TEXT = "#18273A";
export const LAYOUT_RUNTIME_MUTED = "#59678b";

export const LAYOUT_RUNTIME_FIELD_SURFACE =
    "rounded-md border border-admin-border bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(24,39,58,0.04)] transition-shadow hover:shadow-[0_2px_5px_rgba(24,39,58,0.06)] focus-within:border-alloy-juniper/35 focus-within:ring-1 focus-within:ring-alloy-juniper/10";

/** Flat read-only field row for production drawer runtime (no input chrome). */
export const LAYOUT_RUNTIME_FIELD_READ_SURFACE = "min-w-0 py-1";

/** Persistent edit-mode affordance for inline-editable drawer fields (visible without hover). */
export const LAYOUT_RUNTIME_FIELD_EDITABLE_AFFORDANCE =
    "min-w-0 rounded-md border border-alloy-juniper/30 bg-alloy-juniper/[0.05] px-2 py-1 shadow-[inset_0_0_0_1px_rgba(0,162,131,0.08)] transition-[border-color,background-color,box-shadow] hover:border-alloy-juniper/45 hover:bg-white focus-within:border-alloy-juniper/50 focus-within:bg-white focus-within:shadow-[0_0_0_1px_rgba(0,162,131,0.14)]";

export const LAYOUT_RUNTIME_GROUP_SURFACE =
    "rounded-md border border-admin-border bg-white p-2.5";

/** Flat read-only group for production drawer body sections. */
export const LAYOUT_RUNTIME_GROUP_READ_SURFACE = "min-w-0 space-y-1.5 py-0.5";

export const LAYOUT_RUNTIME_PANEL_SURFACE =
    "overflow-hidden rounded-md border border-admin-border bg-white shadow-[0_1px_2px_rgba(24,39,58,0.04)]";

export const LAYOUT_RUNTIME_PANEL_HEADER =
    "flex items-center justify-between border-b border-admin-border bg-white px-2.5 py-1.5";

/** Compact summary-strip widget card — single-row desktop strip. */
export const LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE =
    "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/12 bg-white";

export const LAYOUT_RUNTIME_SUMMARY_WIDGET_HEADER =
    "flex items-center gap-1 px-2 py-1";

export const LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY = "flex min-h-0 flex-1 flex-col px-2 py-1.5";

export const LAYOUT_RUNTIME_SECTION_SURFACE =
    "overflow-hidden rounded-lg border border-admin-border border-l-[3px] border-l-[rgb(0,162,131)] bg-white shadow-[0_1px_3px_rgba(24,39,58,0.05)]";

export const LAYOUT_RUNTIME_SECTION_HEADER =
    "border-b border-alloy-stone/10 bg-gradient-to-r from-emerald-50/70 via-emerald-50/35 to-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/75";

/** Primary workspace centerpiece section (e.g. Children & Enrollment). */
export const LAYOUT_RUNTIME_PRIMARY_WORKSPACE_SECTION =
    "overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-[0_2px_8px_rgba(24,39,58,0.06)] ring-1 ring-alloy-stone/10";

export const LAYOUT_RUNTIME_PRIMARY_WORKSPACE_HEADER =
    "border-b border-alloy-stone/12 bg-[linear-gradient(180deg,rgba(251,252,253,1)_0%,rgba(255,255,255,1)_100%)] px-4 py-2.5 text-[13px] font-semibold tracking-tight text-alloy-midnight";

/** Body section chrome — clear outer border + stronger bottom edge for visible card definition. */
export const LAYOUT_RUNTIME_BODY_SECTION_SURFACE =
    "mb-3 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/40 border-b-[2px] border-b-alloy-stone/55 bg-white shadow-[0_2px_6px_rgba(24,39,58,0.08)]";

export const LAYOUT_RUNTIME_BODY_SECTION_HEADER =
    "shrink-0 border-b border-alloy-stone/16 px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/58";

/** White drawer overview canvas — depth comes from section panels, not gray fill. */
export const LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS = "bg-white";

/**
 * AdminV2 container hierarchy — border strength only (no layout/spacing changes).
 * Level 1: drawer shells (strongest)
 * Level 2: BOS rail + actions rail outer containers
 * Level 3: internal cards/widgets — use border-admin-border / LAYOUT_RUNTIME_* surfaces (unchanged here)
 */
export const CONTAINER_BORDER_LEVEL_1_DRAWER_SHELL = "rgba(39, 63, 82, 0.28)";
export const CONTAINER_BORDER_LEVEL_2_RAIL_SHELL = "rgba(39, 63, 82, 0.2)";

/** Neutral outer drawer shell rim — Lead/Person/Child/Inbox/Tasks modal presentation. */
export const LAYOUT_RUNTIME_DRAWER_OUTER_BORDER = CONTAINER_BORDER_LEVEL_1_DRAWER_SHELL;

export const LAYOUT_RUNTIME_DRAWER_OUTER_SHADOW =
    "0 12px 40px rgba(39, 63, 82, 0.08), 0 2px 8px rgba(39, 63, 82, 0.04)";

/** Operational enrollment roster inside primary workspace section. */
export const LAYOUT_RUNTIME_ENROLLMENT_GRID_WRAP = "min-w-0 bg-white";

/** @deprecated use LAYOUT_RUNTIME_ENROLLMENT_GRID_WRAP */
export const LAYOUT_RUNTIME_ENROLLMENT_TABLE_WRAP = LAYOUT_RUNTIME_ENROLLMENT_GRID_WRAP;

/** Lead overview composition card — white card with Bend Pine left accent + clear definition. */
export const LAYOUT_RUNTIME_COMPOSITION_SECTION_SURFACE =
    "mb-3 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/40 border-b-[2px] border-b-alloy-stone/55 border-l-[3px] border-l-alloy-juniper/75 bg-white shadow-[0_2px_6px_rgba(24,39,58,0.09)]";

export const LAYOUT_RUNTIME_COMPOSITION_SECTION_BODY = "px-3.5 pb-3.5 pt-2.5";

export const LAYOUT_RUNTIME_COMPOSITION_SECTION_EYEBROW =
    "text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/42";

export const LAYOUT_RUNTIME_COMPOSITION_SECTION_TITLE =
    "text-[13px] font-semibold tracking-tight text-alloy-midnight";

export const LAYOUT_RUNTIME_COMPOSITION_SECTION_HEADER =
    "shrink-0 flex flex-col gap-0.5 border-b border-alloy-stone/12 bg-gradient-to-r from-emerald-50/70 via-emerald-50/35 to-white px-3 py-2.5";

/** Primary enrollment centerpiece — same composition card chrome as household/activity. */
export const LAYOUT_RUNTIME_COMPOSITION_ENROLLMENT_SURFACE = LAYOUT_RUNTIME_COMPOSITION_SECTION_SURFACE;

export const LAYOUT_RUNTIME_COMPOSITION_ENROLLMENT_HEADER =
    "flex flex-col gap-0.5 border-b border-alloy-stone/10 bg-gradient-to-r from-emerald-50/70 via-emerald-50/35 to-white px-3 py-2";

export const LAYOUT_RUNTIME_COMPOSITION_ENROLLMENT_BODY = "px-0 pb-0 pt-0";

/** Shared peer-row grid — sections stretch to tallest sibling height. */
export const LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS = "min-w-0 grid items-stretch";
export const LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS = "min-w-0 flex h-full min-h-0 flex-col";

/** Needs-attention accent — left rail only (Child Information, Attention widget). */
export const LAYOUT_RUNTIME_ATTENTION_RAIL = "border-l-[3px] border-l-alloy-ember/75";

/** Work-item / default accent — Bend Pine (juniper) left rail. */
export const LAYOUT_RUNTIME_WORK_RAIL = "border-l-[3px] border-l-alloy-juniper/45";
