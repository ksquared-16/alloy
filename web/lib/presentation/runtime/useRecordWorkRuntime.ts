"use client";

/**
 * THE OPPORTUNITY RECORD WORK RUNTIME — headless, Runtime-Focus-owned.
 *
 * The committed subject (Record of Attention) is the SOLE input. This runtime resolves that subject
 * into the record VM and keeps it current — it never reads `AdminDrawerContext`, never owns open/close
 * or overlay state, and is not a second subject owner. It is the extraction of the record-work half of
 * `useOpportunityDrawerVmPayload` (VM load, cache, settlement/stage-work, mutation, refresh, latest-wins
 * swap continuity) with the drawer half (phase machine, preload/swap coordinator, stack, open-defer)
 * removed. Card composition still comes from the published Surface via the existing derivation; this
 * runtime only supplies the VM those cards bind to.
 *
 * WHY IT EXISTS. On Work Unit entry, Runtime Focus commits the DEFAULT subject with no queue-row click,
 * so the drawer store is never populated — the drawer-coupled payload hook fired no VM request and the
 * configured Focus Panel cards stayed empty until a click. Sourcing the subject from committed Focus
 * makes the VM load on the first operational frame. Do not reintroduce a subject read from the drawer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
    loadOpportunityDrawerViaViewModel,
    type LoadOpportunityDrawerViaViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { opportunityDrawerViewModelHardCutoverFailureMessage } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelHardCutover";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { putDrawerViewModelCacheEntry } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { prefetchDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import {
    applyStageWorkSliceToVm,
    markStageWorkErrorOnVm,
} from "@/lib/adminV2/viewModel/drawer/opportunity/applyStageWorkSliceToVm";
import type { OpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import {
    getOpportunityStageWorkInflight,
    getOpportunityStageWorkWarm,
    invalidateOpportunityStageWorkCache,
    opportunityStageWorkCacheKey,
    prefetchOpportunityStageWork,
} from "@/lib/adminV2/viewModel/drawer/opportunity/stageWork/opportunityStageWorkResource";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import {
    ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH,
    isTourSurfaceActionKey,
    mergeOpportunityDrawerDisplayRecordPatch,
    parseOpportunityDrawerRecordPatchDetail,
} from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { OPPORTUNITY_QUEUE_UPDATED_EVENT, parseOpportunityQueueUpdatedDetail } from "@/lib/admin/opportunityQueueRefreshEvent";
import { fetchOpportunityDrawerHeaderActionsFromRecord } from "@/lib/admin/opportunityDrawerHeaderActionsPrefetch";
import { patchOpportunityDrawerVmDisplayRecord } from "@/lib/adminV2/viewModel/drawer/vmRuntime/patchOpportunityDrawerVmDisplayRecord";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type RecordWorkRuntimeState = {
    displayVm: OpportunityDrawerViewModel | null;
    coldLoading: boolean;
    error: string | null;
    /** True while the prior subject's resolved VM is held during a subject swap (no skeleton flash). */
    holdPriorPayload: boolean;
    patchDisplayRecord: (patchFn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
    reloadDisplayVm: () => Promise<void>;
};

function formatLoadError(result: Extract<LoadOpportunityDrawerViaViewModelResult, { ok: false }>): string {
    if (result.reason === "composed_not_ready" && result.missing_fields?.length) {
        return `Focus Panel is preparing required fields: ${result.missing_fields.join(", ")}.`;
    }
    return opportunityDrawerViewModelHardCutoverFailureMessage(result);
}

/**
 * Resolve a VM's deferred stage-work slice (the Current Work card's content). Reuses the warm /
 * in-flight / prefetch resource exactly as the deferred effect did — extracted so the subject load
 * can merge it BEFORE the first paint, giving a single complete reveal instead of a VM-then-stage-work
 * resize (Kelly: cards must appear all at once, fully sized). Returns null on error (caller marks it).
 */
async function resolveStageWorkSliceForVm(
    vm: OpportunityDrawerViewModel,
): Promise<OpportunityStageWorkSlice | null> {
    const params = {
        opportunityId: vm.entity.id,
        departmentId: vm.workspace.department_id ?? null,
        stageKey: vm.workspace.lifecycle_rail?.current_stage_key ?? null,
        stageLabel: vm.workspace.stage_context?.stage_label ?? null,
    };
    // No resolvable stage-work key → the empty slice (a legitimate "no current work" state, not error).
    if (!opportunityStageWorkCacheKey(params)) {
        return { stage_work_runtime: null, published_stage_inputs: null, work_intent_runtime: null };
    }
    const warm = getOpportunityStageWorkWarm(params);
    if (warm) return warm;
    try {
        return await (getOpportunityStageWorkInflight(params) ?? prefetchOpportunityStageWork(params));
    } catch {
        return null;
    }
}

