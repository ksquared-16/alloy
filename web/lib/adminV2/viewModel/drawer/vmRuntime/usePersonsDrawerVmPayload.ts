"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { shouldShowVmDrawerColdShell } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";
import { isChildDrawerVmOpen } from "@/lib/adminV2/viewModel/drawer/child/childDrawerFirstViewportContract";
import { isChildDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import { loadChildDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/child/loadChildDrawerViaViewModel";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";
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
import { prefetchDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import {
    peekPersonsDrawerDisplayVm,
    type PersonsDrawerDisplayVm,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerPayloadPeekSeed";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { putDrawerViewModelCacheEntry } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { buildPersonDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import { buildChildDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";

export type { PersonsDrawerDisplayVm };

export type PersonsDrawerVmPayloadState = {
    activeVm: PersonsDrawerDisplayVm | null;
    displayVm: PersonsDrawerDisplayVm | null;
    isChildSurface: boolean;
    coldLoading: boolean;
    error: string | null;
    suppressFullDrawerLoading: boolean;
    holdPriorPayload: boolean;
};

export function usePersonsDrawerVmPayload(): PersonsDrawerVmPayloadState {
    const {
        drawer,
        drawerVmRender,
        previousDrawer,
        stack,
        consumePersonDrawerPreload,
        drawerRuntimePhase,
        drawerTransitionId,
        completeDrawerRuntimeTransition,
        consumeDrawerSwapFallbackFetch,
    } = useAdminDrawer();

    const isChildSurface = useMemo(
        () =>
            isChildDrawerVmOpen({
                openSource: drawerVmRender.openSource ?? drawer.openSource ?? null,
                presentationEmphasis:
                    drawerVmRender.personDrawerOpenSeed?.presentation_emphasis ??
                    drawer.personDrawerOpenSeed?.presentation_emphasis ??
                    null,
            }),
        [
            drawerVmRender.openSource,
            drawerVmRender.personDrawerOpenSeed?.presentation_emphasis,
            drawer.openSource,
            drawer.personDrawerOpenSeed?.presentation_emphasis,
        ]
    );

    const [displayVm, setDisplayVm] = useState<PersonsDrawerDisplayVm | null>(() =>
        drawer.type === "persons" ? peekPersonsDrawerDisplayVm(drawer) : null
    );
    const [activeVm, setActiveVm] = useState<PersonsDrawerDisplayVm | null>(() =>
        drawer.type === "persons" ? peekPersonsDrawerDisplayVm(drawer) : null
    );
    const [coldLoading, setColdLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchGenRef = useRef(0);
    const enrichGenRef = useRef(0);
    const mountedRef = useRef(false);

    const applyVm = useCallback(
        (vm: PersonsDrawerDisplayVm, reason: string) => {
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
                runtime: vm.surface === "child" ? "child" : "person",
                generation: vm.generation,
                previousDrawer,
                stack,
            });
            prefetchDrawerLayoutRuntimeBody({
                apiPath:
                    vm.surface === "child"
                        ? "/api/admin/layout-runtime/child-drawer-body"
                        : "/api/admin/layout-runtime/person-drawer-body",
                entityId: vm.entity.id,
                queryParams: {
                    opportunityId: drawer.personDrawerOpenSeed?.opportunity_id ?? null,
                },
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
                runtime: vm.surface === "child" ? "child" : "person",
            });
            logDrawerVmRuntime("swap_committed", {
                person_id: vm.entity.id,
                drawer_id: drawer.id,
                swap_commit_ms: payloadApplyMs,
                runtime: vm.surface === "child" ? "child" : "person",
            });
        },
        [completeDrawerRuntimeTransition, drawer, previousDrawer, stack]
    );

    useLayoutEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            logDrawerVmRuntime("mounted", {
                person_id: drawer.id,
                runtime: isChildSurface ? "child" : "person",
                phase: drawerRuntimePhase.phase,
            });
        }
    }, [drawer.id, drawerRuntimePhase.phase, isChildSurface]);

    useLayoutEffect(() => {
        if (drawerVmRender.type !== "persons" || !drawerVmRender.id || drawerVmRender.id === "new") {
            return;
        }
        if (drawer.type !== "persons" || !drawer.id || drawer.id === "new") return;
        const preload = consumePersonDrawerPreload(drawer.id, {
            expectedSurface: isChildSurface ? "child" : "person",
        });
        if (preload && isChildSurface && isChildDrawerViewModelPreload(preload)) {
            applyVm(preload.viewModel, "preload_consume");
            return;
        }
        if (preload && !isChildSurface && isPersonDrawerViewModelPreload(preload)) {
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
        if (sync?.entityType === "persons") {
            if (isChildSurface && isChildDrawerViewModelPreload(sync.preload)) {
                logDrawerVmRuntime("swap_cache_hit", {
                    person_id: drawer.id,
                    runtime: "child",
                });
                applyVm(sync.preload.viewModel, "sync_cache");
                return;
            }
            if (!isChildSurface && isPersonDrawerViewModelPreload(sync.preload)) {
                logDrawerVmRuntime("swap_cache_hit", {
                    person_id: drawer.id,
                    runtime: "person",
                });
                applyVm(sync.preload.viewModel, "sync_cache");
            }
        }
    }, [
        drawerVmRender.type,
        drawerVmRender.id,
        drawer.type,
        drawer.id,
        drawer.openSource,
        drawer.opportunityWorkspaceContext,
        drawer.personDrawerOpenSeed,
        consumePersonDrawerPreload,
        drawerTransitionId,
        drawerRuntimePhase.phase,
        applyVm,
        isChildSurface,
    ]);

    useEffect(() => {
        if (drawerVmRender.type !== "persons") return;
        if (drawer.type !== "persons" || !drawer.id || drawer.id === "new") return;
        if (activeVm && String(activeVm.entity.id) === String(drawer.id)) {
            const surfaceMatches =
                isChildSurface ? activeVm.surface === "child" : activeVm.surface !== "child";
            if (surfaceMatches) return;
        }
        if (displayVm && String(displayVm.entity.id) === String(drawer.id)) {
            const displaySurfaceMatches =
                isChildSurface ? displayVm.surface === "child" : displayVm.surface !== "child";
            if (displaySurfaceMatches) return;
        }

        const needsFallback = consumeDrawerSwapFallbackFetch();
        const holdPrior = shouldHoldPriorDrawerContent(drawerRuntimePhase.phase);

        if (holdPrior && displayVm) {
            logDrawerVmRuntime("swap_hold_current", {
                from_id: displayVm.entity.id,
                to_id: drawer.id,
                runtime: isChildSurface ? "child" : "person",
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
            runtime: isChildSurface ? "child" : "person",
        });

        const loadPromise =
            isChildSurface ?
                loadChildDrawerViaViewModel(drawer.id, { init: workspaceDataFetchInit() })
            :   loadPersonDrawerViaViewModel(drawer.id, {
                    openSource: drawer.openSource ?? null,
                    presentationEmphasis: drawer.personDrawerOpenSeed?.presentation_emphasis ?? null,
                    init: workspaceDataFetchInit(),
                });

        void loadPromise.then((result) => {
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
            const preload = result.preload;
            const validPreload =
                isChildSurface ?
                    isChildDrawerViewModelPreload(preload)
                :   isPersonDrawerViewModelPreload(preload);
            if (!validPreload || !preload.viewModel) {
                setColdLoading(false);
                setError("vm_preload_missing");
                return;
            }
            logDrawerVmRuntime("cold_fetch_ready", {
                person_id: drawer.id,
                runtime: isChildSurface ? "child" : "person",
                cold_fetch_ms: fetchMs,
            });
            applyVm(preload.viewModel, needsFallback ? "swap_fetch" : "cold_fetch");
        });
    }, [
        drawerVmRender.type,
        drawer.type,
        drawer.id,
        drawer.openSource,
        drawer.personDrawerOpenSeed,
        drawerRuntimePhase.phase,
        activeVm,
        displayVm,
        consumeDrawerSwapFallbackFetch,
        applyVm,
        isChildSurface,
    ]);

    useEffect(() => {
        if (!activeVm || drawer.type !== "persons" || !drawer.id) return;
        if (String(activeVm.entity.id) !== String(drawer.id)) return;
        const needsEnrich = activeVm.background_refresh?.allowed?.includes("record_visibility");
        const depth = String(activeVm.record?._person_drawer_vm_compose_depth ?? "").trim();
        if (!needsEnrich || depth !== "first_paint") return;

        const enrichGen = ++enrichGenRef.current;
        logDrawerVmRuntime("background_enrich_start", {
            person_id: drawer.id,
            runtime: isChildSurface ? "child" : "person",
        });

        const loadPromise =
            isChildSurface ?
                loadChildDrawerViaViewModel(drawer.id, { composeDepth: "full", init: workspaceDataFetchInit() })
            :   loadPersonDrawerViaViewModel(drawer.id, {
                    openSource: drawer.openSource ?? null,
                    presentationEmphasis: drawer.personDrawerOpenSeed?.presentation_emphasis ?? null,
                    composeDepth: "full",
                    init: workspaceDataFetchInit(),
                });

        void loadPromise.then((result) => {
            if (enrichGen !== enrichGenRef.current) return;
            if (!result.ok || !result.preload.viewModel) {
                logDrawerVmRuntime("background_enrich_error", {
                    person_id: drawer.id,
                    reason: result.ok ? "missing_vm" : result.reason,
                });
                return;
            }
            const vm = result.preload.viewModel;
            applyVm(vm, "background_enrich");
            const surface = vm.surface === "child" ? "child" : vm.surface === "parent" ? "person:parent" : "person:generic";
            const preload =
                vm.surface === "child" ?
                    buildChildDrawerOpenPreloadFromViewModel(vm)
                :   buildPersonDrawerOpenPreloadFromViewModel(vm);
            putDrawerViewModelCacheEntry(
                {
                    entityType: "persons",
                    entityId: String(drawer.id).trim(),
                    surface,
                    preload,
                    generation: vm.generation ?? null,
                    cachedAt: Date.now(),
                },
                {
                    departmentId: drawer.opportunityWorkspaceContext?.department_id ?? null,
                    workUnitId: drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
                }
            );
            logDrawerVmRuntime("background_enrich_ready", {
                person_id: drawer.id,
                runtime: isChildSurface ? "child" : "person",
            });
        });
    }, [
        activeVm,
        applyVm,
        drawer.id,
        drawer.type,
        drawer.openSource,
        drawer.personDrawerOpenSeed,
        drawer.opportunityWorkspaceContext,
        isChildSurface,
    ]);

    const holdPriorPayload =
        shouldHoldPriorDrawerContent(drawerRuntimePhase.phase) &&
        displayVm != null &&
        String(displayVm.entity.id) !== String(drawer.id);

    const suppressFullDrawerLoading = shouldSuppressFullDrawerLoading(drawerRuntimePhase.phase);

    return {
        activeVm,
        displayVm: holdPriorPayload ? displayVm : activeVm ?? displayVm,
        isChildSurface,
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
    };
}
