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
/** See `AlloySectionEntry.applicability`. */
export type AlloySectionApplicability = "always" | "exclusive" | "when_open" | "never";

export type AlloySectionCache = "bootstrap" | "session" | "network" | "snapshot" | "none";

export type AlloySectionEntry = {
    /** Stable id, e.g. "WU-02". */
    id: string;
    surface: AlloySurface;
    /** Human-readable section name (kept short — also emitted as `data-alloy-section-name`). */
    name: string;
    /**
     * The file that renders this section's DOM root — the element `alloySectionDomAttrs(id)` is
     * spread onto, which is what `data-alloy-section-owner` attributes the section to.
     *
     * `null` means NO renderer in the current build: the section is registered but nothing paints
     * it. A null owner emits no owner attribute rather than naming a file that does not exist.
     */
    owner: string | null;
    /** Why `owner` is null. Required whenever it is. */
    ownerNote?: string;
    /**
     * The section's pre-registry DOM name (`data-alloy-section="WU.HEADER"`), where one exists.
     *
     * These were hand-written on the roots and are load-bearing — the runtime split controller and
     * the acceptance suites select on them. They are emitted FROM HERE so the registry is the one
     * source of section identity instead of a second, drifting copy in the components.
     */
    legacyDomSection?: string;
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
    /**
     * WHEN this section is expected in the DOM. Coverage is a registry question, not a harness one:
     * a measurement run must be able to compute "which blocking sections must be here" from the
     * registry alone, or every absence becomes an argument.
     *
     *   always     — expected whenever the surface renders
     *   exclusive  — one of `exclusiveGroup` is expected; which one depends on runtime state
     *   when_open  — only once an operator opens it
     *   never      — nothing renders it (must pair with owner: null)
     */
    applicability: AlloySectionApplicability;
    /** For `exclusive`: the group in which exactly one member is expected to render. */
    exclusiveGroup?: string;
    /**
     * A shell that WRAPS other sections rather than painting first-order content itself.
     *
     * Completion attribution needs this stated, not inferred. The structural test — "does this
     * element currently contain another registered section" — is right whenever the inner sections
     * exist, and silently wrong when they do not: with WU-09 unidentified, the shell contains
     * nothing registered, reads as a leaf, and takes ownership of the whole surface again. That is
     * the failure this flag closes, and it is a property of the section, so it lives here and not
     * as a list of ids inside a measurement harness.
     */
    container?: boolean;
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
        applicability: "always",
        container: true,
    },
    {
        id: "WU-01",
        surface: "work_unit",
        name: "Work Unit Context Header",
        owner: "web/components/presentation/workspace/WorkspaceHeader.tsx",
        legacyDomSection: "WU.HEADER",
        dataSource: "operational bootstrap (work unit title, process label, lane context)",
        blocking: true,
        cache: "bootstrap",
        applicability: "always",
    },
    {
        id: "WU-02",
        surface: "work_unit",
        name: "Work Unit KPI Strip",
        owner: "web/components/presentation/workspace/WorkspaceHeader.tsx",
        legacyDomSection: "WU.HEADER_CALCULATIONS",
        dataSource: "bootstrap/cache placement KPI snapshot (default snapshot until first load)",
        blocking: false,
        cache: "snapshot",
        applicability: "always",
        snapshot: true,
    },
    {
        id: "WU-03",
        surface: "work_unit",
        name: "Work View / Lane Pills",
        owner: "web/components/presentation/workUnit/WorkViewPillStrip.tsx",
        legacyDomSection: "WU.WORK_VIEW_PILLS",
        dataSource: "operational bootstrap queue summaries / perspectives rail",
        blocking: true,
        cache: "bootstrap",
        applicability: "always",
    },
    {
        id: "WU-04",
        surface: "work_unit",
        name: "Queue Header",
        owner: "web/components/presentation/workUnit/QueueRegion.tsx",
        dataSource: "queue definition + active lane summary (bootstrap, refreshed)",
        blocking: true,
        cache: "bootstrap",
        applicability: "always",
    },
    {
        id: "WU-05",
        surface: "work_unit",
        name: "Condensed Queue Rows",
        owner: "web/components/presentation/workUnit/QueueRegion.tsx",
        dataSource: "primary lane rows (bootstrap inline, then quiet network refresh)",
        blocking: true,
        blockingNote: "WU-05 or WU-06 (whichever resolves) blocks",
        cache: "bootstrap",
        applicability: "exclusive",
        exclusiveGroup: "queue_body",
    },
    {
        id: "WU-06",
        surface: "work_unit",
        name: "Queue Preparing / Empty State",
        owner: "web/components/presentation/workUnit/QueueRegion.tsx",
        dataSource: "operational mode entry controller (preparing) / known-empty lane",
        blocking: true,
        blockingNote: "WU-05 or WU-06 (whichever resolves) blocks",
        cache: "none",
        applicability: "exclusive",
        exclusiveGroup: "queue_body",
    },
    {
        id: "WU-07",
        surface: "work_unit",
        name: "Focus Panel Shell",
        owner: "web/components/presentation/workUnit/InlineOpportunityFocusPanel.tsx",
        // Was EntityDrawerOperatingShell, which NOTHING renders: its only reference is a pure
        // re-export (subjectSurface/FocusPanelShell), nothing imports that, and no caller ever
        // passed focusPanelPresentation, so the attributes could not be emitted even if it did.
        // The region itself is real and blocking — the inline Focus Panel paints exactly this
        // chrome + subject identity before the VM payload — so the owner moved to the live host
        // rather than the section being quietly downgraded to make coverage green.
        dataSource: "drawer chrome + subject identity (shell renders before VM payload)",
        blocking: true,
        cache: "session",
        applicability: "always",
    },
    {
        id: "WU-08",
        surface: "work_unit",
        name: "Focus Panel Mode Control",
        owner: "web/components/admin/focusPanel/FocusPanelModeSwitch.tsx",
        dataSource: "static UI (Summary / Work / Activity tablist)",
        blocking: true,
        cache: "none",
        applicability: "always",
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
        applicability: "exclusive",
        exclusiveGroup: "focus_panel_mode",
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
        applicability: "exclusive",
        exclusiveGroup: "focus_panel_mode",
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
        applicability: "exclusive",
        exclusiveGroup: "focus_panel_mode",
    },
    {
        id: "WU-12",
        surface: "work_unit",
        name: "Right Rail Actions",
        owner: "web/components/presentation/rightRail/WorkUnitRightRailActions.tsx",
        dataSource: "actions right-rail bundle",
        blocking: false,
        blockingNote: "shell renders without blocking core reveal",
        cache: "network",
        applicability: "always",
    },
    {
        id: "WU-13",
        surface: "work_unit",
        name: "Right Rail Workflow Telemetry",
        owner: null,
        ownerNote: "Retired with the Work Unit automation rail; no component renders it.",
        dataSource: "workflow runs / summary telemetry",
        blocking: false,
        blockingNote: "shell renders without blocking core reveal",
        cache: "network",
        applicability: "never",
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
        applicability: "always",
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
        applicability: "when_open",
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
        applicability: "always",
        container: true,
    },
    {
        id: "WS-01",
        surface: "workspace",
        name: "Workspace Resume Chip",
        owner: null,
        ownerNote: "Retired with the workspace resume chip; no component renders it.",
        dataSource: "session resume state",
        blocking: false,
        cache: "session",
        applicability: "never",
    },
    {
        id: "WS-02",
        surface: "workspace",
        name: "Workspace Title / Command Center Header",
        owner: "web/components/presentation/workspace/WorkspaceHeader.tsx",
        legacyDomSection: "WS.HEADER",
        dataSource: "org / command center header (bootstrap)",
        blocking: true,
        cache: "bootstrap",
        applicability: "always",
    },
    {
        id: "WS-03",
        surface: "workspace",
        name: "Workspace Health KPI Strip",
        owner: "web/components/presentation/workspace/WorkspaceHeader.tsx",
        legacyDomSection: "WS.HEADER_CALCULATIONS",
        dataSource: "OIP health snapshot (cache/default snapshot)",
        blocking: false,
        cache: "snapshot",
        applicability: "always",
        snapshot: true,
    },
    {
        id: "WS-04",
        surface: "workspace",
        name: "Operational Pulse / Primary KPI Area",
        owner: null,
        ownerNote: "Folded into the workspace header KPI strip (WS-03); nothing renders it.",
        dataSource: "operational pulse snapshot (cache/default snapshot)",
        blocking: false,
        cache: "snapshot",
        applicability: "never",
        snapshot: true,
    },
    {
        id: "WS-05",
        surface: "workspace",
        name: "Business Process Tiles",
        owner: "web/components/presentation/workspace/ProcessGrid.tsx",
        dataSource: "lifecycle catalog + departments (bootstrap)",
        blocking: true,
        cache: "bootstrap",
        applicability: "always",
    },
    {
        id: "WS-06",
        surface: "workspace",
        name: "Workspace Process Tile KPI Snapshot",
        owner: "web/components/presentation/workspace/ProcessSummaryCard.tsx",
        legacyDomSection: "WS.PROCESS_SUMMARY_CARD",
        dataSource: "per-tile metric snapshot (cache/default snapshot)",
        blocking: false,
        cache: "snapshot",
        applicability: "always",
        snapshot: true,
    },
    {
        id: "WS-07",
        surface: "workspace",
        name: "Right Rail Actions",
        owner: "web/components/presentation/rightRail/WorkspaceRightRailActions.tsx",
        dataSource: "workspace-root actions bundle",
        blocking: false,
        cache: "network",
        applicability: "always",
    },
    {
        id: "WS-08",
        surface: "workspace",
        name: "Right Rail Workflow Telemetry",
        owner: "web/app/adminV2/components/workspace/CommandRailDefaultEmptyTelemetry.tsx",
        dataSource: "workflow telemetry (default empty on workspace root)",
        blocking: false,
        cache: "network",
        applicability: "always",
    },
    {
        id: "WS-09",
        surface: "workspace",
        name: "BOS Rail",
        owner: "web/app/adminV2/components/CommandRailBosMount.tsx",
        dataSource: "BOS assistant panel (lazy)",
        blocking: false,
        cache: "network",
        applicability: "always",
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
        applicability: "when_open",
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
        // A section with no renderer names no owner, rather than a file that is not there.
        ...(entry.owner ? { "data-alloy-section-owner": entry.owner } : {}),
        "data-alloy-section-blocking": entry.blocking ? "true" : "false",
        "data-alloy-section-cache": entry.cache,
        // Stated, so completion attribution never has to infer it from what happens to be inside.
        ...(entry.container ? { "data-alloy-section-container": "true" } : {}),
        // The pre-registry name, emitted from the registry so the components hold no second copy.
        ...(entry.legacyDomSection ? { "data-alloy-section": entry.legacyDomSection } : {}),
    };
}