/** Merge stage-work into a VM before apply so the applied VM is COMPLETE (never `pending`). */
async function completeVmWithStageWork(
    vm: OpportunityDrawerViewModel,
): Promise<OpportunityDrawerViewModel> {
    if (vm.workspace.stage_work?.status !== "pending") return vm;
    const slice = await resolveStageWorkSliceForVm(vm);
    return slice ? applyStageWorkSliceToVm(vm, slice) : markStageWorkErrorOnVm(vm);
}

/**
 * Prewarm a subject's COMPLETE record work (VM + stage-work) into the shared caches, so a later
 * `useRecordWorkRuntime(subjectId)` resolves and reveals atomically without a fetch. Used by adjacent
 * subject preparation (#6): since the reveal now waits for stage-work, warming the VM alone would
 * still leave a stage-work fetch on click — warm both. Fire-and-forget; failures are ignored.
 */
export async function prewarmRecordWork(subjectId: string): Promise<void> {
    const id = subjectId.trim();
    if (!id) return;
    try {
        const result = await loadOpportunityDrawerViaViewModel(id, null);
        if (!result.ok || !isOpportunityDrawerViewModelPreload(result.preload)) return;
        await completeVmWithStageWork(result.preload.viewModel); // warms the stage-work resource too
    } catch {
        /* non-fatal prewarm */
    }
}

