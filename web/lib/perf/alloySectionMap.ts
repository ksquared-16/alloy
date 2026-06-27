/**
 * Alloy OS Runtime Surface Section Map — canonical registry.
 *
 * Every visible region of the Work Unit operating surface and the Workspace surface has a
 * stable section identifier (`WU-00`…`WU-15`, `WS-00`…`WS-10`). This module is the single
 * source of truth consumed by:
 *   - `alloySectionDomAttrs(id)` → `data-alloy-section-*` DOM diagnostics
 *   - `perfSection(...)` (see `perfNamespaceLog.ts`) → `[perf:section]` dev/staging load logs
 *   - `docs/platform/operator/runtime-surface-section-map.md` (kept in sync via tests)
 *
 * Law: any NEW surface section must register an entry here. Tests assert the doc and the
 * registry stay aligned and that snapshot/blocking contracts hold.
 *
 * This file is documentation + diagnostics only. It does NOT gate reveal; `blocking` records
 * the readiness contract for diagnosis, it is not a runtime switch.
 */

export type AlloySurface = "work_unit" | "workspace";

/** Where the section's first-paint data comes from. */
export type AlloySectionCache = "bootstrap" | "session" | "network" | "snapshot" | "none";

export type AlloySectionEntry = {
    /** Stable id, e.g. "WU-02". */
    id: string;
    surface: AlloySurface;
    /** Human-readable section name (kept short — also emitted as `data-alloy-section-name`). */
    name: string;
    /** Primary component owner (repo-relative path). Split sections list the primary root. */
    owner: string;
    /** Human label for the authoritative data source. */
    dataSource: string;
    /**
     * Whether this section blocks the coordinated surface reveal under its readiness contract.
     * Diagnostic record only — not a runtime gate.
     */
    blocking: boolean;
    /** Qualifier for conditional blocking (e.g. "active_mode_only", "when_open"). */
    blockingNote?: string;
    /** First-paint cache/source class. */
    cache: AlloySectionCache;
    /** KPI snapshot section — occupies final placement immediately, refreshes quietly, never blocks. */
    snapshot?: boolean;
};

