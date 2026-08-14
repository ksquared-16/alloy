"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import LifecycleCreateForm from "@/components/adminV2/settings/lifecycle/LifecycleCreateForm";
import LifecycleAddStageForm from "@/components/adminV2/settings/lifecycle/LifecycleAddStageForm";
import LifecycleActivationValidation from "@/components/adminV2/settings/lifecycle/LifecycleActivationValidation";
import LifecycleActivationDeleteModal from "@/components/adminV2/settings/lifecycle/LifecycleActivationDeleteModal";
import LifecycleActivationDeleteStageModal from "@/components/adminV2/settings/lifecycle/LifecycleActivationDeleteStageModal";
import LifecycleRenameModal from "@/components/adminV2/settings/lifecycle/LifecycleRenameModal";
import LifecycleStageNav from "@/components/adminV2/settings/lifecycle/LifecycleStageNav";
import LifecycleTrackStageNav from "@/components/adminV2/settings/lifecycle/LifecycleTrackStageNav";
import LifecycleEnrollmentV2TemplateCard from "@/components/adminV2/settings/lifecycle/LifecycleEnrollmentV2TemplateCard";
import LifecycleStageConfiguration from "@/components/adminV2/settings/lifecycle/LifecycleStageConfiguration";
import type { LifecycleStageWorkspaceHandle } from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";
import type { LifecycleStageSaveUiState } from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";
import type { StageEditorV2Handle } from "@/components/adminV2/settings/lifecycle/StageEditorV2";
import BusinessProcessActionsListColumn, {
    BusinessProcessActionsSetupWorkspace,
    useProcessActionsMatrixDraft,
} from "@/components/adminV2/settings/businessProcess/BusinessProcessActionsQueueWorkspace";
import BusinessProcessAutomationShell from "@/components/adminV2/settings/businessProcess/BusinessProcessAutomationShell";
import BusinessProcessHealthListColumn from "@/components/adminV2/settings/businessProcess/BusinessProcessHealthQueueWorkspace";
import BusinessProcessOverviewPanel from "@/components/adminV2/settings/businessProcess/BusinessProcessOverviewPanel";
import {
    BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY,
    BUSINESS_PROCESS_HISTORY_PLANNED,
    BUSINESS_PROCESS_HISTORY_TITLE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import BusinessProcessConfigurationShell from "@/components/adminV2/settings/businessProcess/BusinessProcessConfigurationShell";
import BusinessProcessStagesListColumn from "@/components/adminV2/settings/businessProcess/BusinessProcessStagesListColumn";
import BusinessProcessWorkViewsListColumn from "@/components/adminV2/settings/businessProcess/BusinessProcessWorkViewsListColumn";
import BusinessProcessWorkViewsSetupWorkspace from "@/components/adminV2/settings/businessProcess/BusinessProcessWorkViewsSetupWorkspace";
import BusinessProcessParticipationCard from "@/components/adminV2/settings/businessProcess/BusinessProcessParticipationCard";
import { WorkViewsConfigurationProvider } from "@/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext";
import BusinessProcessPublicationBar from "@/components/adminV2/settings/lifecycle/BusinessProcessPublicationBar";
import type { BusinessProcessWorkspaceSection } from "@/lib/lifecycle/businessProcessUiLabels";
import type { LifecycleBaseActionKey } from "@/lib/lifecycle/lifecycleStageBaseActions";
import { queueMembershipWithSyncedStatusKeys } from "@/lib/lifecycle/queueMembershipEditorModel";
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
    readProcessTracks,
    stagesForTrack,
} from "@/lib/businessProcesses/businessProcessConfigReader";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import { ENROLLMENT_TRACK_FAMILY_KEY } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
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
import { effectiveLifecycleStageStatusKeys } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import { derivePerspectiveLanesFromPipeline } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import { remainingIssuesSummary } from "@/lib/lifecycle/stageOperatingPlanDraftDelta";

type DeptRow = {
    id: string;
    name: string | null;
    key: string | null;
    metadata?: Record<string, unknown> | null;
};
type WorkUnitApiRow = { id: string; key: string; name: string; is_active: boolean; queue_definition: unknown };

const PRIMARY_RECORD_LABEL = "Lead";

/**
 * Put the operator in front of the thing that blocked the save.
 *
 * `controlId` is the same handle the editor stamps onto its issue list, so scrolling to it lands
 * on the sentence explaining the defect. A blocked save that only sets a message at the bottom of
 * a long form is barely better than the silent failure this replaces.
 */
