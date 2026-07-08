/**
 * Work Items product structure — aligned with Digital Mailroom Work mode.
 *
 * Overview — launch point (resume work, KPIs, quick navigation).
 * Queue     — process rail + queue + task detail workspace.
 */

export type WorkItemsWorkView = "overview" | "queue";

export const WORK_ITEMS_WORK_TABS: { key: WorkItemsWorkView; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "queue", label: "Queue" },
];

export const WORK_ITEMS_MODES = [{ key: "work" as const, label: "Work" }];
