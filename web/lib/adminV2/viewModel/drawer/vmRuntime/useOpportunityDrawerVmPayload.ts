"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
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
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";

export type OpportunityDrawerVmPayloadState = {
    activeVm: OpportunityDrawerViewModel | null;
    displayVm: OpportunityDrawerViewModel | null;
    coldLoading: boolean;
    error: string | null;
    suppressFullDrawerLoading: boolean;
    holdPriorPayload: boolean;
};

export function useOpportunityDrawerVmPayload(): OpportunityDrawerVmPayloadState {
    const {
        drawer,
        consumeOpportunityDrawerPreload,
        opportunityPreloadGeneration,
        drawerRuntimePhase,
        completeDrawerRuntimeTransition,
        consumeDrawerSwapFallbackFetch,
    } = useAdminDrawer();

    const [displayVm, setDisplayVm] = useState<OpportunityDrawerViewModel | null>(null);
    const [activeVm, setActiveVm] = useState<OpportunityDrawerViewModel | null>(null);
    const [coldLoading, setColdLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchGenRef = useRef(0);
    const mountedRef = useRef(false);

    const applyVm = useCallback(
        (vm: OpportunityDrawerViewModel, reason: string) => {
            setActiveVm(vm);
            setDisplayVm(vm);
            setColdLoading(false);
            setError(null);
            completeDrawerRuntimeTransition();
            logDrawerVmRuntime("payload_ready", {
                opportunity_id: vm.entity.id,
                reason,
                generation: vm.generation,
            });
            logDrawerVmRuntime("swap_committed", {
                opportunity_id: vm.entity.id,
                drawer_id: drawer.id,
            });
        },
        [completeDrawerRuntimeTransition, drawer.id]
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
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (activeVm && String(activeVm.entity.id) === String(drawer.id)) return;

        const needsFallback = consumeDrawerSwapFallbackFetch();
        const holdPrior = shouldHoldPriorDrawerContent(drawerRuntimePhase.phase);

        if (holdPrior && displayVm) {
            logDrawerVmRuntime("swap_hold", {
                from_id: displayVm.entity.id,
                to_id: drawer.id,
            });
        }

        const gen = ++fetchGenRef.current;
        if (!needsFallback && holdPrior) return;

        setColdLoading(!displayVm);
        setError(null);
        logDrawerVmRuntime(needsFallback ? "swap_fetch_start" : "cold_fetch", {
            opportunity_id: drawer.id,
            hold_prior: Boolean(displayVm),
        });

        void loadOpportunityDrawerViaViewModel(drawer.id, drawer.opportunityWorkspaceContext).then((result) => {
            if (gen !== fetchGenRef.current) return;
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
            applyVm(result.preload.viewModel, needsFallback ? "swap_fetch" : "cold_fetch");
        });
    }, [
        drawer.type,
        drawer.id,
        drawer.opportunityWorkspaceContext,
        drawerRuntimePhase.phase,
        activeVm,
        displayVm,
        consumeDrawerSwapFallbackFetch,
        applyVm,
    ]);

    const holdPriorPayload =
        shouldHoldPriorDrawerContent(drawerRuntimePhase.phase) &&
        displayVm != null &&
        String(displayVm.entity.id) !== String(drawer.id);

    return {
        activeVm,
        displayVm: holdPriorPayload ? displayVm : activeVm ?? displayVm,
        coldLoading: coldLoading && !displayVm && !shouldSuppressFullDrawerLoading(drawerRuntimePhase.phase),
        error,
        suppressFullDrawerLoading: shouldSuppressFullDrawerLoading(drawerRuntimePhase.phase),
        holdPriorPayload,
    };
}
