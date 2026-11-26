/**
 * Work Items product structure — Work | Studio, matching Financials, Operations and Processing.
 *
 * Work:
 *   Overview — launch point (resume work, quick navigation, create).
 *   Queue    — rail + queue + work item detail.
 *
 * Studio:
 *   Recurring Work — admin-defined operational work on a cadence.
 *
 * ── WHY RECURRING WORK IS STUDIO AND NOT A SECOND BUSINESS PROCESS ──
 *
 * A recurring definition produces MANUAL operational work on a schedule. It is not stage work and
 * must never be stamped as if it were: Business Process work derives its existence, its due date
 * and its completion authority from a stage operating plan, and a definition that forged that
 * metadata would put rows in Current Work that no stage can explain or close.
 *
 *   Recurring Work Definition → schedule fires → manual operational work instance → Work Items queue
 *
 * See docs/platform/governance/work-items-recurring-work.md for the authority model, the
 * assignment-resolution decision and the generation contract.
 */

export type WorkItemsMode = "work" | "studio";

export type WorkItemsWorkView = "overview" | "queue";

/** Studio has one surface in V1: the recurring work definition list. */
export type WorkItemsStudioView = "recurring";

export type WorkItemsView = WorkItemsWorkView | WorkItemsStudioView;

export const WORK_ITEMS_MODES = [
    { key: "work" as const, label: "Work" },
    { key: "studio" as const, label: "Studio" },
] as const;

export const WORK_ITEMS_WORK_TABS: { key: WorkItemsWorkView; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "queue", label: "Queue" },
];

export const WORK_ITEMS_STUDIO_TABS: { key: WorkItemsStudioView; label: string }[] = [
    { key: "recurring", label: "Recurring Work" },
];

const WORK_KEYS = new Set(WORK_ITEMS_WORK_TABS.map((t) => t.key));

export function workItemsTabsForMode(mode: WorkItemsMode): { key: WorkItemsView; label: string }[] {
    return mode === "studio" ? WORK_ITEMS_STUDIO_TABS : WORK_ITEMS_WORK_TABS;
}

/** The section a mode lands on when it is entered. */
export function defaultWorkItemsView(mode: WorkItemsMode): WorkItemsView {
    return mode === "studio" ? "recurring" : "overview";
}

export function isWorkItemsWorkView(value: unknown): value is WorkItemsWorkView {
    return typeof value === "string" && WORK_KEYS.has(value as WorkItemsWorkView);
}

export function modeForWorkItemsView(view: WorkItemsView): WorkItemsMode {
    return isWorkItemsWorkView(view) ? "work" : "studio";
}