/**
 * EXPECTED BLOCKING COVERAGE for the canonical Work Unit / Summary shape.
 *
 * The rule lives here rather than in the measurement harness on purpose. A harness that keeps its
 * own idea of "which sections should be present" can always be adjusted until a run goes green —
 * which is exactly how WU-07 sat absent and unexplained while coverage was reported as complete.
 *
 * `exclusive` groups contribute their ACTIVE member, which the caller supplies from observed state
 * (Summary mode, queue showing rows). Everything else is derived.
 */
export function expectedBlockingSections(active: {
    focusPanelMode: "summary" | "work" | "activity";
    queueBody: "rows" | "placeholder";
}): string[] {
    const activeOf: Record<string, string> = {
        focus_panel_mode: { summary: "WU-09", work: "WU-10", activity: "WU-11" }[active.focusPanelMode],
        queue_body: active.queueBody === "rows" ? "WU-05" : "WU-06",
    };
    return ALLOY_SECTION_LIST.filter((e) => {
        if (e.surface !== "work_unit" || !e.blocking) return false;
        if (e.applicability === "never" || e.applicability === "when_open") return false;
        // A container wraps other sections and never owns completion, so it is not a coverage target.
        if (e.container) return false;
        if (e.applicability === "exclusive") return activeOf[e.exclusiveGroup ?? ""] === e.id;
        return true;
    }).map((e) => e.id).sort();
}
