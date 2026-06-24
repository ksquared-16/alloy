/**
 * Workspace V2 layout system — page-level composition tokens.
 */
import { WS_GAP, WS_ZONE_MT } from "@/lib/workspace/workspaceLayoutSpacing";

export const WS_LAYOUT_ATTR = {
    commandSurface: "command-surface",
    commandBanner: "command-banner",
    overviewSummary: "overview-summary",
    workspaceSectionA: "workspace-section-a",
    workspaceSectionB: "workspace-section-b",
    commandRowProcessPills: "process-pills",
    commandRowProcessTitle: "process-title",
    commandRowPulse: "pulse",
    processNavGrid: "process-nav-grid",
    oipOverview: "oip-overview",
} as const;

/** Work unit / workspace command banner — structured surface, juniper left accent. */
export const WS_COMMAND_BANNER_CLASS =
    "w-full rounded-xl border border-alloy-juniper/25 border-l-[4px] border-l-alloy-juniper bg-gradient-to-br from-white via-white to-alloy-juniper/[0.045] px-4 py-3.5 shadow-[0_1px_4px_rgba(15,23,42,0.06)]";

/** O.I. overview summary — distinct from workspace banner (midnight top accent). */
export const WS_OVERVIEW_SUMMARY_CLASS =
    "w-full rounded-lg border border-alloy-midnight/10 border-t-[3px] border-t-alloy-midnight/35 bg-white px-3 py-2.5";

export const WS_LAYOUT = {
    sectionKicker:
        "text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45",
    workspaceTitle: "text-lg font-semibold tracking-tight text-alloy-midnight",
    /** Business process title — sits above stage pills on work unit banner. */
    processContextLabel:
        "text-xl font-bold uppercase tracking-[0.06em] text-alloy-juniper",
    sectionBreak: "mt-3 border-t border-alloy-juniper/10 pt-3",
    commandSurface: "w-full space-y-2.5",
    commandBanner: WS_COMMAND_BANNER_CLASS,
    overviewSummary: WS_OVERVIEW_SUMMARY_CLASS,
    /** Title stacked above stage pills. */
    rowProcessHeader: `flex min-w-0 w-full flex-col gap-1.5 ${WS_GAP.tight}`,
    rowPulse: "min-w-0 pt-0.5",
    pillsRail: "min-w-0 w-full overflow-x-auto",
    zoneSectionB: `${WS_ZONE_MT.commandToGrid} ${WS_ZONE_MT.section}`,
    processNavTile:
        "flex min-h-[10rem] w-full min-w-[20rem] max-w-[25rem] flex-col overflow-hidden rounded-xl border border-alloy-juniper/20 border-l-[4px] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,162,131,0.12)] hover:border-alloy-juniper/35",
    processNavGrid:
        "grid w-full max-w-[52rem] grid-cols-1 content-start gap-4 sm:grid-cols-2",
} as const;
