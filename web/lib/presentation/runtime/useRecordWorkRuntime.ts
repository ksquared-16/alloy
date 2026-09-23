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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAttentionSubject } from "@/lib/runtime/kernel/useAttentionCardFocus";
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

/**
 * Merge stage-work into a VM that arrived without it. A NO-OP on every composed view model.
 *
 * ── WHY THIS NO LONGER FORCES ──
 *
 * It used to accept `{force: true}`, which skipped the `pending` guard and re-fetched the stage-work
 * slice on top of a view model that had just been composed. On a `work_lifecycle` refresh that ran
 * AFTER the caches were invalidated and the VM recomposed — so the server had already produced a
 * fresh stage-work runtime AND the `operational_projection` computed from it, and this fetched a
 * second one and merged it over the top.
 *
 * `applyStageWorkSliceToVm` writes `stage_work`, `stage_work_runtime` and the record mirror. It does
 * not touch `operational_projection`. So the forced merge could leave Current Work and the card
 * envelope describing one stage-work runtime while `stage_work_runtime` held a later one: two
 * operational truths in one view model, and a second read to produce them.
 *
 * The composed view model is the authority for both, because the server computes them together. The
 * `pending` branch below is retained for a view model that genuinely arrives without stage work;
 * nothing produces one today, and the guard is what makes that provable rather than assumed.
 */
