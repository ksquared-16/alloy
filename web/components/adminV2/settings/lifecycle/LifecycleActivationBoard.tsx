"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import LifecycleCreateForm from "@/components/adminV2/settings/lifecycle/LifecycleCreateForm";
import LifecycleAddStageForm from "@/components/adminV2/settings/lifecycle/LifecycleAddStageForm";
import LifecycleActivationValidation from "@/components/adminV2/settings/lifecycle/LifecycleActivationValidation";
import LifecycleActivationDeleteModal from "@/components/adminV2/settings/lifecycle/LifecycleActivationDeleteModal";
import LifecycleActivationDeleteStageModal from "@/components/adminV2/settings/lifecycle/LifecycleActivationDeleteStageModal";
import LifecycleRenameModal from "@/components/adminV2/settings/lifecycle/LifecycleRenameModal";
import LifecycleStageNav from "@/components/adminV2/settings/lifecycle/LifecycleStageNav";
import LifecycleStageConfiguration from "@/components/adminV2/settings/lifecycle/LifecycleStageConfiguration";
import LifecycleActionsMatrix from "@/components/adminV2/settings/lifecycle/LifecycleActionsMatrix";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { notifyWorkspaceDepartmentsChanged } from "@/lib/workspace/notifyWorkspaceDepartmentsChanged";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    activeStagesForProcess,
    asOperatorStageKey,
    stageKeysForProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import LifecycleIdentitySyncBanner from "@/components/adminV2/settings/lifecycle/LifecycleIdentitySyncBanner";
import {
    applyRuntimeDepartmentId,
    buildIdentityForNewLifecycle,
    findCatalogEntryForIdentity,
    hasRuntimeDepartmentId,
    type LifecycleRuntimeIdentity,
} from "@/lib/lifecycle/lifecycleRuntimeIdentity";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import { useLifecycleStageBootstrap } from "@/lib/lifecycle/useLifecycleStageBootstrap";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    snapshotEnrollmentPipelineWorkUnit,
    type EnrollmentPipelineWorkUnitSnapshot,
} from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    collectAllOpportunityStatusRows,
    LIFECYCLE_ACTIVATION_STATUS_STAGES_PATH,
    resolveAssignedStatusKeysForStage,
    stageSavedStatusKeys,
} from "@/lib/lifecycle/lifecycleActivationStep3";
import { LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH } from "@/lib/lifecycle/lifecycleStageRuntimeConfigTypes";
import { resolveLifecycleStatusesSaveState } from "@/lib/lifecycle/lifecycleStatusesCardState";
import {
    logLifecycleStatusStepDebug,
    normalizeLifecycleBuilderStageKey,
    shouldSyncStatusDraftForStage,
    shouldApplyServerStatusKeysForStage,
    statusDraftKeysForStage,
} from "@/lib/lifecycle/lifecycleStatusStepDraft";
import {
    applyLifecycleStatusDraftAction,
    INITIAL_LIFECYCLE_STATUS_DRAFT_STATE,
    lifecycleStatusDraftReducer,
    type LifecycleStatusDraftAction,
} from "@/lib/lifecycle/lifecycleStatusDraftReducer";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { defaultWorkUnitQueueNameForStageKey } from "@/lib/lifecycle/lifecycleRuntimeBinding";

type DeptRow = {
    id: string;
    name: string | null;
    key: string | null;
    metadata?: Record<string, unknown> | null;
};
type WorkUnitApiRow = { id: string; key: string; name: string; is_active: boolean; queue_definition: unknown };

const PRIMARY_RECORD_LABEL = "Lead";