function focusStageOperatingPlanControl(controlId: string): void {
    if (typeof document === "undefined") return;
    const target =
        document.querySelector(`[data-control-id="${CSS.escape(controlId)}"]`) ??
        document.querySelector('[data-testid="lifecycle-stage-operating-plan-editor"]');
    if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

export default function LifecycleActivationBoard({
    identity,
    catalog = [],
    creatingNew = false,
    initialSection = "stages",
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
    catalogSummary = null,
    onBackToCatalog,
    onContextActionsChange,
    activeProcessSection,
    onProcessSectionChange,
    onRenameTriggerReady,
}: {
    identity: LifecycleRuntimeIdentity | null;
    catalog?: LifecycleCatalogEntry[];
    creatingNew?: boolean;
    initialSection?: BusinessProcessWorkspaceSection;
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
    catalogSummary?: { trackCount: number; stageCount: number; queueCount: number } | null;
    onBackToCatalog?: () => void;
    onContextActionsChange?: (actions: ReactNode) => void;
    /** Controlled Selected-Process header tab (overview/stages/.../history) — parent owns the tab bar. */
    activeProcessSection?: BusinessProcessWorkspaceSection;
    onProcessSectionChange?: (section: BusinessProcessWorkspaceSection) => void;
    /** Registers a direct "open rename modal" trigger so the parent header can offer an Edit action. */
    onRenameTriggerReady?: (trigger: () => void) => void;
}) {
    const runtimeDepartmentId = identity?.runtimeDepartmentId?.trim() ?? "";
    const catalogEntry =
        identity && catalog.length ? findCatalogEntryForIdentity(catalog, identity) : null;

    const [departmentName, setDepartmentName] = useState("");
    const [activationOwned, setActivationOwned] = useState(false);
    const [processId, setProcessId] = useState(identity?.processId ?? "");
    const [builderStages, setBuilderStages] = useState<LifecycleBuilderStageRecord[]>([]);
    const [processTracks, setProcessTracks] = useState<ProcessTracksV1 | null>(null);
    const [activeTrackKey, setActiveTrackKey] = useState<string>(ENROLLMENT_TRACK_FAMILY_KEY);
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
    const [stageSaveState, setStageSaveState] = useState<LifecycleStageSaveUiState>("idle");
    const [stageSaveError, setStageSaveError] = useState<string | null>(null);
    /** Saved-but-not-publishable: the honest count of what the graph still owes. */
    const [stageSaveNotice, setStageSaveNotice] = useState<string | null>(null);
    const [readyCheckRevision, setReadyCheckRevision] = useState(0);
    const [processSection, setProcessSection] = useState<BusinessProcessWorkspaceSection>(
        activeProcessSection ?? initialSection
    );

    /** Two-way sync with the parent-owned Selected-Process header tab bar — no new nav runtime. */
    useEffect(() => {
        if (activeProcessSection && activeProcessSection !== processSection) {
            setProcessSection(activeProcessSection);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProcessSection]);

    useEffect(() => {
        onProcessSectionChange?.(processSection);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processSection]);

    useEffect(() => {
        onRenameTriggerReady?.(() => setRenameOpen(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRenameTriggerReady]);
    const [selectedActionKey, setSelectedActionKey] = useState<LifecycleBaseActionKey | null>(null);
    const workspaceHandleRef = useRef<StageEditorV2Handle | null>(null);
    const stageDirtyRef = useRef(false);

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
    const hydratedScopeRef = useRef<string | null>(null);
    const userSelectedStageRef = useRef(false);

    stageKeyRef.current = stageKey;

    const workViewQueueLanes = useMemo(
        () =>
            derivePerspectiveLanesFromPipeline(pipeline).map((lane) => ({
                queueKey: lane.queueKey,
                label: lane.label,
            })),
        [pipeline],
    );

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

    const labelsForKeys = useCallback(
        (
            payload: EnrollmentStatusStagesPayload | null,
            keys: string[],
            optionRows?: readonly { status_key: string; status_label: string }[] | null
        ) => {
            const rows =
                optionRows?.length
                    ? optionRows.map((r) => ({ status_key: r.status_key, status_label: r.status_label }))
                    : collectAllOpportunityStatusRows(payload);
            const m = new Map(rows.map((r) => [r.status_key, r.status_label]));
            return keys.map((k) => m.get(k) ?? k.replace(/_/g, " "));
        },
        []
    );

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
            const currentKey = normalizeLifecycleBuilderStageKey(stageKeyRef.current);
            const payloadKey = normalizeLifecycleBuilderStageKey(payload.builder_stage_key);
            if (!currentKey || !payloadKey || currentKey !== payloadKey) {
                return;
            }
            const sk = currentKey;
            const stageDirty = !shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, sk);
            if (!stageDirty) {
                setStatusesPayload(payload.statuses);
            } else {
                logLifecycleStatusStepDebug("bootstrap-skipped-sync", {
                    stageKey: sk,
                    draftStatusKeys: statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk),
                });
            }
            setPipeline(payload.pipeline);
            if (payload.pipeline) {
                setWorkUnitId(payload.pipeline.id);
                setWorkUnitName(payload.pipeline.name);
                setWorkUnitIdentityState("synced");
                setWorkUnitNeedsSync(false);
            } else {
                setWorkUnitId(null);
                setWorkUnitName(null);
                setWorkUnitIdentityState("not_created");
                setWorkUnitNeedsSync(false);
            }
        },
        []
    );

    useEffect(() => {
        if (stageBootstrap) applyStageBootstrap(stageBootstrap);
    }, [stageBootstrap, applyStageBootstrap]);

    /** Hydrate empty draft from bootstrap rollup — never overwrite user selection. */
    useEffect(() => {
        const sk = normalizeLifecycleBuilderStageKey(stageKey);
        if (!sk || !stageBootstrap) return;
        if (!shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, sk)) return;
        const current = statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk);
        if (current.length > 0) return;
        const rollupKeys =
            stageBootstrap.status_rollup_v1
                ? stageBootstrap.status_rollup_v1.categories.flatMap((c) => c.selected_status_keys)
                : [];
        const keys =
            rollupKeys.length > 0
                ? rollupKeys
                : statusesPayload
                  ? resolveAssignedStatusKeysForStage(statusesPayload, sk, { activationOwned })
                  : [];
        if (keys.length === 0) return;
        dispatchStatusDraft({ type: "syncFromServer", stageKey: sk, keys });
    }, [stageKey, stageBootstrap, statusesPayload, activationOwned, dispatchStatusDraft]);

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
        if (!runtimeDepartmentId || !sk || effectiveLifecycleStageStatusKeys(sk, selectedKeys).length < 1) {
            setStatusesError("Select at least one status for this stage.");
            return false;
        }
        setStatusesSaving(true);
        setStatusesError(null);
        const effectiveKeys = effectiveLifecycleStageStatusKeys(sk, selectedKeys);
        const contractBody = {
            department_id: runtimeDepartmentId,
            process_id: processId,
            stage_key: sk,
            selected_status_keys: effectiveKeys,
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
                    : effectiveKeys;
            if (keys.length < 1) {
                throw new Error(
                    `Statuses were not assigned to stage "${sk}". Check that this stage exists on the lifecycle department.`
                );
            }
            if (statusPayload) setStatusesPayload(statusPayload);
            const labels = labelsForKeys(
                statusPayload ?? statusesPayload,
                keys,
                stageBootstrap?.queue_membership_status_options
            );
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

    // ── Publication workflow (Law 4) ────────────────────────────────────────────
    // A stage save writes the DRAFT. Runtime keeps serving the published revision until the
    // operator publishes, so the editor needs its own small workflow rather than a "Saved" chip.
    const [publicationBusy, setPublicationBusy] = useState(false);
    const [publicationNotice, setPublicationNotice] = useState<string | null>(null);
    // Independent of stage bootstrap — Work Views (and other process sections) still need Apply
    // even when no stage is selected / bootstrap is empty.
    const [publicationSummary, setPublicationSummary] = useState<
        LifecycleStageBootstrapPayload["configuration_state"] | null
    >(null);

    const refreshConfigurationState = useCallback(async () => {
        if (!runtimeDepartmentId) return;
        try {
            const res = await fetch(
                `/api/admin/business-process/configuration?department_id=${encodeURIComponent(runtimeDepartmentId)}`,
                workspaceDataFetchInit(),
            );
            const j = (await res.json().catch(() => ({}))) as {
                summary?: LifecycleStageBootstrapPayload["configuration_state"];
            };
            if (res.ok && j.summary) {
                setPublicationSummary(j.summary);
                patchStageBootstrap({ configuration_state: j.summary });
            }
        } catch {
            // A failed refresh must not break the save it followed; the next load corrects it.
        }
    }, [runtimeDepartmentId, patchStageBootstrap]);

    useEffect(() => {
        if (stageBootstrap?.configuration_state) {
            setPublicationSummary(stageBootstrap.configuration_state);
        }
    }, [stageBootstrap?.configuration_state]);

    useEffect(() => {
        if (processSection === "work-views" && runtimeDepartmentId) {
            void refreshConfigurationState();
        }
    }, [processSection, runtimeDepartmentId, refreshConfigurationState]);

    const validateConfiguration = useCallback(async () => {
        if (!runtimeDepartmentId) return;
        setPublicationBusy(true);
        setPublicationNotice(null);
        try {
            const res = await fetch("/api/admin/business-process/configuration/validate", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ department_id: runtimeDepartmentId }),
            });
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                can_publish?: boolean;
                summary?: LifecycleStageBootstrapPayload["configuration_state"];
            };
            if (!res.ok) throw new Error(j.error ?? "Validation failed");
            if (j.summary) {
                setPublicationSummary(j.summary);
                patchStageBootstrap({ configuration_state: j.summary });
            }
            setPublicationNotice(
                j.can_publish
                    ? "Validated. This configuration is ready to publish."
                    : "Validation found problems that must be resolved before publishing.",
            );
        } catch (e) {
            setPublicationNotice(e instanceof Error ? e.message : "Validation failed");
        } finally {
            setPublicationBusy(false);
        }
    }, [runtimeDepartmentId, patchStageBootstrap]);

    const publishConfiguration = useCallback(async () => {
        if (!runtimeDepartmentId) return;
        setPublicationBusy(true);
        setPublicationNotice(null);
        try {
            const res = await fetch("/api/admin/business-process/configuration/publish", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: runtimeDepartmentId,
                    ...((publicationSummary ?? stageBootstrap?.configuration_state)
                        ? {
                              draft_revision: (publicationSummary ?? stageBootstrap!.configuration_state!)
                                  .draft_revision,
                          }
                        : {}),
                }),
            });
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                published?: { revision_number?: number; already_published?: boolean };
                summary?: LifecycleStageBootstrapPayload["configuration_state"];
            };
            if (!res.ok) {
                if (j.summary) {
                    setPublicationSummary(j.summary);
                    patchStageBootstrap({ configuration_state: j.summary });
                } else await refreshConfigurationState();
                throw new Error(j.error ?? "Could not apply your changes.");
            }
            if (j.summary) {
                setPublicationSummary(j.summary);
                patchStageBootstrap({ configuration_state: j.summary });
            }
            // Says what CHANGED for the operator, not which revision number was cut. `already_published`
            // means the request was a no-op because this exact configuration was already live —
            // telling them "applied" would imply something happened.
            setPublicationNotice(
                j.published?.already_published === true
                    ? "These changes were already applied — nothing to do."
                    : "Changes applied. Your team is now working from them.",
            );
            bumpWorkspaceCache();
        } catch (e) {
            setPublicationNotice(e instanceof Error ? e.message : "Could not apply your changes.");
        } finally {
            setPublicationBusy(false);
        }
    }, [
        runtimeDepartmentId,
        publicationSummary,
        stageBootstrap?.configuration_state,
        patchStageBootstrap,
        refreshConfigurationState,
        bumpWorkspaceCache,
    ]);

    const reloadConfiguration = useCallback(async () => {
        setPublicationNotice(null);
        // A stale draft is resolved by seeing the newer world, not by force-publishing over it.
        window.location.reload();
    }, []);

    const saveStageUnified = useCallback(async () => {
        const sk = normalizeLifecycleBuilderStageKey(stageKeyRef.current || stageKey);
        const selectedKeys = statusDraftKeysForStage(statusDraftRef.current.draftByStage, sk);
        const effectiveKeys = effectiveLifecycleStageStatusKeys(sk, selectedKeys);
        if (!runtimeDepartmentId || !sk) {
            setStageSaveError("Select a stage first.");
            setStageSaveState("error");
            return;
        }
        if (effectiveKeys.length < 1) {
            const message = "Select at least one status for this stage.";
            setStageSaveError(message);
            setStageSaveState("error");
            setStatusesError(null);
            const statusSection = document.querySelector('[data-testid="lifecycle-stage-statuses-section"]');
            if (statusSection instanceof HTMLElement) {
                statusSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
                const details = statusSection.querySelector("details");
                if (details && !details.open) details.open = true;
            }
            return;
        }

        setStageSaveState("saving");
        setStageSaveError(null);
        setStageSaveNotice(null);
        setStatusesError(null);

        try {
        const handle = workspaceHandleRef.current;
        const fieldRules = handle?.isFieldDirty() ? handle.getFieldDraftRules() : null;
        const queueName =
            handle?.getQueueDisplayName()?.trim() || defaultWorkUnitQueueNameForStageKey(sk);

        const membershipBase =
            handle?.isQueueMembershipDirty()
                ? handle.getQueueMembershipDraft()
                : (stageBootstrap?.queue_membership ?? null);
        const queueMembership = queueMembershipWithSyncedStatusKeys(
            membershipBase,
            sk,
            effectiveKeys,
        );
        // D3, drafting half. The editor no longer throws while the request is being assembled;
        // it returns the plan together with a verdict on what THIS edit did to the graph. Only an
        // error this edit introduced or worsened stops the save — a stage the operator inherited
        // broken stays editable, and what remains broken is reported rather than silently endured.
        const stageOperatingPlanSave =
            handle?.isStageOperatingPlanDirty() ? handle.getStageOperatingPlanDraft() : null;
        if (stageOperatingPlanSave?.assessment.blocking.length) {
            const first = stageOperatingPlanSave.assessment.blocking[0]!;
            const more = stageOperatingPlanSave.assessment.blocking.length - 1;
            setStageSaveError(more > 0 ? `${first.message} (+${more} more)` : first.message);
            setStageSaveState("error");
            focusStageOperatingPlanControl(first.controlId);
            return;
        }
        const stageOperatingPlan = stageOperatingPlanSave?.plan ?? null;
        const statusRollup =
            handle?.isStatusRollupDirty()
                ? handle.getStatusRollupDraft()
                : (stageBootstrap?.status_rollup_v1 ?? null);

        const v2Draft = handle?.isV2Dirty?.() ? handle.getV2Draft?.() : null;

        const contractBody = {
            department_id: runtimeDepartmentId,
            process_id: processId,
            stage_key: sk,
            selected_status_keys: effectiveKeys,
            work_unit_name: queueName,
            ...(fieldRules ? { field_rules: fieldRules } : {}),
            queue_membership_v1: queueMembership,
            ...(stageOperatingPlan ? { stage_operating_plan_v1: stageOperatingPlan } : {}),
            ...(statusRollup ? { status_rollup_v1: statusRollup } : {}),
            ...(v2Draft ? { stage_v2_draft: v2Draft } : {}),
            // Both conflict tokens the editor loaded. `draft_revision` catches a colleague editing
            // the same draft; `base_revision_id` catches a publish that happened underneath us.
            ...(stageBootstrap?.configuration_state
                ? {
                      draft_revision: stageBootstrap.configuration_state.draft_revision,
                      base_revision_id: stageBootstrap.configuration_state.base_revision_id,
                  }
                : {}),
        };

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
                draft?: { draft_revision?: number; base_revision_id?: string | null };
                publication_required?: boolean;
                errors?: { message?: string }[];
            };
            if (!res.ok) {
                // 409 is a conflict, not a failure: the operator's work is intact, they just need
                // to reload. 422 carries the touched-reference errors D3 blocks on.
                if (res.status === 409) {
                    setPublicationNotice(null);
                    throw new Error(j.error ?? "This configuration changed while you were editing.");
                }
                if (res.status === 422 && j.errors?.length) {
                    throw new Error(j.errors.map((e) => e.message).filter(Boolean).join(" "));
                }
                throw new Error(j.error ?? "Save failed");
            }

            const keys =
                j.snapshot?.selectedStatusKeys?.length ? j.snapshot.selectedStatusKeys : effectiveKeys;
            const statusPayload = j.status_stages ?? null;
            if (statusPayload) setStatusesPayload(statusPayload);
            const labels = labelsForKeys(
                statusPayload ?? statusesPayload,
                keys,
                stageBootstrap?.queue_membership_status_options
            );
            dispatchStatusDraft({ type: "commitSaved", stageKey: sk, keys });
            if (statusPayload) patchStageBootstrap({ statuses: statusPayload });
            if (statusRollup) patchStageBootstrap({ status_rollup_v1: statusRollup });
            if (fieldRules) {
                patchStageBootstrap({
                    field_requirements: {
                        ...(stageBootstrap?.field_requirements ?? {
                            effective: {
                                field_rules: fieldRules,
                                field_rules_source: "builder_stage",
                                required_labels: [],
                                recommended_labels: [],
                                source: "department",
                            },
                            has_department_override: true,
                            field_palette: stageBootstrap?.field_requirements?.field_palette ?? [],
                        }),
                        effective: {
                            ...(stageBootstrap?.field_requirements?.effective ?? {
                                field_rules_source: "builder_stage",
                                required_labels: [],
                                recommended_labels: [],
                                source: "department",
                            }),
                            field_rules: fieldRules,
                        },
                        has_department_override: true,
                    },
                });
            }
            if (queueMembership) {
                patchStageBootstrap({ queue_membership: queueMembership });
            }
            if (stageOperatingPlan) {
                patchStageBootstrap({ stage_operating_plan: stageOperatingPlan });
            }
            if (v2Draft) {
                setBuilderStages((prev) =>
                    prev.map((s) =>
                        s.key !== sk
                            ? s
                            : {
                                  ...s,
                                  ...(v2Draft.grain !== undefined ? { grain: v2Draft.grain } : {}),
                                  ...(v2Draft.purpose !== undefined ? { purpose: v2Draft.purpose } : { purpose: undefined }),
                                  ...(v2Draft.description !== undefined ? { description: v2Draft.description } : { description: undefined }),
                                  ...(v2Draft.allow_skipping !== undefined ? { allow_skipping: v2Draft.allow_skipping } : {}),
                                  ...(v2Draft.operator_guidance !== undefined ? { operator_guidance: v2Draft.operator_guidance } : { operator_guidance: undefined }),
                                  ...(v2Draft.subject_resolution_strategy !== undefined ? { subject_resolution_strategy: v2Draft.subject_resolution_strategy } : {}),
                                  ...(v2Draft.candidate_actions !== undefined
                                      ? { action_catalog_v1: { version: 1 as const, candidate_actions: v2Draft.candidate_actions } }
                                      : {}),
                              },
                    ),
                );
            }
            setStatusKeys(keys);
            setStatusDisplayLabels(labels);
            await saveActivation({ status_keys: keys, status_labels: labels, completed_steps: 4 });

            if (j.pipeline) {
                setPipeline(j.pipeline);
                setWorkUnitId(j.pipeline.id);
                setWorkUnitName(j.pipeline.name);
                setWorkUnitIdentityState(j.snapshot?.synced ? "synced" : "needs_sync");
                setWorkUnitNeedsSync(!j.snapshot?.synced);
                await saveActivation({
                    work_unit_id: j.pipeline.id,
                    work_unit_name: j.pipeline.name,
                    completed_steps: 4,
                });
            } else if (runtimeDepartmentId) {
                await loadPipeline(runtimeDepartmentId);
            }

            bumpWorkspaceCache();
            // The save moved the draft, not runtime. Re-read the publication state so the bar says
            // "Unpublished changes" rather than leaving a stale "Published".
            await refreshConfigurationState();
            setStageSaveState("saved");
            // The draft landed, but the graph may still be short of publishable. Say so plainly —
            // an operator who is told "Saved" and later refused at publish learns to distrust both.
            setStageSaveNotice(
                stageOperatingPlanSave ? remainingIssuesSummary(stageOperatingPlanSave.assessment) : null,
            );
            setReadyCheckRevision((n) => n + 1);
            stageDirtyRef.current = false;
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Save failed";
            setStageSaveError(msg);
            setStageSaveState("error");
            setStatusesError(msg);
        }
    }, [
        runtimeDepartmentId,
        processId,
        stageKey,
        statusesPayload,
        labelsForKeys,
        dispatchStatusDraft,
        patchStageBootstrap,
        stageBootstrap?.field_requirements,
        saveActivation,
        loadPipeline,
        bumpWorkspaceCache,
        refreshConfigurationState,
        stageBootstrap?.configuration_state,
    ]);

    useEffect(() => {
        if (stageSaveState !== "saved") return;
        const t = window.setTimeout(() => setStageSaveState("idle"), 3000);
        return () => window.clearTimeout(t);
    }, [stageSaveState]);

    const draftStatusLabels = useMemo(
        () =>
            labelsForKeys(
                statusesPayload,
                statusesSaveState.saveDraftKeys,
                stageBootstrap?.queue_membership_status_options
            ),
        [labelsForKeys, statusesPayload, statusesSaveState.saveDraftKeys, stageBootstrap?.queue_membership_status_options]
    );

    const enabledActionsCount = useMemo(
        () => (stageBootstrap?.actions ?? []).filter((row) => row.placements.length > 0).length,
        [stageBootstrap?.actions]
    );

    const onStatusRollupChange = useCallback(
        (_rollup: import("@/lib/lifecycle/statusRollupV1").StatusRollupV1, flatKeys: string[]) => {
            const sk = normalizeLifecycleBuilderStageKey(stageKeyRef.current || stageKey);
            if (!sk) return;
            dispatchStatusDraft({ type: "setKeys", stageKey: sk, keys: flatKeys });
            setStatusesError(null);
            logLifecycleStatusStepDebug("rollup-change", {
                runtimeDepartmentId,
                processId,
                stageKey: sk,
                stageLabel,
                draftStatusKeys: flatKeys,
            });
        },
        [runtimeDepartmentId, processId, stageKey, stageLabel, dispatchStatusDraft]
    );

    const builderProcess = useMemo((): LifecycleBuilderProcessRecord | null => {
        if (!processId || !builderStages.length) return null;
        return {
            id: processId,
            key: "enrollment",
            name: lifecycleName,
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            ...(processTracks ? { tracks_v1: processTracks } : {}),
            stages: builderStages,
        };
    }, [builderStages, lifecycleName, processId, processTracks]);

    const navStages = useMemo(() => {
        if (!processTracks || !builderProcess) return builderStages;
        return stagesForTrack(builderProcess, activeTrackKey);
    }, [activeTrackKey, builderProcess, builderStages, processTracks]);

    const builderStageKeys = useMemo(() => {
        return builderProcess ? stageKeysForProcess(builderProcess) : [];
    }, [builderProcess]);

    const actionsDraft = useProcessActionsMatrixDraft(runtimeDepartmentId, builderStageKeys);
    const selectedActionRow = useMemo(
        () =>
            actionsDraft.rows.find((row) => row.base_action_key === selectedActionKey) ??
            actionsDraft.rows[0] ??
            null,
        [actionsDraft.rows, selectedActionKey],
    );

    useEffect(() => {
        if (processSection !== "actions" || !actionsDraft.rows.length) return;
        if (!selectedActionKey || !actionsDraft.rows.some((row) => row.base_action_key === selectedActionKey)) {
            setSelectedActionKey(actionsDraft.rows[0]!.base_action_key);
        }
    }, [processSection, actionsDraft.rows, selectedActionKey]);

    const resetActivation = useCallback(() => {
        setDepartmentName("");
        setActivationOwned(false);
        setBuilderStages([]);
        setProcessTracks(null);
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
        async (
            deptId: string,
            procId: string,
            entry: LifecycleCatalogEntry | null,
            opts?: { preserveStageSelection?: boolean }
        ) => {
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
            const tracks = process ? readProcessTracks(process) : null;
            setProcessTracks(tracks);
            if (tracks?.tracks.length) {
                setActiveTrackKey((prev) =>
                    tracks.tracks.some((t) => t.key === prev) ? prev : tracks.tracks[0]!.key,
                );
            }
            if (process) {
                setLifecycleName(process.name);
                setLifecycleDescription(process.description?.trim() ?? "");
            }
            const act = aj.activation;
            const preserveStage = opts?.preserveStageSelection && userSelectedStageRef.current;
            const currentStageKey = normalizeLifecycleBuilderStageKey(stageKeyRef.current);
            let nextKey = preserveStage && currentStageKey ? stageKeyRef.current : "";
            let nextLabel = preserveStage && currentStageKey ? stageLabel : "";
            if (!nextKey && act && act.process_id === procId) {
                nextKey = act.stage_key;
                nextLabel = act.stage_label;
                if (!preserveStage) {
                    setWorkUnitId(act.work_unit_id);
                    setWorkUnitName(act.work_unit_name);
                    setStatusKeys(act.status_keys);
                    setStatusDisplayLabels(act.status_labels ?? []);
                }
            }
            if (!nextKey && stagesList.length > 0) {
                nextKey = stagesList[0]!.key;
                nextLabel = stagesList[0]!.label;
            }
            if (!preserveStage || !currentStageKey) {
                setStageKey(nextKey);
                setStageLabel(nextLabel);
                stageKeyRef.current = nextKey;
            }
            if (nextKey && !preserveStage) {
                void loadPipeline(deptId);
            }
            const payload = await loadStatusStages();
            const hydratedKey = normalizeLifecycleBuilderStageKey(
                preserveStage && currentStageKey ? currentStageKey : nextKey
            );
            if (
                payload &&
                hydratedKey &&
                shouldSyncStatusDraftForStage(statusDraftRef.current.dirtyByStage, hydratedKey)
            ) {
                syncStatusKeysFromPayload(payload, hydratedKey, "hydrateFromSelection");
            }
        },
        [loadPipeline, loadStatusStages, syncStatusKeysFromPayload, stageLabel]
    );

    const selectStage = useCallback(
        async (
            stage: LifecycleBuilderStageRecord,
            opts?: { statusesPayload?: EnrollmentStatusStagesPayload | null }
        ) => {
            const sk = normalizeLifecycleBuilderStageKey(stage.key);
            userSelectedStageRef.current = true;
            flushSync(() => {
                setStageKey(stage.key);
                setStageLabel(stage.label);
                setShowAddStage(false);
                setStageSaveState("idle");
                setStageSaveError(null);
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
            // NO durable write here, deliberately.
            //
            // This used to end `void saveActivation({ stage_key, stage_label })`, so selecting a
            // stage to LOOK at it PATCHed the activation bundle and wrote departments.metadata.
            // `activation.stage_key` is not editor position — the runtime reads it as a binding
            // (builderOwnedLifecycleRuntime, lifecycleWorkUnitQueueValidation,
            // lifecycleRuntimeBinding, validateLifecycleActivationRuntime), so browsing the stage
            // list silently repointed which stage the activation targets.
            //
            // Selection is local: the flushSync above owns it and `stageKeyRef` carries it. The
            // explicit save paths (saveStageUnified, saveStageStatuses) persist `stage_key` when
            // the operator actually commits a change to that stage, so restore-on-load now
            // reflects the last stage genuinely configured rather than the last one browsed.
        },
        [statusesPayload, syncStatusKeysFromPayload, loadStatusStages]
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
        const scope = `${runtimeDepartmentId}:${processId}`;
        (async () => {
            if (creatingNew || !runtimeDepartmentId || !processId) {
                if (!cancelled) setBootLoading(false);
                return;
            }
            if (hydratedScopeRef.current === scope) {
                if (!cancelled) setBootLoading(false);
                return;
            }
            try {
                await hydrateFromSelection(runtimeDepartmentId, processId, catalogEntry);
                hydratedScopeRef.current = scope;
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
            } finally {
                if (!cancelled) setBootLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per dept/process scope, not on catalog refresh
    }, [creatingNew, runtimeDepartmentId, processId]);

    useEffect(() => {
        const scope = `${runtimeDepartmentId}:${processId}`;
        if (hydratedScopeRef.current && hydratedScopeRef.current !== scope) {
            hydratedScopeRef.current = null;
            userSelectedStageRef.current = false;
        }
    }, [runtimeDepartmentId, processId]);

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
            if (stage) {
                userSelectedStageRef.current = true;
                await selectStage(stage, { statusesPayload: payload });
            }
            setShowAddStage(false);
        },
        [runtimeDepartmentId, selectStage, loadStatusStages]
    );

    const handleDeleteLifecycle = useCallback(() => {
        if (!canDeleteLifecycle) return;
        if (catalogEntry && onRequestDelete) onRequestDelete();
        else setDeleteOpen(true);
    }, [canDeleteLifecycle, catalogEntry, onRequestDelete]);

    const runtimeStatusLabel =
        runtimeSummary === "pass"
            ? "Connected"
            : runtimeSummary === "fail"
              ? "Needs attention"
              : "Pending";

    const processContextActions = useMemo(() => {
        if (!processId) return null;
        return (
            <details className="relative shrink-0 text-xs" data-testid="lifecycle-board-process-menu">
                <summary className="cursor-pointer list-none rounded-md border border-alloy-forge/15 bg-white px-2 py-1 font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10 [&::-webkit-details-marker]:hidden">
                    More
                </summary>
                <div className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-md border border-alloy-forge/15 bg-white py-1 shadow-md">
                    <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-alloy-midnight/80 hover:bg-alloy-stone/10"
                        onClick={() => setRenameOpen(true)}
                        data-testid="lifecycle-rename"
                    >
                        Rename process
                    </button>
                    {canDeleteLifecycle ?
                        <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-red-800 hover:bg-red-50"
                            onClick={handleDeleteLifecycle}
                            data-testid="lifecycle-activation-delete"
                        >
                            Delete process
                        </button>
                    :   null}
                    {onRepairVisibility || (runtimeDepartmentId && processId) ?
                        <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-alloy-pine hover:bg-alloy-stone/10 disabled:opacity-50"
                            disabled={repairingBusy || !runtimeDepartmentId || !processId}
                            onClick={() =>
                                onRepairVisibility ? onRepairVisibility() : void repairWorkspaceVisibility()
                            }
                            data-testid="lifecycle-activation-repair-workspace"
                        >
                            {repairingBusy ? "Repairing…" : "Repair workspace"}
                        </button>
                    :   null}
                    {activationOwned && runtimeDepartmentId && processId ?
                        <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-alloy-pine hover:bg-alloy-stone/10 disabled:opacity-50"
                            disabled={repairingBusy}
                            onClick={() => void repairLifecycleWorkUnits()}
                            data-testid="lifecycle-activation-repair-work-units"
                        >
                            {repairingBusy ? "Repairing…" : "Repair lifecycle work units"}
                        </button>
                    :   null}
                    <p
                        className="border-t border-alloy-forge/10 px-3 py-1.5 text-[10px] text-alloy-midnight/50"
                        data-testid="lifecycle-activation-runtime-status"
                    >
                        Runtime: {runtimeStatusLabel}
                    </p>
                </div>
            </details>
        );
    }, [
        processId,
        canDeleteLifecycle,
        handleDeleteLifecycle,
        onRepairVisibility,
        runtimeDepartmentId,
        repairingBusy,
        activationOwned,
        runtimeStatusLabel,
        repairWorkspaceVisibility,
        repairLifecycleWorkUnits,
    ]);

    /**
     * Publishing rendered actions UP into an ancestor's state is a render loop waiting to happen,
     * so this seam is now defensive on both counts that made it loop.
     *
     * 1. The callback is held in a ref. It is `setContextActions` today, but any parent passing an
     *    inline handler would otherwise re-fire this effect on every render.
     * 2. The clear runs on real unmount only. It used to be this effect's cleanup, so every
     *    dependency change pushed `null` up before pushing the element back — the ancestor's state
     *    alternated `element → null → element` without end, and each hop re-rendered this subtree.
     *    That starved the main thread: `/organization/processes` never got past "Loading process…",
     *    could not be scrolled, and swallowed clicks on the breadcrumb.
     *
     * `processContextActions` remains the trigger and must stay memoized on stable deps — see
     * `handleRepairVisibility` in LifecycleBuilderPrimary for the dependency that broke it.
     */
    const onContextActionsChangeRef = useRef(onContextActionsChange);
    useEffect(() => {
        onContextActionsChangeRef.current = onContextActionsChange;
    }, [onContextActionsChange]);

    useEffect(() => {
        onContextActionsChangeRef.current?.(processContextActions);
    }, [processContextActions]);

    useEffect(() => () => onContextActionsChangeRef.current?.(null), []);

    if (bootLoading && runtimeDepartmentId && processId) {
        return (
            <p className="text-sm text-alloy-midnight/60" data-testid="lifecycle-activation-loading">
                Loading process…
            </p>
        );
    }

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

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="lifecycle-builder-board">
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
                    <div className="space-y-4">
                        <LifecycleEnrollmentV2TemplateCard
                            departmentId={runtimeDepartmentId}
                            processId={processId}
                            onApplied={async () => {
                                await hydrateFromSelection(runtimeDepartmentId, processId, catalogEntry, {
                                    preserveStageSelection: false,
                                });
                            }}
                        />
                        <LifecycleAddStageForm
                            departmentId={runtimeDepartmentId}
                            processId={processId}
                            isFirstStage
                            onCreated={onStageCreated}
                        />
                    </div>
                )
            ) : (
                <WorkViewsConfigurationProvider
                    departmentId={runtimeDepartmentId}
                    processId={processId}
                    queueLanes={workViewQueueLanes}
                    enabled={Boolean(processId)}
                >
                    <div className="flex min-h-0 flex-1 flex-col">
                    <BusinessProcessConfigurationShell
                        activeSection={processSection}
                        onSelectSection={setProcessSection}
                        listColumn={
                            processSection === "overview" || processSection === "history" ?
                                null
                            : processSection === "work-views" && processId ?
                                <BusinessProcessWorkViewsListColumn />
                            : processSection === "stages" ?
                                <BusinessProcessStagesListColumn
                                    stages={navStages}
                                    activeStageKey={stageKey}
                                    onSelect={(s) => void selectStage(s)}
                                    onAddStageClick={() => setShowAddStage((v) => !v)}
                                    addingStage={showAddStage}
                                />
                            : processSection === "actions" ?
                                <BusinessProcessActionsListColumn
                                    rows={actionsDraft.rows}
                                    loading={actionsDraft.loading}
                                    selectedKey={selectedActionRow?.base_action_key ?? null}
                                    onSelect={setSelectedActionKey}
                                    placementSummary={actionsDraft.placementSummary}
                                    stageSummary={actionsDraft.stageSummary}
                                />
                            : processSection === "health" ?
                                <BusinessProcessHealthListColumn
                                    runtimeSummary={runtimeSummary}
                                    processLabel={builderProcess?.name ?? lifecycleName ?? "This process"}
                                />
                            :   null
                        }
                    >
                        {processSection === "stages" ?
                        <>
                            {processId ?
                                <BusinessProcessParticipationCard
                                    departmentId={runtimeDepartmentId}
                                    processId={processId}
                                />
                            :   null}
                            {showAddStage ?
                                <div className="rounded-lg border border-dashed border-alloy-pine/30 bg-alloy-pine/5 p-3">
                                    <LifecycleAddStageForm
                                        departmentId={runtimeDepartmentId}
                                        processId={processId}
                                        isFirstStage={false}
                                        onCreated={onStageCreated}
                                    />
                                </div>
                            :   null}
                            {stageKey ?
                                <LifecycleStageConfiguration
                                    departmentId={runtimeDepartmentId}
                                    businessProcessKey={builderProcess?.key ?? "enrollment"}
                                    stageKey={stageKey}
                                    stageLabel={stageLabel}
                                    lifecycleName={lifecycleName}
                                    stageRecord={builderStages.find((s) => s.key === stageKey) ?? null}
                                    allStages={builderStages}
                                    processTracks={builderProcess?.tracks_v1 ?? null}
                                    process={builderProcess ?? null}
                                    bootstrap={stageBootstrap}
                                    bootstrapLoading={stageBootstrapLoading}
                                    statusesError={statusesError}
                                    saveState={stageSaveState}
                                    saveError={stageSaveError}
                                    saveNotice={stageSaveNotice}
                                    onSaveStage={saveStageUnified}
                                    onValidateConfiguration={validateConfiguration}
                                    onPublishConfiguration={publishConfiguration}
                                    onReloadConfiguration={reloadConfiguration}
                                    publicationBusy={publicationBusy}
                                    publicationNotice={publicationNotice}
                                    onDirtyChange={(dirty) => {
                                        stageDirtyRef.current = dirty;
                                    }}
                                    onDeleteStage={activationOwned ? () => setDeleteStageOpen(true) : undefined}
                                    workspaceHandleRef={workspaceHandleRef}
                                    validationSlot={null}
                                    readyCheckRefreshKey={`${runtimeDepartmentId}:${readyCheckRevision}`}
                                />
                            :   null}
                        </>
                    :   null}

                    {processSection === "work-views" && processId ?
                        <div className="space-y-0" data-testid="business-process-work-views-with-publication">
                            <BusinessProcessPublicationBar
                                state={publicationSummary ?? stageBootstrap?.configuration_state ?? null}
                                busy={publicationBusy}
                                notice={publicationNotice}
                                onValidate={validateConfiguration}
                                onPublish={publishConfiguration}
                                onReload={reloadConfiguration}
                            />
                            <BusinessProcessWorkViewsSetupWorkspace
                                workUnitKey={pipeline?.key ?? null}
                                stageGrains={builderStages.map((s) => s.grain)}
                                stageGrainByKey={Object.fromEntries(builderStages.map((s) => [s.key, s.grain]))}
                                queueLanes={workViewQueueLanes}
                                onDraftSaved={refreshConfigurationState}
                            />
                        </div>
                    :   null}

                    {processSection === "actions" ?
                        <BusinessProcessActionsSetupWorkspace
                            row={selectedActionRow}
                            operatorStageOptions={actionsDraft.operatorStageOptions}
                            saving={actionsDraft.saving}
                            error={actionsDraft.error}
                            success={actionsDraft.success}
                            onUpdate={(patch) => {
                                if (!selectedActionRow) return;
                                actionsDraft.updateRow(selectedActionRow.base_action_key, patch);
                            }}
                            onTogglePlacement={(placementId) => {
                                if (!selectedActionRow) return;
                                actionsDraft.togglePlacement(selectedActionRow.base_action_key, placementId);
                            }}
                            onToggleStageRestriction={(stage) => {
                                if (!selectedActionRow) return;
                                actionsDraft.toggleStageRestriction(selectedActionRow.base_action_key, stage);
                            }}
                            onSave={() =>
                                void actionsDraft.save(async () => {
                                    await refreshStageBootstrap();
                                })
                            }
                        />
                    :   null}

                    {processSection === "automation" ?
                        <BusinessProcessAutomationShell />
                    :   null}

                    {processSection === "health" ?
                        <div
                            className="process-config-setup-card p-4"
                            data-testid="business-process-health-workspace"
                        >
                            <header className="mb-4">
                                <h3 className="text-lg font-semibold text-alloy-midnight">Configuration Health</h3>
                                <p className="mt-1 text-sm text-alloy-forge/70">
                                    {BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY}
                                </p>
                            </header>
                            {identity ?
                                <LifecycleActivationValidation
                                    identity={identity}
                                    refreshKey={String(readyCheckRevision)}
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
                            :   null}
                        </div>
                    :   null}

                    {processSection === "overview" ?
                        <BusinessProcessOverviewPanel
                            lifecycleName={builderProcess?.name ?? lifecycleName}
                            isActive={catalogEntry?.workspace.department_is_active ?? true}
                            stageLabels={builderStages.map((s) => s.label)}
                            trackLabels={processTracks?.tracks.map((t) => t.label) ?? null}
                            workViewsCount={workViewQueueLanes.length > 0 ? workViewQueueLanes.length : (
                                pipeline ? 0 : null
                            )}
                            runtimeSummary={runtimeSummary}
                            onNavigateSection={setProcessSection}
                        />
                    :   null}

                    {processSection === "history" ?
                        <div className="process-config-setup-card p-4" data-testid="business-process-history-workspace">
                            <header className="mb-3">
                                <h3 className="text-lg font-semibold text-alloy-midnight">
                                    {BUSINESS_PROCESS_HISTORY_TITLE}
                                </h3>
                            </header>
                            <p
                                className="text-sm leading-6 text-alloy-midnight/55"
                                data-capability="planned"
                                data-testid="business-process-history-planned"
                            >
                                {BUSINESS_PROCESS_HISTORY_PLANNED}
                            </p>
                        </div>
                    :   null}
                    </BusinessProcessConfigurationShell>
                    </div>
                </WorkViewsConfigurationProvider>
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
