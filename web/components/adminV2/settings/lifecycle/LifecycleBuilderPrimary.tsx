"use client";

import { useCallback, useEffect, useState } from "react";
import LifecycleCatalogSelect from "@/components/adminV2/settings/lifecycle/LifecycleCatalogSelect";
import LifecycleActivationBoard from "@/components/adminV2/settings/lifecycle/LifecycleActivationBoard";
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
export default function LifecycleBuilderPrimary() {
    const { orgId, userId } = useAdminAuth();
    const [catalog, setCatalog] = useState<LifecycleCatalogEntry[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [identity, setIdentity] = useState<LifecycleRuntimeIdentity | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [repairingId, setRepairingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<LifecycleCatalogEntry | null>(null);
    const [deleting, setDeleting] = useState(false);

    const selectedCatalogEntry = identity ? findCatalogEntryForIdentity(catalog, identity) : null;
    const selectedCatalogId = selectedCatalogEntry?.id ?? (creatingNew ? "__new__" : null);

    const loadCatalog = useCallback(async () => {
        setCatalogLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/lifecycle-catalog", lifecycleCatalogFetchInit());
            const j = (await res.json().catch(() => ({}))) as { items?: LifecycleCatalogEntry[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load Lifecycles");
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

    /** Drop stale selection when metadata cleanup removed catalog rows (not a catalog fallback). */
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
    }, []);

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
        [bumpWorkspace, loadCatalog, identity]
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
                        { ...workspaceDataFetchInit(), method: "DELETE" }
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
        [bumpWorkspace, loadCatalog, identity?.lifecycleId]
    );

    const onDeleteClick = useCallback((entry: LifecycleCatalogEntry) => {
        setDeleteConfirmTarget(entry);
    }, []);

    return (
        <div className="space-y-1.5" data-testid="lifecycle-builder-primary">
            {isLifecycleDebugUiEnabled() ? (
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
            ) : null}
            {error ? (
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            <LifecycleCatalogSelect
                items={catalog}
                selectedId={selectedCatalogId}
                loading={catalogLoading}
                onSelect={selectCatalogEntry}
                onCreateNew={() => {
                    setCreatingNew(true);
                    setIdentity(null);
                }}
            />

            {creatingNew || selectedCatalogEntry ? (
                <LifecycleActivationBoard
                    key={creatingNew ? "new" : selectedCatalogEntry!.id}
                    identity={
                        creatingNew
                            ? identity
                            : selectedCatalogEntry
                              ? buildIdentityFromCatalogEntry(selectedCatalogEntry)
                              : null
                    }
                    catalog={catalog}
                    creatingNew={creatingNew}
                    onIdentityChange={setIdentity}
                    onCatalogRefresh={() => void loadCatalog()}
                    onWorkspaceBust={bumpWorkspace}
                    onUseRuntimeDepartment={useRuntimeDepartment}
                    onLifecycleCreated={async (deptId, procId, name) => {
                        const interim = buildIdentityForNewLifecycle(deptId, procId, name);
                        setIdentity(interim);
                        if (isLifecycleDebugUiEnabled()) {
                            console.info("[lifecycle-create] primary selection after create", {
                                lifecycleName: name,
                                runtimeDepartmentId: deptId,
                                processId: procId,
                                lifecycleCatalogId: interim.lifecycleId,
                            });
                        }
                        bumpWorkspace();
                        const items = await loadCatalog();
                        const id = lifecycleCatalogId(deptId, procId);
                        const row = items.find((c) => c.id === id);
                        setIdentity(
                            row ? buildIdentityFromCatalogEntry(row) : interim
                        );
                        setCreatingNew(false);
                    }}
                    onDeleted={() => {
                        setIdentity(null);
                        setCreatingNew(false);
                        void loadCatalog();
                    }}
                    onRequestDelete={() => {
                        const entry =
                            selectedCatalogEntry ??
                            (identity && catalog.length
                                ? findCatalogEntryForIdentity(catalog, identity)
                                : null);
                        if (entry?.can_delete) onDeleteClick(entry);
                    }}
                    canDeleteLifecycle={selectedCatalogEntry?.can_delete ?? false}
                    onRepairVisibility={
                        selectedCatalogEntry?.can_repair
                            ? () => void repairEntry(selectedCatalogEntry)
                            : undefined
                    }
                    repairingVisibility={repairingId === selectedCatalogEntry?.id}
                />
            ) : null}

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