const WORK_UNIT_SECTIONS: readonly AlloySectionEntry[] = [
    {
        id: "WU-00",
        surface: "work_unit",
        name: "Persistent OS Shell",
        owner: "web/app/adminV2/components/AdminV2Shell.tsx",
        dataSource: "session shell (sidebar, top nav, global search, location selector)",
        blocking: true,
        cache: "session",
    },
    {
        id: "WU-01",
        surface: "work_unit",
        name: "Work Unit Context Header",
        owner: "web/components/admin/workspace/layout/WorkUnitCommandSurface.tsx",
        dataSource: "operational bootstrap (work unit title, process label, lane context)",
        blocking: true,
        cache: "bootstrap",
    },
    {
        id: "WU-02",
        surface: "work_unit",
        name: "Work Unit KPI Strip",
        owner: "web/components/admin/workspace/layout/WorkUnitCommandSurface.tsx",
        dataSource: "bootstrap/cache placement KPI snapshot (default snapshot until first load)",
        blocking: false,
        cache: "snapshot",
        snapshot: true,
    },
    {
        id: "WU-03",
        surface: "work_unit",
        name: "Work View / Lane Pills",
        owner: "web/components/admin/workspace/layout/WorkUnitCommandSurface.tsx",
        dataSource: "operational bootstrap queue summaries / perspectives rail",
        blocking: true,
        cache: "bootstrap",
    },
    {
        id: "WU-04",
        surface: "work_unit",
        name: "Queue Header",
        owner: "web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
        dataSource: "queue definition + active lane summary (bootstrap, refreshed)",
        blocking: true,
        cache: "bootstrap",
    },
    {
        id: "WU-05",
        surface: "work_unit",
        name: "Condensed Queue Rows",
        owner: "web/app/adminV2/components/workspace/blocks/QueueBlock.tsx",
        dataSource: "primary lane rows (bootstrap inline, then quiet network refresh)",
        blocking: true,
        blockingNote: "WU-05 or WU-06 (whichever resolves) blocks",
        cache: "bootstrap",
    },
    {
        id: "WU-06",
        surface: "work_unit",
        name: "Queue Preparing / Empty State",
        owner: "web/app/adminV2/components/workspace/blocks/OperationalModeQueuePreparePanel.tsx",
        dataSource: "operational mode entry controller (preparing) / known-empty lane",
        blocking: true,
        blockingNote: "WU-05 or WU-06 (whichever resolves) blocks",
        cache: "none",
    },
    {
        id: "WU-07",
        surface: "work_unit",
        name: "Focus Panel Shell",
        owner: "web/components/admin/drawer/EntityDrawerOperatingShell.tsx",
        dataSource: "drawer chrome + subject identity (shell renders before VM payload)",
        blocking: true,
        cache: "session",
    },
    {
        id: "WU-08",
        surface: "work_unit",
        name: "Focus Panel Mode Control",
        owner: "web/components/admin/focusPanel/FocusPanelModeSwitch.tsx",
        dataSource: "static UI (Summary / Work / Activity tablist)",
        blocking: true,
        cache: "none",
    },
    {
        id: "WU-09",
        surface: "work_unit",
        name: "Focus Panel Summary Mode",
        owner: "web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx",
        dataSource: "opportunity drawer view-model (System 5 cards)",
        blocking: true,
        blockingNote: "active_mode_only — blocks only when Summary is the active mode",
        cache: "network",
    },
    {
        id: "WU-10",
        surface: "work_unit",
        name: "Focus Panel Work Mode",
        owner: "web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx",
        dataSource: "opportunity drawer view-model (work checklist / launcher / blockers)",
        blocking: false,
        blockingNote: "does not block when inactive",
        cache: "network",
    },
    {
        id: "WU-11",
        surface: "work_unit",
        name: "Focus Panel Activity Mode",
        owner: "web/components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx",
        dataSource: "timeline / activity / embedded workspace (lazy)",
        blocking: false,
        blockingNote: "does not block when inactive",
        cache: "network",
    },
    {
        id: "WU-12",
        surface: "work_unit",
        name: "Right Rail Actions",
        owner: "web/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection.tsx",
        dataSource: "actions right-rail bundle",
        blocking: false,
        blockingNote: "shell renders without blocking core reveal",
        cache: "network",
    },
    {
        id: "WU-13",
        surface: "work_unit",
        name: "Right Rail Workflow Telemetry",
        owner: "web/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx",
        dataSource: "workflow runs / summary telemetry",
        blocking: false,
        blockingNote: "shell renders without blocking core reveal",
        cache: "network",
    },
    {
        id: "WU-14",
        surface: "work_unit",
        name: "BOS Rail",
        owner: "web/app/adminV2/components/CommandRailBosMount.tsx",
        dataSource: "BOS assistant panel (lazy)",
        blocking: false,
        blockingNote: "shell renders without blocking core reveal",
        cache: "network",
    },
    {
        id: "WU-15",
        surface: "work_unit",
        name: "Operational Workspace Overlay",
        owner: "web/app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx",
        dataSource: "Processing / Communications / Work Items / Inbox modal (full operating canvas)",
        blocking: false,
        blockingNote: "when_open — blocks only when explicitly opened",
        cache: "network",
    },
];

