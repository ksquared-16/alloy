"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import {
    buildPrepareParamsFromOpenDrawer,
    peekDrawerViewModelPreloadSync,
} from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import {
    shouldHoldPriorDrawerContent,
    shouldSuppressFullDrawerLoading,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
import { isPersonDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import { loadPersonDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/person/loadPersonDrawerViaViewModel";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";
import { scheduleWarmRelatedDrawerTargetsAfterVmApply } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmPayloadWarmRelated";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";

export type PersonDrawerVmPayloadState = {
    activeVm: PersonDrawerViewModel | null;
    displayVm: PersonDrawerViewModel | null;
    coldLoading: boolean;
    error: string | null;
    suppressFullDrawerLoading: boolean;
    holdPriorPayload: boolean;
};

export function usePersonDrawerVmPayload(): PersonDrawerVmPayloadState {
    const {
        drawer,
        consumePersonDrawerPreload,
        drawerRuntimePhase,
        drawerTransitionId,
        completeDrawerRuntimeTransition,
        consumeDrawerSwapFallbackFetch,
    } = useAdminDrawer();

    const [displayVm, setDisplayVm] = useState<PersonDrawerViewModel | null>(null);
    const [activeVm, setActiveVm] = useState<PersonDrawerViewModel | null>(null);
    const [coldLoading, setColdLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchGenRef = useRef(0);
    const mountedRef = useRef(false);

    const applyVm = useCallback(
        (vm: PersonDrawerViewModel, reason: string) => {
            const applyStarted =
                typeof performance !== "undefined" ? performance.now() : Date.now();
            setActiveVm(vm);
            setDisplayVm(vm);
            setColdLoading(false);
            setError(null);
            completeDrawerRuntimeTransition();
            scheduleWarmRelatedDrawerTargetsAfterVmApply({
                drawer,
                entityType: "persons",
                record: vm.record,
                runtime: "person",
                generation: vm.generation,
            });
            const payloadApplyMs =
                typeof performance !== "undefined" ?
                    Math.round(performance.now() - applyStarted)
                :   0;
            logDrawerVmRuntime("payload_ready", {
                person_id: vm.entity.id,
                reason,
                generation: vm.generation,
                payload_apply_ms: payloadApplyMs,
            });
            logDrawerVmRuntime("swap_committed", {
                person_id: vm.entity.id,
                drawer_id: drawer.id,
                swap_commit_ms: payloadApplyMs,
            });
        },
        [completeDrawerRuntimeTransition, drawer]
    );

    useLayoutEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            logDrawerVmRuntime("mounted", {
                person_id: drawer.id,
                runtime: "person",
                phase: drawerRuntimePhase.phase,
            });
        }
    }, [drawer.id, drawerRuntimePhase.phase]);

    useLayoutEffect(() => {
        if (drawer.type !== "persons" || !drawer.id || drawer.id === "new") return;
        const preload = consumePersonDrawerPreload(drawer.id, { expectedSurface: "person" });
        if (preload && isPersonDrawerViewModelPreload(preload)) {
            applyVm(preload.viewModel, "preload_consume");
            return;
        }
        const sync = peekDrawerViewModelPreloadSync(
            buildPrepareParamsFromOpenDrawer({
                type: "persons",
                id: drawer.id,
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                source: drawer.openSource ?? undefined,
                personDrawerOpenSeed: drawer.personDrawerOpenSeed ?? null,
            })
        );
        if (sync?.entityType === "persons" && isPersonDrawerViewModelPreload(sync.preload)) {
            logDrawerVmRuntime("swap_cache_hit", { person_id: drawer.id, runtime: "person" });
            applyVm(sync.preload.viewModel, "sync_cache");
        }
    }, [
        drawer.type,
        drawer.id,
        drawer.openSource,
        drawer.opportunityWorkspaceContext,
        drawer.personDrawerOpenSeed,
        consumePersonDrawerPreload,
        drawerTransitionId,
        drawerRuntimePhase.phase,
        applyVm,
    ]);

    useEffect(() => {
        if (drawer.type !== "persons" || !drawer.id || drawer.id === "new") return;
        if (activeVm && String(activeVm.entity.id) === String(drawer.id)) return;

        const needsFallback = consumeDrawerSwapFallbackFetch();
        const holdPrior = shouldHoldPriorDrawerContent(drawerRuntimePhase.phase);

        if (holdPrior && displayVm) {
            logDrawerVmRuntime("swap_hold_current", {
                from_id: displayVm.entity.id,
                to_id: drawer.id,
                runtime: "person",
            });
        }

        const gen = ++fetchGenRef.current;
        if (!needsFallback && holdPrior) return;

        setColdLoading(!displayVm);
        setError(null);
        const fetchStarted =
            typeof performance !== "undefined" ? performance.now() : Date.now();
        logDrawerVmRuntime(needsFallback ? "swap_fetch_start" : "cold_fetch_start", {
            person_id: drawer.id,
            hold_prior: Boolean(displayVm),
            runtime: "person",
        });

        void loadPersonDrawerViaViewModel(drawer.id, {
            openSource: drawer.openSource ?? null,
            presentationEmphasis: drawer.personDrawerOpenSeed?.presentation_emphasis ?? null,
        }).then((result) => {
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
            if (!isPersonDrawerViewModelPreload(result.preload)) {
                setColdLoading(false);
                setError("vm_preload_missing");
                return;
            }
            logDrawerVmRuntime("cold_fetch_ready", {
                person_id: drawer.id,
                runtime: "person",
                cold_fetch_ms: fetchMs,
            });
            applyVm(result.preload.viewModel, needsFallback ? "swap_fetch" : "cold_fetch");
        });
    }, [
        drawer.type,
        drawer.id,
        drawer.openSource,
        drawer.personDrawerOpenSeed,
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
