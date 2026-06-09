"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { shouldShowVmDrawerColdShell } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import {
    buildPrepareParamsFromOpenDrawer,
    peekDrawerViewModelPreloadSync,
} from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import {
    shouldHoldPriorDrawerContent,
    shouldSuppressFullDrawerLoading,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { scheduleWarmRelatedDrawerTargetsAfterVmApply } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmPayloadWarmRelated";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { putDrawerViewModelCacheEntry, invalidateDrawerViewModelCacheForEntity } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { peekOpportunityDrawerDisplayVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerPayloadPeekSeed";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import {
    ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH,
    isTourSurfaceActionKey,
    parseOpportunityDrawerRecordPatchDetail,
} from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { OPPORTUNITY_QUEUE_UPDATED_EVENT, parseOpportunityQueueUpdatedDetail } from "@/lib/admin/opportunityQueueRefreshEvent";
import { fetchOpportunityDrawerHeaderActionsFromRecord } from "@/lib/admin/opportunityDrawerHeaderActionsPrefetch";
import { patchOpportunityDrawerVmDisplayRecord } from "@/lib/adminV2/viewModel/drawer/vmRuntime/patchOpportunityDrawerVmDisplayRecord";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dispatchDrawerLayoutRuntimeBodyInvalidate } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyInvalidate";
import { invalidateDrawerLayoutRuntimeBodyCacheForEntity } from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";

export type OpportunityDrawerVmPayloadState = {
    activeVm: OpportunityDrawerViewModel | null;
    displayVm: OpportunityDrawerViewModel | null;
    coldLoading: boolean;
    error: string | null;
    suppressFullDrawerLoading: boolean;
    holdPriorPayload: boolean;
    patchDisplayRecord: (
        patchFn: (prev: Record<string, unknown>) => Record<string, unknown>
    ) => void;
    reloadOpportunityDisplayVm: () => Promise<void>;
};