export default function LifecycleActivationBoard({
    identity,
    catalog = [],
    creatingNew = false,
    onIdentityChange,
    onCatalogRefresh,
    onWorkspaceBust,
    onUseRuntimeDepartment,
    onLifecycleCreated,
    onDeleted,
    onRequestDelete,
    canDeleteLifecycle = false,
    onRepairVisibility,
    repairingVisibility: repairingFromParent = false,
}: {
    identity: LifecycleRuntimeIdentity | null;
    catalog?: LifecycleCatalogEntry[];
    creatingNew?: boolean;
    onIdentityChange: (identity: LifecycleRuntimeIdentity) => void;
    onCatalogRefresh?: () => void | Promise<void>;
    onWorkspaceBust?: () => void;
    onUseRuntimeDepartment?: () => void;
    onLifecycleCreated?: (runtimeDepartmentId: string, processId: string, lifecycleName: string) => void | Promise<void>;
    onDeleted?: () => void;
    onRequestDelete?: () => void;
    /** False for protected shared Enrollment — delete API would reject. */
    canDeleteLifecycle?: boolean;
    onRepairVisibility?: () => void;
    repairingVisibility?: boolean;
}) {
    const runtimeDepartmentId = identity?.runtimeDepartmentId?.trim() ?? "";
    const catalogEntry =
        identity && catalog.length ? findCatalogEntryForIdentity(catalog, identity) : null;

    const [departmentName, setDepartmentName] = useState("");
    const [activationOwned, setActivationOwned] = useState(false);
    const [processId, setProcessId] = useState(identity?.processId ?? "");
    const [builderStages, setBuilderStages] = useState<LifecycleBuilderStageRecord[]>([]);
    const [showAddStage, setShowAddStage] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [lifecycleName, setLifecycleName] = useState(identity?.lifecycleName ?? "");
    const [lifecycleDescription, setLifecycleDescription] = useState("");
    const [stageKey, setStageKey] = useState("");
    const [stageLabel, setStageLabel] = useState("");
    const [workUnitId, setWorkUnitId] = useState<string | null>(null);
    const [workUnitName, setWorkUnitName] = useState<string | null>(null);
    const [statusKeys, setStatusKeys] = useState<string[]>([]);
    const [statusDisplayLabels, setStatusDisplayLabels] = useState<string[]>([]);
    const [pipeline, setPipeline] = useState<EnrollmentPipelineWorkUnitSnapshot | null>(null);
    const [workUnitNeedsSync, setWorkUnitNeedsSync] = useState(false);
    const [workUnitIdentityState, setWorkUnitIdentityState] = useState<
        "not_created" | "synced" | "needs_sync" | "conflict"
    >("not_created");
    const [loadingPipeline, setLoadingPipeline] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bootLoading, setBootLoading] = useState(true);

    const [statusesPayload, setStatusesPayload] = useState<EnrollmentStatusStagesPayload | null>(null);
    const [statusesLoading, setStatusesLoading] = useState(false);
    const [statusesError, setStatusesError] = useState<string | null>(null);
    const [statusesSaving, setStatusesSaving] = useState(false);
    const [statusDraft, dispatchStatusDraftReducer] = useReducer(
        lifecycleStatusDraftReducer,
        INITIAL_LIFECYCLE_STATUS_DRAFT_STATE
    );
    const statusDraftRef = useRef(statusDraft);
    const stageKeyRef = useRef("");

    stageKeyRef.current = stageKey;

    const dispatchStatusDraft = useCallback((action: LifecycleStatusDraftAction) => {
        statusDraftRef.current = applyLifecycleStatusDraftAction(statusDraftRef.current, action);
        dispatchStatusDraftReducer(action);
    }, []);

    const statusesSaveState = useMemo(
        () =>
            resolveLifecycleStatusesSaveState({
                stageKey,
                stageLabel,
                statusDraftByStageKey: statusDraft.draftByStage,
                statusDraftDirtyByStage: statusDraft.dirtyByStage,
                statusesLoading,
                statusesSaving,
            }),
        [
            stageKey,
            stageLabel,
            statusDraft.draftByStage,
            statusDraft.dirtyByStage,
            statusesLoading,
            statusesSaving,
        ]
    );
    const savedStatusKeys = useMemo(
        () => statusDraftKeysForStage(statusDraft.savedByStage, stageKey),
        [statusDraft.savedByStage, stageKey]
    );

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteStageOpen, setDeleteStageOpen] = useState(false);
    const [deletingStage, setDeletingStage] = useState(false);
    const [stageReorderBusy, setStageReorderBusy] = useState(false);
    const [runtimeSummary, setRuntimeSummary] = useState<"unknown" | "pass" | "fail">("unknown");
    const [repairingLocal, setRepairingLocal] = useState(false);
    const repairingBusy = repairingFromParent || repairingLocal;

    const { orgId, userId } = useAdminAuth();

    const bumpWorkspaceCache = useCallback(() => {
        notifyWorkspaceDepartmentsChanged(orgId, userId, null);
        onWorkspaceBust?.();
    }, [orgId, userId, onWorkspaceBust]);

    const repairWorkspaceVisibility = useCallback(async () => {
        if (!identity || !runtimeDepartmentId || !processId) return;
        setRepairingLocal(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/lifecycle-catalog/repair", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: runtimeDepartmentId,
                    process_id: processId,
                }),
            });
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                department_id?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Repair failed");
            const runtimeId = (j.department_id ?? runtimeDepartmentId).trim();
            onIdentityChange(applyRuntimeDepartmentId(identity, runtimeId, catalog));
            bumpWorkspaceCache();
            await onCatalogRefresh?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Repair failed");
        } finally {
            setRepairingLocal(false);
        }
    }, [identity, runtimeDepartmentId, processId, catalog, onIdentityChange, bumpWorkspaceCache, onCatalogRefresh]);

    const canConfirmStatuses = statusesSaveState.canSaveStatuses;
    const operatorStage = asOperatorStageKey(stageKey);

    const loadPipeline = useCallback(
        async (deptId: string) => {
            setLoadingPipeline(true);
            try {
                if (activationOwned && stageKey) {
                    const res = await fetch(
                        `/api/admin/enrollment-process/stage-work-unit?department_id=${encodeURIComponent(deptId)}&stage=${encodeURIComponent(stageKey)}`,
                        workspaceDataFetchInit()
                    );
                    const j = (await res.json().catch(() => ({}))) as {
                        snapshot?: EnrollmentPipelineWorkUnitSnapshot | null;
                        work_unit?: { id: string; key: string; name: string; is_active: boolean } | null;
                        identity?: {
                            state?: string;
                            work_unit_id?: string | null;
                        };
                        needs_sync?: boolean;
                    };
                    const snap = j.snapshot ?? null;
                    setPipeline(snap);
                    const identityState = j.identity?.state;
                    const needsSync = Boolean(j.needs_sync);
                    setWorkUnitNeedsSync(needsSync);
                    if (identityState === "conflict") {
                        setWorkUnitIdentityState("conflict");
                    } else if (!snap) {
                        setWorkUnitIdentityState("not_created");
                    } else if (needsSync) {
                        setWorkUnitIdentityState("needs_sync");
                    } else {
                        setWorkUnitIdentityState("synced");
                    }
                    if (snap) {
                        setWorkUnitId(snap.id);
                        setWorkUnitName(snap.name);
                    } else {
                        setWorkUnitId(null);
                        setWorkUnitName(null);
                    }
                    return;
                }
                const res = await fetch(
                    `/api/admin/work-units?department_id=${encodeURIComponent(deptId)}`,
                    workspaceDataFetchInit()
                );
                const j = (await res.json().catch(() => ({}))) as { items?: WorkUnitApiRow[] };
                const row = (j.items ?? []).find((w) => w.key === ENROLLMENT_PIPELINE_WORK_UNIT_KEY);
                const snap = row ? snapshotEnrollmentPipelineWorkUnit(row) : null;
                setPipeline(snap);
                if (snap) {
                    setWorkUnitId(snap.id);
                    setWorkUnitName(snap.name);
                } else {
                    setWorkUnitId(null);
                    setWorkUnitName(null);
                }
            } finally {
                setLoadingPipeline(false);
            }
        },
        [activationOwned, stageKey]
    );

    const loadStatusStages = useCallback(async (): Promise<EnrollmentStatusStagesPayload | null> => {
        if (!runtimeDepartmentId) return null;
        setStatusesLoading(true);
        setStatusesError(null);
        try {
            const res = await fetch(
                `${LIFECYCLE_ACTIVATION_STATUS_STAGES_PATH}?department_id=${encodeURIComponent(runtimeDepartmentId)}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load statuses");
            setStatusesPayload(j);
            return j;
        } catch (e) {
            setStatusesError(e instanceof Error ? e.message : "Failed to load statuses");
            setStatusesPayload(null);
            return null;
        } finally {
            setStatusesLoading(false);
        }
    }, [runtimeDepartmentId]);

    const labelsForKeys = useCallback((payload: EnrollmentStatusStagesPayload | null, keys: string[]) => {
        const rows = collectAllOpportunityStatusRows(payload);
        const m = new Map(rows.map((r) => [r.status_key, r.status_label]));
        return keys.map((k) => m.get(k) ?? k.replace(/_/g, " "));
    }, []);

    const syncStatusKeysFromPayload = useCallback(
        (payload: EnrollmentStatusStagesPayload | null, key: string, source: string) => {
            const normalized = normalizeLifecycleBuilderStageKey(key);
            if (!normalized) return;
            if (!shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, normalized)) {
                logLifecycleStatusStepDebug("sync-skipped-dirty-draft", {
                    source,
                    stageKey: normalized,
                    draftStatusKeys: statusDraftKeysForStage(
                        statusDraftRef.current.draftByStage,
                        normalized
                    ),
                });
                return;
            }
            const keys = resolveAssignedStatusKeysForStage(payload, normalized, {
                activationOwned,
            });
            if (
                !shouldApplyServerStatusKeysForStage(
                    statusDraftRef.current.draftByStage,
                    statusDraftRef.current.savedByStage,
                    normalized,
                    keys
                )
            ) {
                logLifecycleStatusStepDebug("sync-skipped-empty-server", {
                    source,
                    stageKey: normalized,
                    keys,
                });
                return;
            }
            logLifecycleStatusStepDebug("sync-from-server", { source, stageKey: normalized, keys });
            dispatchStatusDraft({ type: "syncFromServer", stageKey: normalized, keys });
            if (normalized === normalizeLifecycleBuilderStageKey(stageKeyRef.current)) {
                setStatusKeys(keys);
                setStatusDisplayLabels(labelsForKeys(payload, keys));
            }
        },
        [labelsForKeys, activationOwned, dispatchStatusDraft]
    );

    const {
        data: stageBootstrap,
        loading: stageBootstrapLoading,
        refresh: refreshStageBootstrap,
        patch: patchStageBootstrap,
    } = useLifecycleStageBootstrap(runtimeDepartmentId, stageKey, {
        enabled: Boolean(runtimeDepartmentId && stageKey),
    });

    const applyStageBootstrap = useCallback(
        (payload: LifecycleStageBootstrapPayload) => {
            const sk = normalizeLifecycleBuilderStageKey(stageKey);
            const stageDirty = sk
                ? !shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, sk)
                : false;
            if (!stageDirty) {
                setStatusesPayload(payload.statuses);
            } else if (sk) {
                logLifecycleStatusStepDebug("bootstrap-skipped-sync", {
                    stageKey: sk,
                    draftStatusKeys: statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk),
                });
            }
            setPipeline(payload.pipeline);
            if (payload.pipeline) {
                setWorkUnitId(payload.pipeline.id);
                setWorkUnitName(payload.pipeline.name);
            }
        },
        [stageKey, syncStatusKeysFromPayload]
    );

    useEffect(() => {
        if (stageBootstrap) applyStageBootstrap(stageBootstrap);
    }, [stageBootstrap, applyStageBootstrap]);

    /** Hydrate empty draft from server when stage or payload loads — never overwrite user selection. */
    useEffect(() => {
        const sk = normalizeLifecycleBuilderStageKey(stageKey);
        if (!sk || !statusesPayload) return;
        if (!shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, sk)) return;
        const current = statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk);
        if (current.length > 0) return;
        const keys = resolveAssignedStatusKeysForStage(statusesPayload, sk, { activationOwned });
        if (keys.length === 0) return;
        dispatchStatusDraft({ type: "syncFromServer", stageKey: sk, keys });
    }, [stageKey, statusesPayload, activationOwned, dispatchStatusDraft]);

    const repairLifecycleWorkUnits = useCallback(async () => {
        if (!runtimeDepartmentId || !processId) return;
        setRepairingLocal(true);
        setError(null);
        try {
            const queue_names_by_stage: Record<string, string> = {};
            if (statusesPayload) {
                for (const stage of builderStages) {
                    if (!stage.is_active) continue;
                    const key = stage.key.trim();
                    if (!key) continue;
                    if (
                        stageSavedStatusKeys(statusesPayload, key, { explicitAssignmentsOnly: true })
                            .length === 0
                    ) {
                        continue;
                    }
                    queue_names_by_stage[key] =
                        key === stageKey && workUnitName?.trim()
                            ? workUnitName.trim()
                            : defaultWorkUnitQueueNameForStageKey(key);
                }
            }
            if (workUnitName?.trim() && stageKey) {
                queue_names_by_stage[stageKey] = workUnitName.trim();
            }
            const res = await fetch("/api/admin/lifecycle-catalog/repair-work-units", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: runtimeDepartmentId,
                    process_id: processId,
                    ...(Object.keys(queue_names_by_stage).length
                        ? { queue_names_by_stage }
                        : {}),
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Repair failed");
            bumpWorkspaceCache();
            await refreshStageBootstrap();
            await onCatalogRefresh?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Repair failed");
        } finally {
            setRepairingLocal(false);
        }
    }, [
        runtimeDepartmentId,
        processId,
        workUnitName,
        stageKey,
        statusesPayload,
        builderStages,
        bumpWorkspaceCache,
        refreshStageBootstrap,
        onCatalogRefresh,
    ]);

    const attachLifecycleRecords = useCallback(async () => {
        if (!runtimeDepartmentId) return;
        setRepairingLocal(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/lifecycle-catalog/attach-records", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ department_id: runtimeDepartmentId }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string; attached_total?: number };
            if (!res.ok) throw new Error(j.error ?? "Attach failed");
            bumpWorkspaceCache();
            await refreshStageBootstrap();
            await onCatalogRefresh?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Attach failed");
        } finally {
            setRepairingLocal(false);
        }
    }, [
        runtimeDepartmentId,
        bumpWorkspaceCache,
        refreshStageBootstrap,
        onCatalogRefresh,
    ]);

    const saveActivation = useCallback(
        async (
            patch: Partial<LifecycleActivationV1> & { completed_steps?: number },
            opts?: { runtimeDepartmentId?: string }
        ): Promise<boolean> => {
            const dept = opts?.runtimeDepartmentId ?? runtimeDepartmentId;
            if (!dept) return false;
            const body: LifecycleActivationV1 = {
                version: 1,
                lifecycle_name: patch.lifecycle_name ?? lifecycleName,
                primary_entity: "opportunity",
                primary_record_label: PRIMARY_RECORD_LABEL,
                process_id: patch.process_id ?? processId,
                stage_key: patch.stage_key ?? stageKey,
                stage_label: patch.stage_label ?? stageLabel,
                work_unit_id: patch.work_unit_id !== undefined ? patch.work_unit_id : workUnitId,
                work_unit_name: patch.work_unit_name !== undefined ? patch.work_unit_name : workUnitName,
                status_keys: patch.status_keys ?? statusKeys,
                status_labels: patch.status_labels ?? statusDisplayLabels,
                action_definition_id:
                    patch.action_definition_id !== undefined ? patch.action_definition_id : null,
                action_placement_ids: patch.action_placement_ids ?? [],
                activation_owned: patch.activation_owned ?? activationOwned,
                completed_steps: patch.completed_steps ?? 6,
                updated_at: new Date().toISOString(),
            };
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(dept)}/lifecycle-activation`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to save activation bundle");
            return true;
        },
        [
            runtimeDepartmentId,
            lifecycleName,
            processId,
            stageKey,
            stageLabel,
            workUnitId,
            workUnitName,
            statusKeys,
            statusDisplayLabels,
            activationOwned,
        ]
    );

    const saveStageStatuses = useCallback(async (keysToSave?: readonly string[]): Promise<boolean> => {
        const sk = normalizeLifecycleBuilderStageKey(stageKeyRef.current || stageKey);
        const selectedKeys =
            keysToSave && keysToSave.length > 0
                ? [...keysToSave]
                : statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk);
        logLifecycleStatusStepDebug("save-click", {
            runtimeDepartmentId,
            processId,
            stageKey: sk,
            stageLabel,
            saveState: resolveLifecycleStatusesSaveState({
                stageKey,
                stageLabel,
                statusDraftByStageKey: statusDraftRef.current.draftByStage,
                statusDraftDirtyByStage: statusDraftRef.current.dirtyByStage,
                statusesLoading,
                statusesSaving,
            }),
            availableStatusCount: collectAllOpportunityStatusRows(statusesPayload).length,
        });
        if (!runtimeDepartmentId || !sk || selectedKeys.length < 1) {
            setStatusesError("Select at least one status for this stage.");
            return false;
        }
        setStatusesSaving(true);
        setStatusesError(null);
        const contractBody = {
            department_id: runtimeDepartmentId,
            process_id: processId,
            stage_key: sk,
            selected_status_keys: selectedKeys,
            ...(workUnitName?.trim() ? { work_unit_name: workUnitName.trim() } : {}),
        };
        logLifecycleStatusStepDebug("save-contract-request", { body: contractBody });
        try {
            const res = await fetch(LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH, {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(contractBody),
            });
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                status_stages?: EnrollmentStatusStagesPayload;
                snapshot?: { selectedStatusKeys?: string[]; synced?: boolean };
                pipeline?: EnrollmentPipelineWorkUnitSnapshot | null;
            };
            const statusPayload = j.status_stages ?? null;
            logLifecycleStatusStepDebug("save-contract-response", {
                ok: res.ok,
                status: res.status,
                savedKeys: j.snapshot?.selectedStatusKeys,
                synced: j.snapshot?.synced,
                error: j.error,
            });
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            const keys =
                j.snapshot?.selectedStatusKeys?.length
                    ? j.snapshot.selectedStatusKeys
                    : selectedKeys;
            if (keys.length < 1) {
                throw new Error(
                    `Statuses were not assigned to stage "${sk}". Check that this stage exists on the lifecycle department.`
                );
            }
            if (statusPayload) setStatusesPayload(statusPayload);
            const labels = labelsForKeys(statusPayload ?? statusesPayload, keys);
            dispatchStatusDraft({ type: "commitSaved", stageKey: sk, keys });
            if (statusPayload) patchStageBootstrap({ statuses: statusPayload });
            setStatusKeys(keys);
            setStatusDisplayLabels(labels);
            await saveActivation({ status_keys: keys, status_labels: labels, completed_steps: 3 });

            if (j.pipeline) {
                setPipeline(j.pipeline);
                setWorkUnitId(j.pipeline.id);
                setWorkUnitName(j.pipeline.name);
                setWorkUnitIdentityState(j.snapshot?.synced ? "synced" : "needs_sync");
                setWorkUnitNeedsSync(!j.snapshot?.synced);
            } else if (runtimeDepartmentId) {
                await loadPipeline(runtimeDepartmentId);
            }
            return true;
        } catch (e) {
            setStatusesError(e instanceof Error ? e.message : "Save failed");
            return false;
        } finally {
            setStatusesSaving(false);
        }
    }, [
        runtimeDepartmentId,
        processId,
        stageKey,
        stageLabel,
        statusDraft.draftByStage,
        statusesPayload,
        statusesLoading,
        statusesSaving,
        labelsForKeys,
        syncStatusKeysFromPayload,
        saveActivation,
        workUnitId,
        operatorStage,
        loadPipeline,
        dispatchStatusDraft,
        patchStageBootstrap,
    ]);

    const confirmStatusesAndContinue = useCallback(async () => {
        const keysToSave = statusesSaveState.saveDraftKeys;
        logLifecycleStatusStepDebug("save-continue-click", {
            saveState: statusesSaveState,
            keysToSave,
        });
        const ok = await saveStageStatuses(keysToSave);
        if (!ok) return;
        if (runtimeDepartmentId) await loadPipeline(runtimeDepartmentId);
    }, [saveStageStatuses, runtimeDepartmentId, loadPipeline, statusesSaveState]);

    const onToggleStatus = useCallback(
        (statusKeyArg: string, selected: boolean) => {
            const sk = normalizeLifecycleBuilderStageKey(stageKeyRef.current || stageKey);
            const status = statusKeyArg.trim();
            if (!sk || !status) return;
            dispatchStatusDraft({ type: "toggle", stageKey: sk, statusKey: status, selected });
            setStatusesError(null);
            logLifecycleStatusStepDebug("checkbox-toggle", {
                runtimeDepartmentId,
                processId,
                stageKey: sk,
                stageLabel,
                statusKey: status,
                selected,
                draftStatusKeys: statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk),
            });
        },
        [runtimeDepartmentId, processId, stageKey, stageLabel, dispatchStatusDraft]
    );

    const builderStageKeys = useMemo(() => {
        const proc = builderStages.length
            ? { id: processId, key: "", name: "", primary_entity: "opportunity" as const, sort_order: 0, is_active: true, stages: builderStages }
            : null;
        return proc ? stageKeysForProcess(proc) : [];
    }, [builderStages, processId]);

    const resetActivation = useCallback(() => {
        setDepartmentName("");
        setActivationOwned(false);
        setBuilderStages([]);
        setShowAddStage(false);
        setProcessId("");
        setLifecycleName("");
        setStageKey("");
        setStageLabel("");
        setWorkUnitId(null);
        setWorkUnitName(null);
        setStatusKeys([]);
        setStatusDisplayLabels([]);
        setPipeline(null);
        dispatchStatusDraft({ type: "reset" });
        setRuntimeSummary("unknown");
    }, [dispatchStatusDraft]);

    const deleteLifecycle = useCallback(async () => {
        if (!runtimeDepartmentId) return;
        setDeleting(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-activation`,
                { ...workspaceDataFetchInit(), method: "DELETE" }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Delete failed");
            setDeleteOpen(false);
            bumpWorkspaceCache();
            resetActivation();
            onDeleted?.();
            void onCatalogRefresh?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Delete failed");
        } finally {
            setDeleting(false);
        }
    }, [runtimeDepartmentId, resetActivation, bumpWorkspaceCache, onDeleted, onCatalogRefresh]);

    const hydrateFromSelection = useCallback(
        async (deptId: string, procId: string, entry: LifecycleCatalogEntry | null) => {
            setProcessId(procId);
            setActivationOwned(entry?.activation_owned ?? false);
            setLifecycleName(entry?.lifecycle_name ?? "");
            setDepartmentName(entry?.department_name ?? entry?.lifecycle_name ?? "");

            const [builderRes, actRes] = await Promise.all([
                fetch(
                    `/api/admin/departments/${encodeURIComponent(deptId)}/lifecycle-builder`,
                    workspaceDataFetchInit()
                ),
                fetch(
                    `/api/admin/departments/${encodeURIComponent(deptId)}/lifecycle-activation`,
                    workspaceDataFetchInit()
                ),
            ]);
            const bj = (await builderRes.json().catch(() => ({}))) as {
                active_process?: LifecycleBuilderProcessRecord;
                config?: { processes: LifecycleBuilderProcessRecord[] };
            };
            const aj = (await actRes.json().catch(() => ({}))) as { activation?: LifecycleActivationV1 | null };
            const process = bj.config?.processes?.find((p) => p.id === procId) ?? bj.active_process ?? null;
            const stagesList = process ? activeStagesForProcess(process) : [];
            setBuilderStages(stagesList);
            if (process) {
                setLifecycleName(process.name);
                setLifecycleDescription(process.description?.trim() ?? "");
            }
            const act = aj.activation;
            let nextKey = "";
            let nextLabel = "";
            if (act && act.process_id === procId) {
                nextKey = act.stage_key;
                nextLabel = act.stage_label;
                setWorkUnitId(act.work_unit_id);
                setWorkUnitName(act.work_unit_name);
                setStatusKeys(act.status_keys);
                setStatusDisplayLabels(act.status_labels ?? []);
            }
            if (!nextKey && stagesList.length > 0) {
                nextKey = stagesList[0]!.key;
                nextLabel = stagesList[0]!.label;
            }
            setStageKey(nextKey);
            setStageLabel(nextLabel);
            void loadPipeline(deptId);
            const payload = await loadStatusStages();
            const hydratedKey = normalizeLifecycleBuilderStageKey(nextKey);
            if (
                payload &&
                hydratedKey &&
                shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, hydratedKey)
            ) {
                syncStatusKeysFromPayload(payload, hydratedKey, "hydrateFromSelection");
            }
        },
        [loadPipeline, loadStatusStages, syncStatusKeysFromPayload]
    );

    const selectStage = useCallback(
        async (
            stage: LifecycleBuilderStageRecord,
            opts?: { statusesPayload?: EnrollmentStatusStagesPayload | null }
        ) => {
            const sk = normalizeLifecycleBuilderStageKey(stage.key);
            flushSync(() => {
                setStageKey(stage.key);
                setStageLabel(stage.label);
                setShowAddStage(false);
            });
            stageKeyRef.current = stage.key;
            logLifecycleStatusStepDebug("select-stage", {
                stageKey: sk,
                draftStatusKeys: statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk),
                dirty: Boolean(statusDraftRef.current.dirtyByStage[sk]),
            });
            const payload = opts?.statusesPayload ?? statusesPayload;
            const canSyncFromServer = () =>
                shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, sk);
            if (canSyncFromServer()) {
                if (payload) {
                    syncStatusKeysFromPayload(payload, sk, "selectStage");
                } else {
                    const loaded = await loadStatusStages();
                    if (loaded && canSyncFromServer()) {
                        syncStatusKeysFromPayload(loaded, sk, "selectStage-load");
                    }
                }
            }
            await saveActivation({ stage_key: stage.key, stage_label: stage.label });
        },
        [statusesPayload, syncStatusKeysFromPayload, saveActivation, loadStatusStages]
    );

    const renameLifecycle = useCallback(
        async (values: { name: string; description: string }) => {
            if (!runtimeDepartmentId || !processId || !values.name.trim()) return;
            setRenaming(true);
            setError(null);
            try {
                const nameRes = await fetch(
                    `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
                    {
                        ...workspaceDataFetchInit(),
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "update_process_name",
                            process_id: processId,
                            name: values.name.trim(),
                        }),
                    }
                );
                const nameJ = (await nameRes.json().catch(() => ({}))) as { error?: string };
                if (!nameRes.ok) throw new Error(nameJ.error ?? "Rename failed");

                const descRes = await fetch(
                    `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
                    {
                        ...workspaceDataFetchInit(),
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "update_process_description",
                            process_id: processId,
                            description: values.description,
                        }),
                    }
                );
                const descJ = (await descRes.json().catch(() => ({}))) as { error?: string };
                if (!descRes.ok) throw new Error(descJ.error ?? "Failed to save description");

                setLifecycleName(values.name.trim());
                setLifecycleDescription(values.description.trim());
                await saveActivation({ lifecycle_name: values.name.trim() });
                if (activationOwned) {
                    await fetch(`/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}`, {
                        ...workspaceDataFetchInit(),
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: values.name.trim() }),
                    });
                    bumpWorkspaceCache();
                }
                setRenameOpen(false);
                await onCatalogRefresh?.();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Rename failed");
            } finally {
                setRenaming(false);
            }
        },
        [
            runtimeDepartmentId,
            processId,
            saveActivation,
            activationOwned,
            bumpWorkspaceCache,
            onCatalogRefresh,
        ]
    );

    const reorderBuilderStage = useCallback(
        async (stageId: string, direction: "up" | "down") => {
            if (!runtimeDepartmentId || !processId) return;
            setStageReorderBusy(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
                    {
                        ...workspaceDataFetchInit(),
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "reorder_stage",
                            process_id: processId,
                            stage_id: stageId,
                            direction,
                        }),
                    }
                );
                const j = (await res.json().catch(() => ({}))) as {
                    stages?: LifecycleBuilderStageRecord[];
                    error?: string;
                };
                if (!res.ok) throw new Error(j.error ?? "Reorder failed");
                if (j.stages?.length) setBuilderStages(j.stages);
                bumpWorkspaceCache();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Reorder failed");
            } finally {
                setStageReorderBusy(false);
            }
        },
        [runtimeDepartmentId, processId, bumpWorkspaceCache]
    );

    const deleteStage = useCallback(async () => {
        if (!runtimeDepartmentId || !processId || !stageKey || !activationOwned) return;
        setDeletingStage(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                stages?: Array<{ id: string; key: string }>;
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to load stages");
            const stage = (j.stages ?? []).find((s) => s.key === stageKey);
            if (!stage?.id) throw new Error("Stage not found");

            const delRes = await fetch(
                `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "remove_stage",
                        process_id: processId,
                        stage_id: stage.id,
                    }),
                }
            );
            const delJ = (await delRes.json().catch(() => ({}))) as { error?: string };
            if (!delRes.ok) throw new Error(delJ.error ?? "Failed to delete stage");

            setDeleteStageOpen(false);
            setStageKey("");
            setStageLabel("");
            dispatchStatusDraft({ type: "reset" });
            setStatusKeys([]);
            setStatusDisplayLabels([]);
            setWorkUnitId(null);
            setWorkUnitName(null);
            setPipeline(null);
            const reload = await fetch(
                `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
                workspaceDataFetchInit()
            );
            const rj = (await reload.json().catch(() => ({}))) as { stages?: LifecycleBuilderStageRecord[] };
            const remaining = rj.stages ?? [];
            setBuilderStages(remaining);
            if (remaining[0]) await selectStage(remaining[0]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete stage");
        } finally {
            setDeletingStage(false);
        }
    }, [runtimeDepartmentId, processId, stageKey, activationOwned, selectStage, dispatchStatusDraft]);

    const deleteWorkUnitQueue = useCallback(async () => {
        if (!workUnitId || !activationOwned) return;
        setError(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/stage-work-unit", {
                ...workspaceDataFetchInit(),
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ work_unit_id: workUnitId }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to delete queue");
            setWorkUnitId(null);
            setWorkUnitName(null);
            setPipeline(null);
            await saveActivation({ work_unit_id: null, work_unit_name: null });
            bumpWorkspaceCache();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete queue");
        }
    }, [workUnitId, activationOwned, saveActivation, bumpWorkspaceCache]);

    const clearStageStatuses = useCallback(async () => {
        const sk = normalizeLifecycleBuilderStageKey(stageKey);
        dispatchStatusDraft({ type: "clearStageDraft", stageKey: sk });
        if (!runtimeDepartmentId || !sk) return;
        setStatusesSaving(true);
        try {
            const res = await fetch(LIFECYCLE_ACTIVATION_STATUS_STAGES_PATH, {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: runtimeDepartmentId,
                    stage: sk,
                    status_keys: [],
                }),
            });
            const j = (await res.json().catch(() => ({}))) as EnrollmentStatusStagesPayload & { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to clear statuses");
            setStatusesPayload(j);
            syncStatusKeysFromPayload(j, sk, "clearStageStatuses");
            await saveActivation({ status_keys: [], status_labels: [], completed_steps: 2 });
        } catch (e) {
            setStatusesError(e instanceof Error ? e.message : "Failed to clear statuses");
        } finally {
            setStatusesSaving(false);
        }
    }, [runtimeDepartmentId, stageKey, syncStatusKeysFromPayload, saveActivation, dispatchStatusDraft]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (creatingNew || !runtimeDepartmentId || !processId) {
                if (!cancelled) setBootLoading(false);
                return;
            }
            try {
                await hydrateFromSelection(runtimeDepartmentId, processId, catalogEntry);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
            } finally {
                if (!cancelled) setBootLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [creatingNew, runtimeDepartmentId, processId, catalogEntry, hydrateFromSelection]);

    useEffect(() => {
        if (!identity) return;
        setProcessId(identity.processId);
        setLifecycleName(identity.lifecycleName);
        setActivationOwned(identity.isBuilderOwned);
    }, [identity?.lifecycleId, identity?.runtimeDepartmentId, identity?.processId, identity?.lifecycleName, identity?.isBuilderOwned]);

    const handleLifecycleFormCreated = useCallback(
        async (result?: { departmentId: string; processId?: string; lifecycleName?: string }) => {
            const deptId = (result?.departmentId ?? runtimeDepartmentId).trim();
            if (!deptId) return;
            setActivationOwned(true);

            const returnedProcessId = result?.processId?.trim() ?? "";
            const returnedName = result?.lifecycleName?.trim() ?? "";

            if (returnedProcessId) {
                const nextIdentity = buildIdentityForNewLifecycle(
                    deptId,
                    returnedProcessId,
                    returnedName || lifecycleName || "Lifecycle"
                );
                onIdentityChange(nextIdentity);
                setProcessId(returnedProcessId);
                setLifecycleName(nextIdentity.lifecycleName);
                setDepartmentName(nextIdentity.lifecycleName);
                if (isLifecycleDebugUiEnabled()) {
                    console.info("[lifecycle-create] board identity after create", {
                        lifecycleName: nextIdentity.lifecycleName,
                        runtimeDepartmentId: deptId,
                        processId: returnedProcessId,
                        lifecycleId: nextIdentity.lifecycleId,
                    });
                }
                await onLifecycleCreated?.(deptId, returnedProcessId, nextIdentity.lifecycleName);
            }

            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(deptId)}/lifecycle-builder`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                active_process?: LifecycleBuilderProcessRecord;
                stages?: LifecycleBuilderStageRecord[];
                error?: string;
            };
            if (!res.ok) {
                setError(j.error ?? "Failed to load lifecycle after create");
                return;
            }
            if (j.active_process) {
                const procId = j.active_process.id;
                const procName = j.active_process.name;
                setProcessId(procId);
                setLifecycleName(procName);
                setDepartmentName(procName);
                setBuilderStages(j.stages ?? activeStagesForProcess(j.active_process));
                await saveActivation(
                    {
                        process_id: procId,
                        lifecycle_name: procName,
                        activation_owned: true,
                        completed_steps: 1,
                    },
                    { runtimeDepartmentId: deptId }
                );
                bumpWorkspaceCache();
                void loadStatusStages();
                if (!returnedProcessId) {
                    onIdentityChange(buildIdentityForNewLifecycle(deptId, procId, procName));
                    await onLifecycleCreated?.(deptId, procId, procName);
                }
            }
        },
        [
            runtimeDepartmentId,
            lifecycleName,
            saveActivation,
            loadStatusStages,
            bumpWorkspaceCache,
            onLifecycleCreated,
            onIdentityChange,
        ]
    );

    const onStageCreated = useCallback(
        async (key: string) => {
            if (!runtimeDepartmentId) return;
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-builder`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                stages?: LifecycleBuilderStageRecord[];
                active_process?: LifecycleBuilderProcessRecord;
            };
            const stagesList = j.stages ?? (j.active_process ? activeStagesForProcess(j.active_process) : []);
            setBuilderStages(stagesList);
            const payload = await loadStatusStages();
            const stage = stagesList.find((s) => s.key === key);
            if (stage) await selectStage(stage, { statusesPayload: payload });
            setShowAddStage(false);
        },
        [runtimeDepartmentId, selectStage, loadStatusStages]
    );

    if (bootLoading && runtimeDepartmentId && processId) {
        return (
            <p className="text-sm text-alloy-midnight/60" data-testid="lifecycle-activation-loading">
                Loading Lifecycle…
            </p>
        );
    }

    const handleDeleteLifecycle = () => {
        if (!canDeleteLifecycle) return;
        if (catalogEntry && onRequestDelete) onRequestDelete();
        else setDeleteOpen(true);
    };

    if (creatingNew && !processId) {
        return (
            <div className="mx-auto max-w-5xl space-y-3" data-testid="lifecycle-builder-board">
                <LifecycleCreateForm
                    activationMode
                    departmentId={runtimeDepartmentId}
                    createdByUserId={userId}
                    onCreated={handleLifecycleFormCreated}
                />
                {error ? (
                    <p className="text-sm text-red-700" role="alert">
                        {error}
                    </p>
                ) : null}
            </div>
        );
    }

    const runtimeStatusLabel =
        runtimeSummary === "pass"
            ? "Connected"
            : runtimeSummary === "fail"
              ? "Needs attention"
              : "Pending";

    return (
        <div className="mx-auto max-w-5xl space-y-2" data-testid="lifecycle-builder-board">
            <LifecycleIdentitySyncBanner
                identity={identity}
                onUseRuntimeDepartment={() => onUseRuntimeDepartment?.()}
            />

            {error ? (
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            {!processId ? (
                <LifecycleCreateForm
                    activationMode
                    departmentId={runtimeDepartmentId}
                    createdByUserId={userId}
                    onCreated={handleLifecycleFormCreated}
                />
            ) : builderStages.length === 0 && !showAddStage ? (
                !runtimeDepartmentId.trim() || !processId.trim() ? (
                    <p
                        className="text-sm text-alloy-midnight/60"
                        data-testid="lifecycle-add-stage-awaiting-identity"
                    >
                        Preparing lifecycle workspace…
                    </p>
                ) : (
                    <LifecycleAddStageForm
                        departmentId={runtimeDepartmentId}
                        processId={processId}
                        isFirstStage
                        onCreated={onStageCreated}
                    />
                )
            ) : (
                <>
                    <div
                        className="flex flex-wrap items-center justify-between gap-2"
                        data-testid="lifecycle-stage-nav-row"
                    >
                        <LifecycleStageNav
                            stages={builderStages}
                            activeStageKey={stageKey}
                            onSelect={(s) => void selectStage(s)}
                            onAddStageClick={() => setShowAddStage((v) => !v)}
                            onReorderStage={reorderBuilderStage}
                            reorderBusy={stageReorderBusy}
                        />
                        {processId ? (
                            <details
                                className="relative shrink-0 text-xs"
                                data-testid="lifecycle-board-more-menu"
                            >
                                <summary className="cursor-pointer list-none rounded-md border border-alloy-forge/20 bg-white px-2.5 py-1 font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10 [&::-webkit-details-marker]:hidden">
                                    More
                                </summary>
                                <div className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-md border border-alloy-forge/15 bg-white py-1 shadow-md">
                                    <button
                                        type="button"
                                        className="block w-full px-3 py-1.5 text-left text-alloy-midnight/80 hover:bg-alloy-stone/10"
                                        onClick={() => setRenameOpen(true)}
                                        data-testid="lifecycle-rename"
                                    >
                                        Rename lifecycle
                                    </button>
                                    {canDeleteLifecycle ? (
                                        <button
                                            type="button"
                                            className="block w-full px-3 py-1.5 text-left text-red-800 hover:bg-red-50"
                                            onClick={handleDeleteLifecycle}
                                            data-testid="lifecycle-activation-delete"
                                        >
                                            Delete lifecycle
                                        </button>
                                    ) : null}
                                    {onRepairVisibility || (runtimeDepartmentId && processId) ? (
                                        <button
                                            type="button"
                                            className="block w-full px-3 py-1.5 text-left text-alloy-pine hover:bg-alloy-stone/10 disabled:opacity-50"
                                            disabled={repairingBusy || !runtimeDepartmentId || !processId}
                                            onClick={() =>
                                                onRepairVisibility
                                                    ? onRepairVisibility()
                                                    : void repairWorkspaceVisibility()
                                            }
                                            data-testid="lifecycle-activation-repair-workspace"
                                        >
                                            {repairingBusy ? "Repairing…" : "Repair workspace"}
                                        </button>
                                    ) : null}
                                    {activationOwned && runtimeDepartmentId && processId ? (
                                        <button
                                            type="button"
                                            className="block w-full px-3 py-1.5 text-left text-alloy-pine hover:bg-alloy-stone/10 disabled:opacity-50"
                                            disabled={repairingBusy}
                                            onClick={() => void repairLifecycleWorkUnits()}
                                            data-testid="lifecycle-activation-repair-work-units"
                                        >
                                            {repairingBusy ? "Repairing…" : "Repair lifecycle work units"}
                                        </button>
                                    ) : null}
                                    <p
                                        className="border-t border-alloy-forge/10 px-3 py-1.5 text-[10px] text-alloy-midnight/50"
                                        data-testid="lifecycle-activation-runtime-status"
                                    >
                                        Runtime: {runtimeStatusLabel}
                                    </p>
                                </div>
                            </details>
                        ) : null}
                    </div>
                    {showAddStage ? (
                        <div className="rounded-lg border border-dashed border-alloy-pine/30 bg-alloy-pine/5 p-3">
                            <LifecycleAddStageForm
                                departmentId={runtimeDepartmentId}
                                processId={processId}
                                isFirstStage={false}
                                onCreated={onStageCreated}
                            />
                        </div>
                    ) : null}
                    {stageKey ? (
                        <>
                            <div className="flex justify-end">
                                {activationOwned ? (
                                    <button
                                        type="button"
                                        className="text-[10px] font-medium text-red-800 hover:underline"
                                        onClick={() => setDeleteStageOpen(true)}
                                        data-testid="lifecycle-activation-delete-stage"
                                    >
                                        Delete this stage
                                    </button>
                                ) : null}
                            </div>
                            <LifecycleStageConfiguration
                                departmentId={runtimeDepartmentId}
                                stageKey={stageKey}
                                bootstrap={stageBootstrap}
                                bootstrapLoading={stageBootstrapLoading}
                                statusesPayload={statusesPayload}
                                statusesSaving={statusesSaving}
                                statusesSaveState={statusesSaveState}
                                savedStatusKeys={savedStatusKeys}
                                statusesError={statusesError}
                                onToggleStatus={onToggleStatus}
                                onSaveStatuses={confirmStatusesAndContinue}
                                canSaveStatuses={canConfirmStatuses}
                                statusesSaveDisabledReason={statusesSaveState.disabledReason}
                                pipeline={pipeline}
                                workUnitIdentityState={workUnitIdentityState}
                                workUnitNeedsSync={workUnitNeedsSync}
                                onPipelineUpdated={async (snapshot) => {
                                    if (snapshot) {
                                        setPipeline(snapshot);
                                        setWorkUnitId(snapshot.id);
                                        setWorkUnitName(snapshot.name);
                                        await saveActivation({
                                            work_unit_id: snapshot.id,
                                            work_unit_name: snapshot.name,
                                            completed_steps: 4,
                                        });
                                    }
                                    if (runtimeDepartmentId) {
                                        await loadPipeline(runtimeDepartmentId);
                                    }
                                    await refreshStageBootstrap();
                                }}
                                statusDisplayLabels={statusDisplayLabels}
                                validationSlot={
                                    identity ? (
                                        <LifecycleActivationValidation
                                            identity={identity}
                                            repairQueue={
                                                workUnitId && stageKey.trim()
                                                    ? {
                                                          workUnitId,
                                                          stageKey: normalizeLifecycleBuilderStageKey(stageKey),
                                                      }
                                                    : null
                                            }
                                            onQueueRepaired={async () => {
                                                await loadPipeline(runtimeDepartmentId);
                                                await refreshStageBootstrap();
                                            }}
                                            onAttachRecords={() => attachLifecycleRecords()}
                                            onRuntimeStatus={(allPass) => {
                                                setRuntimeSummary(allPass ? "pass" : "fail");
                                            }}
                                        />
                                    ) : null
                                }
                            />
                            <LifecycleActionsMatrix
                                departmentId={runtimeDepartmentId}
                                builderStageKeys={builderStageKeys}
                                onSaved={async () => {
                                    await refreshStageBootstrap();
                                }}
                            />
                        </>
                    ) : null}
                </>
            )}

            <LifecycleRenameModal
                open={renameOpen}
                currentName={lifecycleName}
                currentDescription={lifecycleDescription}
                busy={renaming}
                onCancel={() => setRenameOpen(false)}
                onConfirm={(values) => void renameLifecycle(values)}
            />
            <LifecycleActivationDeleteModal
                open={deleteOpen}
                lifecycleName={lifecycleName}
                busy={deleting}
                onCancel={() => setDeleteOpen(false)}
                onConfirm={() => void deleteLifecycle()}
            />
            <LifecycleActivationDeleteStageModal
                open={deleteStageOpen}
                stageLabel={stageLabel}
                busy={deletingStage}
                onCancel={() => setDeleteStageOpen(false)}
                onConfirm={() => void deleteStage()}
            />
        </div>
    );
}