export function useRecordWorkRuntime(subjectId: string | null): RecordWorkRuntimeState {
    const [displayVm, setDisplayVm] = useState<OpportunityDrawerViewModel | null>(null);
    const [coldLoading, setColdLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchGenRef = useRef(0);

    const validSubject = subjectId && subjectId !== "new" ? subjectId : null;

    const applyVm = useCallback((vm: OpportunityDrawerViewModel, reason: string) => {
        const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        setDisplayVm(vm);
        setColdLoading(false);
        setError(null);
        // Session VM cache — context derives from the VM itself, never from a drawer store.
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
                departmentId: vm.workspace.department_id ?? null,
                workUnitId: vm.workspace.work_unit_id ?? null,
            },
        );
        prefetchDrawerLayoutRuntimeBody({
            apiPath: "/api/admin/layout-runtime/opportunity-drawer-body",
            entityId: vm.entity.id,
            queryParams: {
                departmentId: vm.workspace.department_id ?? null,
                workUnitId: vm.workspace.work_unit_id ?? null,
            },
        });
        const applyMs = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
        logDrawerVmRuntime("payload_ready", { opportunity_id: vm.entity.id, reason, generation: vm.generation, payload_apply_ms: applyMs });
    }, []);

    // ── Subject resolution — the ONE effect that turns a committed subject into a VM. Latest-wins via
    //    the generation guard; the prior VM is held (never cleared) so a subject swap shows the prior
    //    resolved grid until the new one lands. ──
    useEffect(() => {
        if (!validSubject) {
            fetchGenRef.current++;
            setDisplayVm(null);
            setColdLoading(false);
            setError(null);
            return;
        }
        if (displayVm && String(displayVm.entity.id) === String(validSubject)) return;

        const gen = ++fetchGenRef.current;
        setColdLoading(!displayVm);
        setError(null);
        logDrawerVmRuntime("cold_fetch_start", { opportunity_id: validSubject, runtime: "opportunity", hold_prior: Boolean(displayVm) });

        void loadOpportunityDrawerViaViewModel(validSubject, null).then(async (result) => {
            if (gen !== fetchGenRef.current) return; // superseded by a newer subject — never lands
            if (!result.ok) {
                setColdLoading(false);
                setError(formatLoadError(result));
                logDrawerVmRuntime("cold_fetch_error", { opportunity_id: validSubject, reason: result.reason });
                return;
            }
            if (!isOpportunityDrawerViewModelPreload(result.preload)) {
                setColdLoading(false);
                setError("vm_preload_missing");
                return;
            }
            // ATOMIC COMPLETE REVEAL (Kelly): resolve the deferred stage-work BEFORE applying, so the
            // panel's FIRST and only paint is complete — all cards, final size, no "Loading current
            // work…" → resize. The prior subject stays held throughout (never cleared), so a row → row
            // swap reveals the new subject atomically instead of flashing a half-built card.
            const completeVm = await completeVmWithStageWork(result.preload.viewModel);
            if (gen !== fetchGenRef.current) return; // superseded during the stage-work resolve
            applyVm(completeVm, "cold_fetch");
        });
    }, [validSubject, displayVm, applyVm]);

    const patchDisplayRecord = useCallback(
        (patchFn: (prev: Record<string, unknown>) => Record<string, unknown>) => {
            setDisplayVm((vm) => {
                if (!vm || String(vm.entity.id) !== String(validSubject)) return vm;
                const nextRecord = patchFn({ ...(vm.above_fold.record ?? {}) });
                return patchOpportunityDrawerVmDisplayRecord(vm, nextRecord);
            });
        },
        [validSubject],
    );

    const reloadDisplayVm = useCallback(async () => {
        if (!validSubject) return;
        const result = await loadOpportunityDrawerViaViewModel(validSubject, null);
        if (!result.ok || !isOpportunityDrawerViewModelPreload(result.preload)) return;
        // Same atomic contract as the initial load — reload reveals a complete VM, not a resize.
        applyVm(await completeVmWithStageWork(result.preload.viewModel), "reload");
    }, [validSubject, applyVm]);

    // ── Targeted refresh: record-patch + queue-updated events (same contracts as the drawer path). ──
    useEffect(() => {
        if (!validSubject) return;
        const oid = validSubject.trim();

        const onRecordPatch = (ev: Event) => {
            const detail = parseOpportunityDrawerRecordPatchDetail(ev);
            if (!detail || detail.opportunity_id !== oid) return;
            patchDisplayRecord((prev) => mergeOpportunityDrawerDisplayRecordPatch(prev, detail.record));
        };
        const onQueueUpdated = (ev: Event) => {
            const detail = parseOpportunityQueueUpdatedDetail(ev);
            const id = (detail?.id ?? "").trim();
            if (!id || id !== oid) return;
            invalidateOpportunityStageWorkCache({ opportunityId: oid });
            const actionKey = (detail?.action_key ?? "").trim();
            if (!isTourSurfaceActionKey(actionKey)) return;
            setDisplayVm((vm) => {
                if (!vm || String(vm.entity.id) !== oid) return vm;
                void fetchOpportunityDrawerHeaderActionsFromRecord(
                    oid,
                    null,
                    (vm.above_fold.record ?? {}) as Record<string, unknown>,
                    workspaceDataFetchInit(),
                ).then((resolved) => {
                    setDisplayVm((cur) =>
                        cur && String(cur.entity.id) === oid
                            ? patchOpportunityDrawerVmDisplayRecord(cur, cur.above_fold.record ?? {}, resolved)
                            : cur,
                    );
                });
                return vm;
            });
        };

        window.addEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, onRecordPatch as EventListener);
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
        return () => {
            window.removeEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, onRecordPatch as EventListener);
            window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
        };
    }, [validSubject, patchDisplayRecord]);

    // ── Deferred stage work (Tier 2) — resolve Current Work after first paint, scoped to the subject. ──
    const stageWorkStatus = displayVm?.workspace.stage_work?.status;
    const stageWorkOppId = displayVm?.entity.id ?? null;
    const stageWorkStageKey = displayVm?.workspace.lifecycle_rail?.current_stage_key ?? null;
    const stageWorkDeptId = displayVm?.workspace.department_id ?? null;
    const stageWorkStageLabel = displayVm?.workspace.stage_context?.stage_label ?? null;
    useEffect(() => {
        if (!validSubject || !stageWorkOppId) return;
        if (stageWorkStatus !== "pending") return;
        if (String(validSubject) !== String(stageWorkOppId)) return;

        const params = {
            opportunityId: stageWorkOppId,
            departmentId: stageWorkDeptId,
            stageKey: stageWorkStageKey,
            stageLabel: stageWorkStageLabel,
        };
        const applyIfCurrent = (slice: OpportunityStageWorkSlice) =>
            setDisplayVm((vm) => (vm && String(vm.entity.id) === String(stageWorkOppId) ? applyStageWorkSliceToVm(vm, slice) : vm));

        if (!opportunityStageWorkCacheKey(params)) {
            applyIfCurrent({ stage_work_runtime: null, published_stage_inputs: null, work_intent_runtime: null });
            return;
        }
        let cancelled = false;
        const warm = getOpportunityStageWorkWarm(params);
        if (warm) {
            applyIfCurrent(warm);
            return;
        }
        const pending = getOpportunityStageWorkInflight(params) ?? prefetchOpportunityStageWork(params);
        void pending
            .then((slice) => {
                if (cancelled) return;
                if (slice) applyIfCurrent(slice);
                else setDisplayVm((vm) => (vm && String(vm.entity.id) === String(stageWorkOppId) ? markStageWorkErrorOnVm(vm) : vm));
            })
            .catch(() => {
                if (cancelled) return;
                setDisplayVm((vm) => (vm && String(vm.entity.id) === String(stageWorkOppId) ? markStageWorkErrorOnVm(vm) : vm));
            });
        return () => {
            cancelled = true;
        };
    }, [validSubject, stageWorkOppId, stageWorkStatus, stageWorkStageKey, stageWorkDeptId, stageWorkStageLabel]);

    const holdPriorPayload = displayVm != null && validSubject != null && String(displayVm.entity.id) !== String(validSubject);

    return {
        displayVm,
        coldLoading: coldLoading && !displayVm,
        error,
        holdPriorPayload,
        patchDisplayRecord,
        reloadDisplayVm,
    };
}