export function useOpportunityDrawerVmPayload(): OpportunityDrawerVmPayloadState {
    const {
        drawer,
        drawerVmRender,
        previousDrawer,
        stack,
        consumeOpportunityDrawerPreload,
        opportunityPreloadGeneration,
        drawerRuntimePhase,
        completeDrawerRuntimeTransition,
        consumeDrawerSwapFallbackFetch,
    } = useAdminDrawer();

    const [displayVm, setDisplayVm] = useState<OpportunityDrawerViewModel | null>(() =>
        drawer.type === "opportunities" ? peekOpportunityDrawerDisplayVm(drawer) : null
    );
    const [activeVm, setActiveVm] = useState<OpportunityDrawerViewModel | null>(() =>
        drawer.type === "opportunities" ? peekOpportunityDrawerDisplayVm(drawer) : null
    );
    const [coldLoading, setColdLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchGenRef = useRef(0);
    const mountedRef = useRef(false);

    const applyVm = useCallback(
        (vm: OpportunityDrawerViewModel, reason: string) => {
            const applyStarted =
                typeof performance !== "undefined" ? performance.now() : Date.now();
            setActiveVm(vm);
            setDisplayVm(vm);
            setColdLoading(false);
            setError(null);
            completeDrawerRuntimeTransition();
            putDrawerViewModelCacheEntry(
                {
                    entityType: "opportunities",
                    entityId: vm.entity.id,
                    surface: "opportunity",
                    preload: buildOpportunityDrawerOpenPreloadFromViewModel(vm),
                    generation: vm.generation,
                    cachedAt: Date.now(),
                },
                {
                    departmentId: drawer.opportunityWorkspaceContext?.department_id ?? null,
                    workUnitId: drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
                },
            );
            scheduleWarmRelatedDrawerTargetsAfterVmApply({
                drawer,
                entityType: "opportunities",
                record: vm.above_fold.record,
                runtime: "opportunity",
                generation: vm.generation,
                previousDrawer,
                stack,
            });
            const payloadApplyMs =
                typeof performance !== "undefined" ?
                    Math.round(performance.now() - applyStarted)
                :   0;
            logDrawerVmRuntime("payload_ready", {
                opportunity_id: vm.entity.id,
                reason,
                generation: vm.generation,
                payload_apply_ms: payloadApplyMs,
            });
            logDrawerVmRuntime("swap_committed", {
                opportunity_id: vm.entity.id,
                drawer_id: drawer.id,
                swap_commit_ms: payloadApplyMs,
            });
        },
        [completeDrawerRuntimeTransition, drawer, previousDrawer, stack]
    );

    useLayoutEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            logDrawerVmRuntime("mounted", {
                opportunity_id: drawer.id,
                phase: drawerRuntimePhase.phase,
            });
        }
    }, [drawer.id, drawerRuntimePhase.phase]);

    useLayoutEffect(() => {
        if (drawerVmRender.type !== "opportunities" || !drawerVmRender.id || drawerVmRender.id === "new") {
            return;
        }
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        const preload = consumeOpportunityDrawerPreload(drawer.id);
        if (preload && isOpportunityDrawerViewModelPreload(preload)) {
            applyVm(preload.viewModel, "preload_consume");
            return;
        }
        const sync = peekDrawerViewModelPreloadSync(
            buildPrepareParamsFromOpenDrawer({
                type: "opportunities",
                id: drawer.id,
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                source: drawer.openSource ?? undefined,
            })
        );
        if (sync?.entityType === "opportunities" && isOpportunityDrawerViewModelPreload(sync.preload)) {
            logDrawerVmRuntime("swap_cache_hit", { opportunity_id: drawer.id });
            applyVm(sync.preload.viewModel, "sync_cache");
        }
    }, [
        drawerVmRender.type,
        drawerVmRender.id,
        drawer.type,
        drawer.id,
        drawer.openSource,
        drawer.opportunityWorkspaceContext,
        consumeOpportunityDrawerPreload,
        opportunityPreloadGeneration,
        drawerRuntimePhase.phase,
        applyVm,
    ]);

    useEffect(() => {
        if (drawerVmRender.type !== "opportunities") return;
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (activeVm && String(activeVm.entity.id) === String(drawer.id)) return;
        if (displayVm && String(displayVm.entity.id) === String(drawer.id)) return;

        const needsFallback = consumeDrawerSwapFallbackFetch();
        const holdPrior = shouldHoldPriorDrawerContent(drawerRuntimePhase.phase);

        if (holdPrior && displayVm) {
            logDrawerVmRuntime("swap_hold_current", {
                from_id: displayVm.entity.id,
                to_id: drawer.id,
                runtime: "opportunity",
            });
        }

        const gen = ++fetchGenRef.current;
        if (!needsFallback && holdPrior) return;

        setColdLoading(!displayVm);
        setError(null);
        const fetchStarted =
            typeof performance !== "undefined" ? performance.now() : Date.now();
        logDrawerVmRuntime(needsFallback ? "swap_fetch_start" : "cold_fetch_start", {
            opportunity_id: drawer.id,
            hold_prior: Boolean(displayVm),
            runtime: "opportunity",
        });

        void loadOpportunityDrawerViaViewModel(drawer.id, drawer.opportunityWorkspaceContext).then((result) => {
            if (gen !== fetchGenRef.current) return;
            const fetchMs =
                typeof performance !== "undefined" ?
                    Math.round(performance.now() - fetchStarted)
                :   0;
            if (!result.ok) {
                setColdLoading(false);
                setError(result.reason);
                return;
            }
            if (!isOpportunityDrawerViewModelPreload(result.preload)) {
                setColdLoading(false);
                setError("vm_preload_missing");
                return;
            }
            logDrawerVmRuntime("cold_fetch_ready", {
                opportunity_id: drawer.id,
                runtime: "opportunity",
                cold_fetch_ms: fetchMs,
            });
            applyVm(result.preload.viewModel, needsFallback ? "swap_fetch" : "cold_fetch");
        });
    }, [
        drawerVmRender.type,
        drawer.type,
        drawer.id,
        drawer.opportunityWorkspaceContext,
        drawerRuntimePhase.phase,
        activeVm,
        displayVm,
        consumeDrawerSwapFallbackFetch,
        applyVm,
    ]);

    const patchDisplayRecord = useCallback(
        (patchFn: (prev: Record<string, unknown>) => Record<string, unknown>) => {
            const applyPatch = (vm: OpportunityDrawerViewModel | null) => {
                if (!vm || String(vm.entity.id) !== String(drawer.id)) return vm;
                const currentRecord = vm.above_fold.record ?? {};
                const nextRecord = patchFn({ ...currentRecord });
                return patchOpportunityDrawerVmDisplayRecord(vm, nextRecord);
            };
            setDisplayVm(applyPatch);
            setActiveVm(applyPatch);
        },
        [drawer.id]
    );

    const reloadOpportunityDisplayVm = useCallback(async () => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        const id = drawer.id.trim();
        invalidateDrawerViewModelCacheForEntity("opportunities", id, {
            departmentId: drawer.opportunityWorkspaceContext?.department_id ?? null,
            workUnitId: drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
        });
        invalidateDrawerLayoutRuntimeBodyCacheForEntity(
            "/api/admin/layout-runtime/opportunity-drawer-body",
            id,
        );
        dispatchDrawerLayoutRuntimeBodyInvalidate({
            entityType: "opportunities",
            entityId: id,
        });
        const result = await loadOpportunityDrawerViaViewModel(
            id,
            drawer.opportunityWorkspaceContext ?? null,
            workspaceDataFetchInit(),
        );
        if (result.ok && isOpportunityDrawerViewModelPreload(result.preload)) {
            applyVm(result.preload.viewModel, "inquiry_child_reload");
        }
    }, [applyVm, drawer.id, drawer.opportunityWorkspaceContext, drawer.type]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        const oid = drawer.id.trim();

        const onRecordPatch = (ev: Event) => {
            const detail = parseOpportunityDrawerRecordPatchDetail(ev);
            if (!detail || detail.opportunity_id !== oid) return;
            patchDisplayRecord(() => detail.record);
        };

        const onQueueUpdated = (ev: Event) => {
            const detail = parseOpportunityQueueUpdatedDetail(ev);
            const id = (detail?.id ?? "").trim();
            if (!id || id !== oid) return;
            const actionKey = (detail?.action_key ?? "").trim();
            if (!isTourSurfaceActionKey(actionKey)) return;

            const record = (displayVm?.above_fold.record ?? {}) as Record<string, unknown>;
            void fetchOpportunityDrawerHeaderActionsFromRecord(
                oid,
                drawer.opportunityWorkspaceContext ?? null,
                record,
                workspaceDataFetchInit()
            ).then((resolved) => {
                const applyHeaderRefresh = (vm: OpportunityDrawerViewModel | null) => {
                    if (!vm || String(vm.entity.id) !== oid) return vm;
                    return patchOpportunityDrawerVmDisplayRecord(vm, vm.above_fold.record ?? {}, resolved);
                };
                setDisplayVm(applyHeaderRefresh);
                setActiveVm(applyHeaderRefresh);
            });
        };

        window.addEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, onRecordPatch as EventListener);
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
        return () => {
            window.removeEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, onRecordPatch as EventListener);
            window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
        };
    }, [drawer.type, drawer.id, drawer.opportunityWorkspaceContext, displayVm?.above_fold.record, patchDisplayRecord]);

    const holdPriorPayload =
        shouldHoldPriorDrawerContent(drawerRuntimePhase.phase) &&
        displayVm != null &&
        String(displayVm.entity.id) !== String(drawer.id);

    const suppressFullDrawerLoading = shouldSuppressFullDrawerLoading(drawerRuntimePhase.phase);

    return {
        activeVm,
        displayVm: holdPriorPayload ? displayVm : activeVm ?? displayVm,
        coldLoading:
            coldLoading &&
            !displayVm &&
            shouldShowVmDrawerColdShell({
                coldLoading,
                hasDisplayVm: Boolean(displayVm),
                suppressFullDrawerLoading,
                renderDrawer: drawerVmRender,
                targetDrawer: drawer,
            }),
        error,
        suppressFullDrawerLoading,
        holdPriorPayload,
        patchDisplayRecord,
        reloadOpportunityDisplayVm,
    };
}