const WORKSPACE_SECTIONS: readonly AlloySectionEntry[] = [
    {
        id: "WS-00",
        surface: "workspace",
        name: "Persistent OS Shell",
        owner: "web/app/adminV2/components/AdminV2Shell.tsx",
        dataSource: "session shell (sidebar, top nav, global search, location selector)",
        blocking: true,
        cache: "session",
    },
    {
        id: "WS-01",
        surface: "workspace",
        name: "Workspace Resume Chip",
        owner: "web/components/admin/workspace/ResumeWhereYouLeftOffChip.tsx",
        dataSource: "session resume state",
        blocking: false,
        cache: "session",
    },
    {
        id: "WS-02",
        surface: "workspace",
        name: "Workspace Title / Command Center Header",
        owner: "web/components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx",
        dataSource: "org / command center header (bootstrap)",
        blocking: true,
        cache: "bootstrap",
    },
    {
        id: "WS-03",
        surface: "workspace",
        name: "Workspace Health KPI Strip",
        owner: "web/components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx",
        dataSource: "OIP health snapshot (cache/default snapshot)",
        blocking: false,
        cache: "snapshot",
        snapshot: true,
    },
    {
        id: "WS-04",
        surface: "workspace",
        name: "Operational Pulse / Primary KPI Area",
        owner: "web/components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx",
        dataSource: "operational pulse snapshot (cache/default snapshot)",
        blocking: false,
        cache: "snapshot",
        snapshot: true,
    },
    {
        id: "WS-05",
        surface: "workspace",
        name: "Business Process Tiles",
        owner: "web/components/admin/workspace/WorkspaceRootLifecycleGrid.tsx",
        dataSource: "lifecycle catalog + departments (bootstrap)",
        blocking: true,
        cache: "bootstrap",
    },
    {
        id: "WS-06",
        surface: "workspace",
        name: "Workspace Process Tile KPI Snapshot",
        owner: "web/components/admin/workspace/WorkspaceRootLifecycleGrid.tsx",
        dataSource: "per-tile metric snapshot (cache/default snapshot)",
        blocking: false,
        cache: "snapshot",
        snapshot: true,
    },
    {
        id: "WS-07",
        surface: "workspace",
        name: "Right Rail Actions",
        owner: "web/app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx",
        dataSource: "workspace-root actions bundle",
        blocking: false,
        cache: "network",
    },
    {
        id: "WS-08",
        surface: "workspace",
        name: "Right Rail Workflow Telemetry",
        owner: "web/app/adminV2/components/workspace/CommandRailDefaultEmptyTelemetry.tsx",
        dataSource: "workflow telemetry (default empty on workspace root)",
        blocking: false,
        cache: "network",
    },
    {
        id: "WS-09",
        surface: "workspace",
        name: "BOS Rail",
        owner: "web/app/adminV2/components/CommandRailBosMount.tsx",
        dataSource: "BOS assistant panel (lazy)",
        blocking: false,
        cache: "network",
    },
    {
        id: "WS-10",
        surface: "workspace",
        name: "Operational Workspace Overlay",
        owner: "web/app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx",
        dataSource: "Processing / Communications / Work Items / Inbox modal (full operating canvas)",
        blocking: false,
        blockingNote: "when_open — blocks only when explicitly opened",
        cache: "network",
    },
];

export const ALLOY_SECTION_LIST: readonly AlloySectionEntry[] = [
    ...WORK_UNIT_SECTIONS,
    ...WORKSPACE_SECTIONS,
];

export const ALLOY_SECTION_MAP: Readonly<Record<string, AlloySectionEntry>> = Object.freeze(
    Object.fromEntries(ALLOY_SECTION_LIST.map((entry) => [entry.id, entry])),
);

export type AlloySectionId = string;

export function getAlloySection(id: AlloySectionId): AlloySectionEntry | null {
    return ALLOY_SECTION_MAP[id] ?? null;
}

/**
 * DOM diagnostic attributes for a section root. Spread onto the section's root element:
 *   <div {...alloySectionDomAttrs("WU-02")}>…</div>
 *
 * Returns an empty object for unknown ids (never throws) so wiring stays safe.
 */
export function alloySectionDomAttrs(id: AlloySectionId): Record<string, string> {
    const entry = ALLOY_SECTION_MAP[id];
    if (!entry) return {};
    return {
        "data-alloy-section-id": entry.id,
        "data-alloy-section-name": entry.name,
        "data-alloy-section-owner": entry.owner,
        "data-alloy-section-blocking": entry.blocking ? "true" : "false",
        "data-alloy-section-cache": entry.cache,
    };
}
