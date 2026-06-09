/** Shared header action class strings — no "use client" so importers avoid Turbopack export issues. */

const BLUE_OUTLINE =
    "border border-alloy-blue/30 bg-alloy-blue/5 text-alloy-blue hover:bg-alloy-blue/10 hover:border-alloy-blue/45";

export function recordDrawerHeaderActionClassName(
    inquiryWorkflow: boolean,
    squareCorners = false,
    variant: "default" | "actions-white" | "juniper" = "default",
): string {
    const radius = squareCorners ? "rounded-none" : inquiryWorkflow ? "rounded-full" : "rounded-md";
    if (variant === "juniper") {
        return `inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold ${radius} border border-alloy-juniper/35 bg-alloy-juniper text-white shadow-sm hover:bg-alloy-juniper/90 disabled:opacity-50`;
    }
    if (variant === "actions-white") {
        return `inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold ${radius} border border-alloy-stone/20 bg-white text-alloy-midnight shadow-sm hover:bg-alloy-stone/[0.04] disabled:opacity-50`;
    }
    return inquiryWorkflow
        ? `inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold ${radius} ${BLUE_OUTLINE} disabled:opacity-50`
        : `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold ${radius} ${BLUE_OUTLINE} disabled:opacity-50`;
}

/** @deprecated Use recordDrawerHeaderActionClassName — kept for Opportunity parity. */
export const opportunityDrawerHeaderActionClassName = recordDrawerHeaderActionClassName;

export const RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS = "flex flex-wrap gap-2 items-center";

/** @deprecated Use RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS — kept for Opportunity parity. */
export const OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS = RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS;

export function recordDrawerHeaderActionsPanelClassName(
    inquiryWorkflow: boolean,
    align: "start" | "end" = "end",
    bare = false
): string {
    const alignCls = align === "end" ? "justify-end" : "justify-start";
    if (bare) {
        return `flex flex-nowrap items-center gap-2 ${alignCls}`;
    }
    const chrome = inquiryWorkflow
        ? "rounded-xl border border-admin-border/45 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-alloy-stone/10"
        : "rounded-lg border border-admin-border/45 bg-white/70 px-2.5 py-1.5 shadow-sm";
    return `flex flex-wrap gap-2 items-center ${alignCls} ${chrome}`;
}

/** @deprecated Use recordDrawerHeaderActionsPanelClassName — kept for Opportunity parity. */
export const opportunityDrawerHeaderActionsPanelClassName = recordDrawerHeaderActionsPanelClassName;
