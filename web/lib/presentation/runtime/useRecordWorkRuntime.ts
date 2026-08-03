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
    logCurrentWorkInit,
    nextCurrentWorkInstanceId,
} from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";
import {
    loadOpportunityDrawerViaViewModel,
    type LoadOpportunityDrawerViaViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { opportunityDrawerViewModelHardCutoverFailureMessage } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelHardCutover";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import {
    invalidateDrawerViewModelCacheForEntity,
    putDrawerViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { dispatchDrawerLayoutRuntimeBodyInvalidate } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyInvalidate";
import {
    invalidateDrawerLayoutRuntimeBodyCacheForEntity,
    prefetchDrawerLayoutRuntimeBody,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
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
    mergeOpportunityDrawerDisplayRecordPatch,
    parseOpportunityDrawerRecordPatchDetail,
} from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { OPPORTUNITY_QUEUE_UPDATED_EVENT, parseOpportunityQueueUpdatedDetail } from "@/lib/admin/opportunityQueueRefreshEvent";
import { fetchOpportunityDrawerHeaderActionsFromRecord } from "@/lib/admin/opportunityDrawerHeaderActionsPrefetch";
import { patchOpportunityDrawerVmDisplayRecord } from "@/lib/adminV2/viewModel/drawer/vmRuntime/patchOpportunityDrawerVmDisplayRecord";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    beginWorkUnitPrimaryReveal,
    endWorkUnitPrimaryReveal,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";
import { planRecordWorkRefresh } from "@/lib/presentation/runtime/recordWorkRefreshPlan";

export type RecordWorkRuntimeState = {
    displayVm: OpportunityDrawerViewModel | null;
    coldLoading: boolean;
    error: string | null;
    /** True while the prior subject's resolved VM is held during a subject swap (no skeleton flash). */
    holdPriorPayload: boolean;
    patchDisplayRecord: (patchFn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
    reloadDisplayVm: (opts?: { forceFresh?: boolean }) => Promise<void>;
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
 *
 * When `force` is set (work-lifecycle reload), bypass warm so post-mutation stage-work is authoritative.
 * Cold path keeps seed reuse: a valid provisioning `focusPanelStageWork` seed wins and avoids `/stage-work`.
 */
export async function resolveStageWorkSliceForVm(
    vm: OpportunityDrawerViewModel,
    opts?: { force?: boolean },
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
    if (!opts?.force) {
        const warm = getOpportunityStageWorkWarm(params);
        if (warm) return warm;
    }
    try {
        return await (
            getOpportunityStageWorkInflight(params)
            ?? prefetchOpportunityStageWork(params, { force: opts?.force === true })
        );
    } catch {
        return null;
    }
}

/** Merge stage-work into a VM before apply so the applied VM is COMPLETE (never `pending`). */
export async function completeVmWithStageWork(
    vm: OpportunityDrawerViewModel,
    opts?: { force?: boolean },
): Promise<OpportunityDrawerViewModel> {
    if (!opts?.force && vm.workspace.stage_work?.status !== "pending") return vm;
    const slice = await resolveStageWorkSliceForVm(vm, opts);
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
    // Monotonic guard for reload/recompose responses. Subject swaps are guarded by fetchGenRef; this
    // orders concurrent reloads of the SAME subject so a stale response cannot overwrite newer state.
    const reloadGenRef = useRef(0);
    // Stable per-mount id for the fetch owner (Phase A duplicate-init diagnostics).
    const runtimeIdRef = useRef<string>("");
    if (!runtimeIdRef.current) runtimeIdRef.current = nextCurrentWorkInstanceId("recordRuntime");
    const displayVmRef = useRef<OpportunityDrawerViewModel | null>(null);
    displayVmRef.current = displayVm;

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
        if (displayVm && String(displayVm.entity.id) === String(validSubject)) {
            logCurrentWorkInit("recordRuntime.fetch.skip", {
                subjectId: validSubject,
                runtimeId: runtimeIdRef.current,
                reqGen: fetchGenRef.current,
                cache: "hit",
                note: "displayVm already matches subject — no refetch",
            });
            return;
        }

        const gen = ++fetchGenRef.current;
        setColdLoading(!displayVm);
        setError(null);
        // AMPLIFICATION FIX: mark the primary reveal ACTIVE so the prewarm scheduler DEFERS speculative
        // neighbour/related prewarm until the selected subject is meaningful — the scheduler's own law
        // ("prewarm must never compete with the primary reveal") was dead code (no caller). Without
        // this, adjacent-subject VM prewarms fire concurrently with the selected reveal and saturate
        // the DB, inflating the selected panel's own requests. `endWorkUnitPrimaryReveal` is called on
        // EVERY completion path below + in cleanup, so prewarm can never stall.
        beginWorkUnitPrimaryReveal();
        logCurrentWorkInit("recordRuntime.fetch.start", {
            subjectId: validSubject,
            runtimeId: runtimeIdRef.current,
            reqGen: gen,
            cacheKey: `opportunity:${validSubject}`,
            preloadSource: "live",
            cache: "miss",
            note: displayVm ? "hold_prior" : "cold",
        });
        logDrawerVmRuntime("cold_fetch_start", { opportunity_id: validSubject, runtime: "opportunity", hold_prior: Boolean(displayVm) });

        void loadOpportunityDrawerViaViewModel(validSubject, null).then(async (result) => {
            if (gen !== fetchGenRef.current) return; // superseded by a newer subject — never lands (its begin owns the reveal)
            if (!result.ok) {
                setColdLoading(false);
                setError(formatLoadError(result));
                logDrawerVmRuntime("cold_fetch_error", { opportunity_id: validSubject, reason: result.reason });
                endWorkUnitPrimaryReveal(); // reveal failed — release prewarm (no displayVm change to trigger cleanup)
                return;
            }
            if (!isOpportunityDrawerViewModelPreload(result.preload)) {
                setColdLoading(false);
                setError("vm_preload_missing");
                endWorkUnitPrimaryReveal();
                return;
            }
            // ATOMIC COMPLETE REVEAL (Kelly): resolve the deferred stage-work BEFORE applying, so the
            // panel's FIRST and only paint is complete — all cards, final size, no "Loading current
            // work…" → resize. The prior subject stays held throughout (never cleared), so a row → row
            // swap reveals the new subject atomically instead of flashing a half-built card.
            // Seed reuse (CP-2): warm from provisioning focusPanelStageWork wins — no second /stage-work.
            const completeVm = await completeVmWithStageWork(result.preload.viewModel);
            if (gen !== fetchGenRef.current) return; // superseded during the stage-work resolve
            logCurrentWorkInit("recordRuntime.fetch.apply", {
                subjectId: validSubject,
                runtimeId: runtimeIdRef.current,
                reqGen: gen,
                preloadSource: "live",
                cache: "live",
                note: "atomic complete reveal (stage-work pre-resolved)",
            });
            applyVm(completeVm, "cold_fetch");
        });
        // On success, applyVm changes displayVm → this effect re-runs → this cleanup ends the reveal
        // (flushing deferred prewarm). Also covers subject swap + unmount. Idempotent.
        return () => endWorkUnitPrimaryReveal();
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

    const invalidateVmCachesForSubject = useCallback((opportunityId: string) => {
        const vm = displayVmRef.current;
        const departmentId = vm?.workspace.department_id ?? null;
        const workUnitId = vm?.workspace.work_unit_id ?? null;
        invalidateDrawerViewModelCacheForEntity("opportunities", opportunityId, {
            departmentId,
            workUnitId,
        });
        invalidateDrawerLayoutRuntimeBodyCacheForEntity(
            "/api/admin/layout-runtime/opportunity-drawer-body",
            opportunityId,
        );
        dispatchDrawerLayoutRuntimeBodyInvalidate({
            entityType: "opportunities",
            entityId: opportunityId,
        });
    }, []);

    const reloadDisplayVm = useCallback(async (opts?: { forceFresh?: boolean }) => {
        if (!validSubject) return;
        // Stale-response protection: capture the subject generation (guards a subject swap during the
        // reload) and a monotonic reload generation (orders concurrent reloads of the same subject). A
        // response that is no longer the latest for its subject is dropped, never applied.
        const subjectGen = fetchGenRef.current;
        const reloadGen = ++reloadGenRef.current;
        const forceFresh = opts?.forceFresh === true;
        if (forceFresh) {
            invalidateVmCachesForSubject(validSubject);
            invalidateOpportunityStageWorkCache({ opportunityId: validSubject });
        }
        const result = await loadOpportunityDrawerViaViewModel(validSubject, null);
        if (subjectGen !== fetchGenRef.current || reloadGen !== reloadGenRef.current) return;
        if (!result.ok || !isOpportunityDrawerViewModelPreload(result.preload)) return;
        const completeVm = await completeVmWithStageWork(result.preload.viewModel, {
            force: forceFresh,
        });
        if (subjectGen !== fetchGenRef.current || reloadGen !== reloadGenRef.current) return;
        // Same atomic contract as the initial load — reload reveals a complete VM, not a resize.
        applyVm(completeVm, forceFresh ? "reload_fresh" : "reload");
    }, [validSubject, applyVm, invalidateVmCachesForSubject]);

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
            const actionKey = (detail?.action_key ?? "").trim();
            const plan = planRecordWorkRefresh(actionKey);

            if (plan.invalidateVmCache) {
                invalidateVmCachesForSubject(oid);
            }
            if (plan.invalidateStageWork) {
                invalidateOpportunityStageWorkCache({ opportunityId: oid });
            }

            if (plan.kind === "field_readiness") {
                // Record patch already updated authoritative field truth; What's Next recomposes
                // Still needed from that truth. Do not reload a cached VM over it.
                logCurrentWorkInit("recordRuntime.event.field_readiness", {
                    subjectId: oid,
                    runtimeId: runtimeIdRef.current,
                    cache: "record-patch",
                    note: `queue-updated (${actionKey || "no-action"}) → recompose from patched record (no stage-work fetch)`,
                });
                return;
            }

            if (plan.refreshHeaderActions) {
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
                return;
            }

            if (plan.reloadDisplayVm) {
                logCurrentWorkInit("recordRuntime.event.reload", {
                    subjectId: oid,
                    runtimeId: runtimeIdRef.current,
                    cache: "event-reload",
                    note: `queue-updated (${actionKey || "no-action"}) → force-fresh VM + stage-work`,
                });
                void reloadDisplayVm({ forceFresh: plan.forceStageWork });
            }
        };

        window.addEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, onRecordPatch as EventListener);
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
        return () => {
            window.removeEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, onRecordPatch as EventListener);
            window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated as EventListener);
        };
    }, [validSubject, patchDisplayRecord, reloadDisplayVm, invalidateVmCachesForSubject]);

    // ── Deferred stage work (Tier 2) — resolve Current Work after first paint, scoped to the subject. ──
    // Only when the applied VM still marks stage_work pending (seed miss / incomplete cold path).
    // A valid CP-2 seed makes cold apply non-pending — this effect must not issue a second fetch.
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
            logCurrentWorkInit("recordRuntime.deferred.warm", {
                subjectId: stageWorkOppId,
                runtimeId: runtimeIdRef.current,
                cache: "hit",
                note: "deferred stage-work served warm (no network)",
            });
            applyIfCurrent(warm);
            return;
        }
        logCurrentWorkInit("recordRuntime.deferred.fetch", {
            subjectId: stageWorkOppId,
            runtimeId: runtimeIdRef.current,
            cache: "deferred",
            preloadSource: "live",
            note: "stage_work still pending after apply — SECOND stage-work resolution",
        });
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
