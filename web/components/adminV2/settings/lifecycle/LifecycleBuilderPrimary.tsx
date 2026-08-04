"use client";

/**
 * Business Processes primary UX — Collection → Selected Process → Focused Workspace, same
 * family as Access Users and Tuition Plans. Reuses the existing lifecycle catalog + builder
 * APIs only; no new process/stage runtime and no parallel builder.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import LifecycleActivationBoard from "@/components/adminV2/settings/lifecycle/LifecycleActivationBoard";
import BusinessProcessCollectionRail, {
    businessProcessHealthHint,
    businessProcessStageSummary,
} from "@/components/adminV2/settings/businessProcess/BusinessProcessCollectionRail";
import {
    ConfigurationEmptyState,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { lifecycleCatalogId } from "@/lib/lifecycle/lifecycleCatalog";
import {
    applyRuntimeDepartmentId,
    buildIdentityForNewLifecycle,
    buildIdentityFromCatalogEntry,
    findCatalogEntryForIdentity,
    syncCatalogToRuntimeIdentity,
    type LifecycleRuntimeIdentity,
} from "@/lib/lifecycle/lifecycleRuntimeIdentity";
import { notifyWorkspaceDepartmentsChanged } from "@/lib/workspace/notifyWorkspaceDepartmentsChanged";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { lifecycleCatalogFetchInit, workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import AdminAccessScopeDebugPanel from "@/components/adminV2/settings/lifecycle/AdminAccessScopeDebugPanel";
import LifecycleActivationDeleteModal from "@/components/adminV2/settings/lifecycle/LifecycleActivationDeleteModal";
import LifecycleDevCreateVerifyButton from "@/components/adminV2/settings/lifecycle/LifecycleDevCreateVerifyButton";
import LifecycleTestCleanupButton from "@/components/adminV2/settings/lifecycle/LifecycleTestCleanupButton";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import {
    BUSINESS_PROCESS_EDIT_ACTION,
    BUSINESS_PROCESS_HEADER_TABS,
    BUSINESS_PROCESS_MORE_ACTION,
    BUSINESS_PROCESS_NO_SELECTION_DESCRIPTION,
    BUSINESS_PROCESS_NO_SELECTION_TITLE,
    normalizeBusinessProcessSection,
    type BusinessProcessWorkspaceSection,
} from "@/lib/lifecycle/businessProcessUiLabels";

export default function LifecycleBuilderPrimary({
    contextActions = null,
    onContextActionsChange,
    initialSection,
    initialProcessId,
}: {
    contextActions?: ReactNode;
    onContextActionsChange?: (actions: ReactNode) => void;
    initialSection?: string;
    initialProcessId?: string;
} = {}) {
    const { orgId, userId } = useAdminAuth();
    const [catalog, setCatalog] = useState<LifecycleCatalogEntry[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [identity, setIdentity] = useState<LifecycleRuntimeIdentity | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [repairingId, setRepairingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<LifecycleCatalogEntry | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [activeSection, setActiveSection] = useState<BusinessProcessWorkspaceSection>(
        normalizeBusinessProcessSection(initialSection),
    );
    const [moreOpen, setMoreOpen] = useState(false);
    const [renameTrigger, setRenameTrigger] = useState<(() => void) | null>(null);
    const [didApplyInitialProcessId, setDidApplyInitialProcessId] = useState(false);

    const selectedCatalogEntry = identity ? findCatalogEntryForIdentity(catalog, identity) : null;
    const selectedCatalogId = selectedCatalogEntry?.id ?? (creatingNew ? "__new__" : null);

    const loadCatalog = useCallback(async () => {
        setCatalogLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/lifecycle-catalog", lifecycleCatalogFetchInit());
            const j = (await res.json().catch(() => ({}))) as { items?: LifecycleCatalogEntry[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load processes");
            const items = j.items ?? [];
            setCatalog(items);
            return items;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load catalog");
            setCatalog([]);
            return [] as LifecycleCatalogEntry[];
        } finally {
            setCatalogLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadCatalog();
    }, [loadCatalog]);

    useEffect(() => {
        if (catalogLoading || creatingNew || !identity) return;
        if (!findCatalogEntryForIdentity(catalog, identity)) {
            setIdentity(null);
        }
    }, [catalog, catalogLoading, creatingNew, identity]);

    const bumpWorkspace = useCallback(() => {
        notifyWorkspaceDepartmentsChanged(orgId, userId, null);
    }, [orgId, userId]);

    const selectCatalogEntry = useCallback((entry: LifecycleCatalogEntry) => {
        setIdentity(buildIdentityFromCatalogEntry(entry));
        setCreatingNew(false);
        setMoreOpen(false);
    }, []);

    // Auto-select on catalog load: prefer an explicit `?processId=` deep link, otherwise the
    // first catalog entry (operator convenience — avoids empty-state friction on first load).
    useEffect(() => {
        if (catalogLoading || creatingNew || identity || !catalog.length) return;
        if (!didApplyInitialProcessId && initialProcessId) {
            setDidApplyInitialProcessId(true);
            const match = catalog.find((entry) => entry.id === initialProcessId);
            if (match) {
                selectCatalogEntry(match);
                return;
            }
        }
        selectCatalogEntry(catalog[0]!);
    }, [catalog, catalogLoading, creatingNew, identity, initialProcessId, didApplyInitialProcessId, selectCatalogEntry]);

    const useRuntimeDepartment = useCallback(() => {
        if (!identity) return;
        const synced = syncCatalogToRuntimeIdentity(identity, catalog);
        setIdentity(synced);
        const row = findCatalogEntryForIdentity(catalog, synced);
        if (!row) {
            void loadCatalog().then(() => {
                setIdentity((prev) => (prev ? syncCatalogToRuntimeIdentity(prev, catalog) : prev));
            });
        }
    }, [identity, catalog, loadCatalog]);

    const repairEntry = useCallback(
        async (entry: LifecycleCatalogEntry) => {
            const baseIdentity = identity ?? buildIdentityFromCatalogEntry(entry);
            setRepairingId(entry.id);
            setError(null);
            try {
                const res = await fetch("/api/admin/lifecycle-catalog/repair", {
                    ...workspaceDataFetchInit(),
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        department_id: baseIdentity.runtimeDepartmentId,
                        process_id: baseIdentity.processId,
                    }),
                });
                const j = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    department_id?: string;
                    entry?: LifecycleCatalogEntry;
                };
                if (!res.ok) throw new Error(j.error ?? "Repair failed");
                bumpWorkspace();
                await loadCatalog();
                const runtimeId = (j.department_id ?? baseIdentity.runtimeDepartmentId).trim();
                let nextIdentity: LifecycleRuntimeIdentity;
                if (j.entry) {
                    nextIdentity = buildIdentityFromCatalogEntry(j.entry);
                } else {
                    const refreshed = (await fetch("/api/admin/lifecycle-catalog", workspaceDataFetchInit())
                        .then((r) => r.json())
                        .catch(() => ({}))) as { items?: LifecycleCatalogEntry[] };
                    const items = refreshed.items ?? [];
                    const row =
                        items.find((x) => x.department_id === runtimeId && x.process_id === baseIdentity.processId) ??
                        items.find((x) => x.id === lifecycleCatalogId(runtimeId, baseIdentity.processId));
                    nextIdentity = row
                        ? buildIdentityFromCatalogEntry(row)
                        : applyRuntimeDepartmentId(baseIdentity, runtimeId, items);
                }
                setIdentity(nextIdentity);
                setCreatingNew(false);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Repair failed");
            } finally {
                setRepairingId(null);
            }
        },
        [bumpWorkspace, loadCatalog, identity],
    );

    const deleteEntry = useCallback(
        async (entry: LifecycleCatalogEntry, legacyConfirm = false) => {
            const runtimeId = (identity?.runtimeDepartmentId ?? entry.department_id).trim();
            setDeleting(true);
            setError(null);
            try {
                if (entry.activation_owned) {
                    const res = await fetch(
                        `/api/admin/departments/${encodeURIComponent(runtimeId)}/lifecycle-activation`,
                        { ...workspaceDataFetchInit(), method: "DELETE" },
                    );
                    const j = (await res.json().catch(() => ({}))) as { error?: string };
                    if (!res.ok) throw new Error(j.error ?? "Delete failed");
                } else {
                    const res = await fetch("/api/admin/lifecycle-catalog/delete", {
                        ...workspaceDataFetchInit(),
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            department_id: entry.department_id,
                            process_id: entry.process_id,
                            legacy_delete_confirm: legacyConfirm,
                        }),
                    });
                    const j = (await res.json().catch(() => ({}))) as { error?: string };
                    if (!res.ok) throw new Error(j.error ?? "Delete failed");
                }
                bumpWorkspace();
                if (identity?.lifecycleId === entry.id) {
                    setIdentity(null);
                    setCreatingNew(false);
                }
                setDeleteConfirmTarget(null);
                await loadCatalog();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Delete failed");
            } finally {
                setDeleting(false);
            }
        },
        [bumpWorkspace, loadCatalog, identity?.lifecycleId],
    );

    const onDeleteClick = useCallback((entry: LifecycleCatalogEntry) => {
        setDeleteConfirmTarget(entry);
    }, []);

    /**
     * Stable identity, deliberately.
     *
     * This was an inline arrow in the JSX below. It is a dependency of the
     * `processContextActions` memo inside LifecycleActivationBoard, which publishes its result
     * into `ProcessesConfigurationPage` state. A handler reborn on every render made that memo
     * recompute on every render, which re-fired the publish effect, which set state in an
     * ancestor, which re-rendered this component — an unbounded loop that pinned the main thread
     * and left `/organization/processes` stuck on "Loading process…", unscrollable, and
     * unresponsive to navigation.
     *
     * Anything passed into that memo must keep a stable identity across renders.
     */
    const handleRepairVisibility = useCallback(() => {
        if (selectedCatalogEntry) void repairEntry(selectedCatalogEntry);
    }, [selectedCatalogEntry, repairEntry]);

    /**
     * Same hazard, second instance. The board publishes its rename trigger through an effect keyed
     * on this prop's identity, so an inline arrow here meant: effect runs → state set → this
     * component re-renders → new arrow → effect runs again, forever. `() => trigger` is still
     * required, because passing a bare function to a state setter is read as an updater.
     */
    const handleRenameTriggerReady = useCallback((trigger: () => void) => {
        setRenameTrigger(() => trigger);
    }, []);

    /**
     * Everything below exists for one reason: LifecycleActivationBoard folds these props into
     * `processContextActions`, a memo whose result it publishes into an ancestor's state. Any prop
     * rebuilt on each render makes that memo recompute, which republishes, which re-renders this
     * component, which rebuilds the prop. `identity` was the worst of them — a fresh object every
     * single render.
     *
     * Treat props handed to that board as part of a memo dependency list, because they are.
     */
    const boardIdentity = useMemo(
        () => (selectedCatalogEntry ? buildIdentityFromCatalogEntry(selectedCatalogEntry) : null),
        [selectedCatalogEntry],
    );

    const handleCatalogRefresh = useCallback(() => {
        void loadCatalog();
    }, [loadCatalog]);

    const handleRequestDelete = useCallback(() => {
        if (selectedCatalogEntry?.can_delete) onDeleteClick(selectedCatalogEntry);
    }, [selectedCatalogEntry, onDeleteClick]);

    const handleDeleted = useCallback(() => {
        setIdentity(null);
        setCreatingNew(false);
        void loadCatalog();
    }, [loadCatalog]);

    /**
     * Collapsed once a process is open. Manual toggling wins for the rest of the session —
     * the effect below only reacts to a *change* in whether anything is selected, so a director
     * who reopens the rail keeps it open while they browse stages.
     */
    const [railCollapsed, setRailCollapsed] = useState(false);
    const hasSelection = Boolean(selectedCatalogEntry) || creatingNew;
    const prevHasSelection = useRef(hasSelection);
    useEffect(() => {
        if (prevHasSelection.current !== hasSelection) {
            prevHasSelection.current = hasSelection;
            setRailCollapsed(hasSelection);
        }
    }, [hasSelection]);

    const headerMeta = useMemo(() => {
        if (!selectedCatalogEntry) return null;
        return `${businessProcessStageSummary(selectedCatalogEntry)} · ${businessProcessHealthHint(selectedCatalogEntry)}`;
    }, [selectedCatalogEntry]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="lifecycle-builder-primary">
            <h1 className="sr-only">Business Processes</h1>
            {isLifecycleDebugUiEnabled() ?
                <>
                    <AdminAccessScopeDebugPanel surface="lifecycle" />
                    <LifecycleDevCreateVerifyButton />
                    <LifecycleTestCleanupButton
                        onCleaned={async () => {
                            bumpWorkspace();
                            setIdentity(null);
                            setCreatingNew(false);
                            await loadCatalog();
                        }}
                    />
                </>
            :   null}
            {error ?
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            :   null}

            {/* The rail is navigation; the workspace is the work. With a process selected the
                rail held two cards and ~550px of nothing while the editor beside it truncated
                its own dropdowns — so it collapses to a strip and the width goes to the work.
                One click restores it, and the collapse is remembered for the session. */}
            <div
                // `grid-rows-[minmax(0,1fr)]` is load-bearing. Grid rows size to content by
                // default, so the row grew to the full height of the stage editor and every
                // descendant inherited that unbounded height — including the workspace, whose
                // `overflow-y: auto` then had nothing to overflow. The Stages surface simply
                // could not be scrolled. Bounding the row to the grid's own height restores it.
                className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] items-start gap-4 ${
                    railCollapsed
                        ? "xl:grid-cols-[2.75rem_minmax(0,1fr)]"
                        : "xl:grid-cols-[22rem_minmax(0,1fr)]"
                }`}
                data-testid="business-process-collection-shell"
                data-rail-collapsed={railCollapsed ? "true" : "false"}
            >
                <BusinessProcessCollectionRail
                    items={catalog}
                    selectedId={selectedCatalogId}
                    loading={catalogLoading}
                    collapsed={railCollapsed}
                    onToggleCollapsed={() => setRailCollapsed((v) => !v)}
                    onSelect={selectCatalogEntry}
                    onCreateNew={() => {
                        setCreatingNew(true);
                        setIdentity(null);
                        setMoreOpen(false);
                    }}
                />

                {/* `self-stretch` + `min-h-0`: the grid keeps `items-start` so the collection rail
                    stays top-aligned, but the selected process must fill the bounded row and be
                    allowed to shrink, or its children cannot establish a scroll viewport. */}
                <main
                    className="flex min-h-0 min-w-0 flex-col self-stretch"
                    data-testid="business-process-selected-main"
                >
                    {creatingNew || selectedCatalogEntry ? (
                        creatingNew ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <LifecycleActivationBoard
                                    key="new"
                                    initialSection={activeSection}
                                    identity={identity}
                                    catalog={catalog}
                                    creatingNew
                                    onIdentityChange={setIdentity}
                                    onCatalogRefresh={() => void loadCatalog()}
                                    onWorkspaceBust={bumpWorkspace}
                                    onUseRuntimeDepartment={useRuntimeDepartment}
                                    onLifecycleCreated={async (deptId, procId, name) => {
                                        const interim = buildIdentityForNewLifecycle(deptId, procId, name);
                                        setIdentity(interim);
                                        bumpWorkspace();
                                        const items = await loadCatalog();
                                        const id = lifecycleCatalogId(deptId, procId);
                                        const row = items.find((c) => c.id === id);
                                        setIdentity(row ? buildIdentityFromCatalogEntry(row) : interim);
                                        setCreatingNew(false);
                                    }}
                                    onDeleted={() => {
                                        setIdentity(null);
                                        setCreatingNew(false);
                                        void loadCatalog();
                                    }}
                                    canDeleteLifecycle={false}
                                    onBackToCatalog={() => {
                                        setCreatingNew(false);
                                        setIdentity(null);
                                    }}
                                    onContextActionsChange={onContextActionsChange}
                                />
                            </div>
                        ) : selectedCatalogEntry ? (
                            <div className="flex min-h-0 flex-1 flex-col gap-3">
                                <section
                                    className="process-config-setup-card p-5 shrink-0"
                                    data-testid="business-process-selected-header"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                                    {selectedCatalogEntry.lifecycle_name}
                                                </h2>
                                                <span
                                                    className={`locations-collection-row__status ${
                                                        selectedCatalogEntry.workspace.department_is_active
                                                            ? "locations-collection-row__status--active"
                                                            : ""
                                                    }`}
                                                    data-testid="business-process-selected-status"
                                                >
                                                    {selectedCatalogEntry.workspace.department_is_active
                                                        ? "Active"
                                                        : "Inactive"}
                                                </span>
                                            </div>
                                            {headerMeta ?
                                                <p
                                                    className="mt-1 text-sm text-alloy-midnight/55"
                                                    data-testid="business-process-selected-meta"
                                                >
                                                    {headerMeta}
                                                </p>
                                            :   null}
                                        </div>
                                        <div className="relative flex flex-wrap gap-2">
                                            <ConfigurationSecondaryButton
                                                onClick={() => renameTrigger?.()}
                                                disabled={!renameTrigger}
                                                data-testid="business-process-edit"
                                            >
                                                {BUSINESS_PROCESS_EDIT_ACTION}
                                            </ConfigurationSecondaryButton>
                                            <ConfigurationSecondaryButton
                                                onClick={() => setMoreOpen((open) => !open)}
                                                data-testid="business-process-more"
                                            >
                                                {BUSINESS_PROCESS_MORE_ACTION}
                                            </ConfigurationSecondaryButton>
                                            {moreOpen && contextActions ?
                                                <div
                                                    className="absolute right-0 top-full z-10 mt-1"
                                                    data-testid="business-process-more-menu"
                                                >
                                                    {contextActions}
                                                </div>
                                            :   null}
                                        </div>
                                    </div>
                                    <ConfigWorkspaceTabBar
                                        tabs={BUSINESS_PROCESS_HEADER_TABS}
                                        activeSection={activeSection}
                                        onSectionChange={setActiveSection}
                                        ariaLabel="Business process sections"
                                        testIdPrefix="business-process-tab"
                                    />
                                </section>

                                <div className="flex min-h-0 flex-1 flex-col">
                                    <LifecycleActivationBoard
                                        key={selectedCatalogEntry.id}
                                        initialSection={activeSection}
                                        activeProcessSection={activeSection}
                                        onProcessSectionChange={setActiveSection}
                                        onRenameTriggerReady={handleRenameTriggerReady}
                                        identity={boardIdentity}
                                        catalog={catalog}
                                        creatingNew={false}
                                        onIdentityChange={setIdentity}
                                        onCatalogRefresh={handleCatalogRefresh}
                                        onWorkspaceBust={bumpWorkspace}
                                        onUseRuntimeDepartment={useRuntimeDepartment}
                                        onDeleted={handleDeleted}
                                        onRequestDelete={handleRequestDelete}
                                        canDeleteLifecycle={selectedCatalogEntry.can_delete}
                                        onRepairVisibility={
                                            selectedCatalogEntry.can_repair ? handleRepairVisibility : undefined
                                        }
                                        repairingVisibility={repairingId === selectedCatalogEntry.id}
                                        catalogSummary={{
                                            trackCount: selectedCatalogEntry.track_count,
                                            stageCount: selectedCatalogEntry.stage_count,
                                            queueCount: selectedCatalogEntry.work_unit_count,
                                        }}
                                        onBackToCatalog={() => {
                                            setCreatingNew(false);
                                            setIdentity(null);
                                        }}
                                        onContextActionsChange={onContextActionsChange}
                                    />
                                </div>
                            </div>
                        ) : null
                    ) : (
                        <ConfigurationEmptyState
                            testId="business-process-no-selection"
                            title={BUSINESS_PROCESS_NO_SELECTION_TITLE}
                            description={BUSINESS_PROCESS_NO_SELECTION_DESCRIPTION}
                        />
                    )}
                </main>
            </div>

            <LifecycleActivationDeleteModal
                open={deleteConfirmTarget != null}
                lifecycleName={deleteConfirmTarget?.lifecycle_name ?? ""}
                busy={deleting}
                legacy={
                    deleteConfirmTarget != null &&
                    deleteConfirmTarget.source === "legacy" &&
                    !deleteConfirmTarget.activation_owned
                }
                onCancel={() => setDeleteConfirmTarget(null)}
                onConfirm={() => {
                    if (!deleteConfirmTarget) return;
                    const legacy =
                        deleteConfirmTarget.source === "legacy" && !deleteConfirmTarget.activation_owned;
                    void deleteEntry(deleteConfirmTarget, legacy);
                }}
            />
        </div>
    );
}