export async function completeVmWithStageWork(
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
export async function prewarmRecordWork(
    subjectId: string,
    /**
     * THE SCOPE THE SETTLED TRANSPORT WILL ASSERT — without it this warm is unreachable.
     *
     * `useRecordWorkRuntime` requests the record-work VM with
     * `{ work_unit_id: "", department_id: "", attention_subject_id }`, which both adds
     * `?attention_subject_id=` to the URL and puts the attention subject into the session-cache
     * scope key. This prewarm passed `null`, so it fetched the bare URL under a DIFFERENT key.
     *
     * Measured on deployed 447abd94: hover issued
     *   /api/admin/view-models/drawer/opportunity/<id>
     * and the click that followed issued
     *   /api/admin/view-models/drawer/opportunity/<id>?attention_subject_id=<id>
     * — same endpoint, same record, 2.8s paid twice. The warm was produced and never consumable,
     * which is why pointer intent moved queue-row switching only ~190ms against a 5.5-6.3s spread.
     *
     * Null keeps the previous bare-scope behaviour for callers that genuinely have no attention
     * subject. It is NOT defaulted from `subjectId`: warming under a scope the consumer will not
     * ask for is what produced the unreachable entry in the first place.
     */
    attentionSubjectId: string | null = null,
): Promise<void> {
    const id = subjectId.trim();
    if (!id) return;
    const attention = attentionSubjectId?.trim() || null;
    /*
     * Same shape as `useRecordWorkRuntime`'s `transportContext`, deliberately including the empty
     * work-unit/department strings: that runtime asserts only the attention subject, the URL builder
     * omits empty fields, and the cache scope is derived from the same object. Any other shape keys
     * the entry somewhere the consumer will never look.
     */
    const warmContext = attention
        ? { work_unit_id: "", department_id: "", attention_subject_id: attention }
        : null;
    try {
        const result = await loadOpportunityDrawerViaViewModel(id, warmContext);
        if (!result.ok || !isOpportunityDrawerViewModelPreload(result.preload)) return;
        await completeVmWithStageWork(result.preload.viewModel); // warms the stage-work resource too
    } catch {
        /* non-fatal prewarm */
    }
}

export function useRecordWorkRuntime(
    subjectId: string | null,
    /**
     * The participation this surface is scoped to, STATED by the caller that computed it.
     *
     * The Focus Panel already knows it: on a child subject it holds both the participation
     * (`operational.subjectId`, a `process_instances.id`) and the family case it settles on, and it
     * derives one from the other. It used to pass only the family id and leave this runtime to
     * recover the child from `useAttentionSubject()` — a global that is **null by design on cold
     * entry**, because a SURFACE movement clears `subject` and the surface then commits its
     * CONFIGURED DEFAULT subject without ever moving attention to it.
     *
     * Measured deployed consequence: the settled request carried no `attention_subject_id` at all,
     * so the server could not resolve the participation, `participantScope` settled null, and
     * Attendance and Health — both gated on that scope — reported `unavailable` for a child the
     * commit frame had just described.
     *
     * Null for a case-grain panel: there is no participation, and none is fabricated.
     */
    participationId: string | null = null,
): RecordWorkRuntimeState {
    /*
     * THE SUBJECT OF ATTENTION TRAVELS WITH THE REQUEST — this runtime is the Focus Panel's settled
     * transport owner, and it is the only place that may add it.
     *
     * The commit frame already resolves the selected participation (the panel body passes it as
     * `selectedParticipationId`); the settled frame could not, because the Drawer route accepted only
     * department/work-unit. A frame that cannot name the child cannot project child-scoped truth, and
     * a producer asked to anyway falls back to the sole participant — which measurably resolved the
     * WRONG child on a multi-child family.
     *
     * Cards do not add query parameters. They read what this request returns.
     *
     * Null outside the RuntimeKernel (the modal drawer product renders above it) — that is the
     * ordinary family-grain answer, identical to the behaviour before attention was carried at all.
     */
    /*
     * PREFER WHAT THE CALLER STATED; fall back to attention for callers that state nothing.
     *
     * The stated value is not merely more available, it is more CURRENT: it comes from committed
     * Focus, which is the latest commit by construction, whereas attention is an operator-expressed
     * global that a cold entry never writes. The fallback keeps every caller that does not pass a
     * participation (the modal drawer product) behaving exactly as before.
     */
    const attentionSubjectFromKernel = useAttentionSubject();
    const attentionSubjectId = participationId?.trim() || attentionSubjectFromKernel;

    /*
     * This owner knows the attention subject and nothing else about the workspace — it deliberately
     * never reads `AdminDrawerContext`, so it has no department or work unit to name. Empty strings
     * are the honest answer and the URL builder omits them; the attention subject is the one scope
     * this request is actually asserting.
     */
    const transportContext = useMemo(
        () =>
            attentionSubjectId
                ? { work_unit_id: "", department_id: "", attention_subject_id: attentionSubjectId }
                : null,
        [attentionSubjectId],
    );

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
                /*
                 * UNDER THE CHILD IT WAS FETCHED FOR.
                 *
                 * This VM was requested with an attention subject, so it carries child-scoped
                 * operational truth. Writing it at the unscoped key would hand Child A's answer to
                 * the next family-grain reader — the leak the attention segment exists to stop. The
                 * request's own subject is the only correct place to file the response.
                 */
                attentionSubjectId,
            },
        );
        /*
         * ── THE DRAWER BODY IS NOT FIRST-ORDER WORK ──────────────────────────────────────────────
         *
         * A prefetch fired from here, the moment the VM was applied. Slice 12G measured what it cost:
         * a 4,957 ms request starting at 8,074 ms and finishing at 13,031 ms — the last request of
         * the navigation and the longest single item in the entire trace.
         *
         * It bought the operator nothing. The payload is the full record drawer BODY layout, and the
         * Focus Panel destination does not render it: 12G recorded ZERO visible mutation from this
         * response. The operator has to open the full record drawer before any of it is seen, and
         * most never do on a given visit.
         *
         * So it is not made faster and it is not cached — it simply does not happen yet. When the
         * drawer is actually opened, `useOpportunityDrawerLayoutRuntimeBody` fetches it through
         * `fetchDrawerLayoutRuntimeBodyDeduped`, which is the same owner this prefetch used: the
         * demand path is unchanged, and an execution already in flight is joined rather than
         * duplicated. Post-mutation invalidation below is untouched.
         */
        const applyMs = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
        logDrawerVmRuntime("payload_ready", { opportunity_id: vm.entity.id, reason, generation: vm.generation, payload_apply_ms: applyMs });
    }, [attentionSubjectId]);

    // ── Subject resolution — the ONE effect that turns a committed subject into a VM. Latest-wins via
    //    the generation guard; the prior VM is held (never cleared) so a subject swap shows the prior
    //    resolved grid until the new one lands. ──
    useEffect(() => {
        if (!validSubject) {
            fetchGenRef.current++;
            setDisplayVm(null);
            setColdLoading(false);
            setError(null);
            // A Work Unit with no committed subject has no primary content to reveal. That is a
            // TERMINAL outcome, not an unfinished one: without saying so the reveal lifecycle would
            // sit at `pending` for the life of the surface, and anything waiting on it would wait
            // forever. Nothing else changes — no fetch, no VM, no timing.
            endWorkUnitPrimaryReveal("empty");
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

        void loadOpportunityDrawerViaViewModel(validSubject, transportContext).then(async (result) => {
            if (gen !== fetchGenRef.current) return; // superseded by a newer subject — never lands (its begin owns the reveal)
            if (!result.ok) {
                setColdLoading(false);
                setError(formatLoadError(result));
                logDrawerVmRuntime("cold_fetch_error", { opportunity_id: validSubject, reason: result.reason });
                endWorkUnitPrimaryReveal("error"); // reveal failed — release prewarm (no displayVm change to trigger cleanup)
                return;
            }
            if (!isOpportunityDrawerViewModelPreload(result.preload)) {
                setColdLoading(false);
                setError("vm_preload_missing");
                endWorkUnitPrimaryReveal("error");
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
        // `transportContext` is in the deps deliberately: when attention moves to another child the
        // settled frame is answering about a DIFFERENT subject and must be re-requested, not reused.
    }, [validSubject, displayVm, applyVm, transportContext]);

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
        const result = await loadOpportunityDrawerViaViewModel(validSubject, transportContext);
        if (subjectGen !== fetchGenRef.current || reloadGen !== reloadGenRef.current) return;
        if (!result.ok || !isOpportunityDrawerViewModelPreload(result.preload)) return;
        // No `force`: the recomposed view model already carries stage work and the projection
        // computed from it. Re-fetching a slice here is what put two operational truths in one VM.
        const completeVm = await completeVmWithStageWork(result.preload.viewModel);
        if (subjectGen !== fetchGenRef.current || reloadGen !== reloadGenRef.current) return;
        // Same atomic contract as the initial load — reload reveals a complete VM, not a resize.
        applyVm(completeVm, forceFresh ? "reload_fresh" : "reload");
    }, [validSubject, applyVm, invalidateVmCachesForSubject, transportContext]);

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

    /*
     * ── THE DEFERRED STAGE-WORK PATCH IS RETIRED ──
     *
     * A second effect used to resolve Current Work after first paint whenever the applied view model
     * still marked `stage_work` pending, and patch the region in place. Only the deferred compose
     * produced that state, and only `stage_work=0` produced the deferred compose — which nothing ever
     * constructed. So it was unreachable in the product and fully alive in the code.
     *
     * Its own log line named the cost: "SECOND stage-work resolution". And the patch it applied wrote
     * `stage_work_runtime` without touching `operational_projection`, so a frame that took it would
     * have carried Current Work and the card envelope decided from one stage-work runtime beside a
     * later one.
     *
     * The composed view model now always carries stage work and the projection computed from it, in
     * the same answer. One authority, one read.
     */
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
