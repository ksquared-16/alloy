/**
 * Focus Panel Activity mode — horizontal embedded workspace tabs.
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md (EmbeddedWorkspace)
 * @see docs/platform/operator/operational-surface-design-system.md §12
 */

export const EMBEDDED_WORKSPACE_TAB_KEYS = [
    "timeline",
    "communications",
    "documents",
    "notes",
    "workflow",
    "audit",
] as const;

export type EmbeddedWorkspaceTabKey = (typeof EMBEDDED_WORKSPACE_TAB_KEYS)[number];

export type EmbeddedWorkspaceTab = {
    key: EmbeddedWorkspaceTabKey;
    label: string;
};

export const EMBEDDED_WORKSPACE_TABS: EmbeddedWorkspaceTab[] = [
    { key: "timeline", label: "Timeline" },
    { key: "communications", label: "Communications" },
    { key: "documents", label: "Documents" },
    { key: "notes", label: "Notes" },
    { key: "workflow", label: "Workflow" },
    { key: "audit", label: "Audit" },
];

export const DEFAULT_EMBEDDED_WORKSPACE_TAB: EmbeddedWorkspaceTabKey = "timeline";
