/**
 * System 5 — Activity mode horizontal workspace tabs.
 * @see docs/platform/operator/operational-surface-design-system.md §12
 */

export const ACTIVITY_WORKSPACE_TAB_KEYS = [
    "timeline",
    "communications",
    "documents",
    "notes",
    "workflow",
    "audit",
] as const;

export type ActivityWorkspaceTabKey = (typeof ACTIVITY_WORKSPACE_TAB_KEYS)[number];

export type ActivityWorkspaceTab = {
    key: ActivityWorkspaceTabKey;
    label: string;
};

export const ACTIVITY_WORKSPACE_TABS: ActivityWorkspaceTab[] = [
    { key: "timeline", label: "Timeline" },
    { key: "communications", label: "Communications" },
    { key: "documents", label: "Documents" },
    { key: "notes", label: "Notes" },
    { key: "workflow", label: "Workflow" },
    { key: "audit", label: "Audit" },
];

export const DEFAULT_ACTIVITY_WORKSPACE_TAB: ActivityWorkspaceTabKey = "timeline";
