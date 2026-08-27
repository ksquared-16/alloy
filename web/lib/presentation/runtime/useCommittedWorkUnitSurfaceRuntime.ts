"use client";

/**
 * THE WORK UNIT SURFACE RUNTIME — committed Focus, rendered.
 *
 * This replaces `useWorkUnitSurfaceRuntime`'s four mount-time fetches and its six-condition
 * readiness conjunction with one question: *what has K3 committed?*
 *
 * Governing: alloy-runtime-kernel.md §K3 — "Focus … hands Presentation the committed world to render.
 * Presentation never asks Focus for permission and never tells Focus it is ready."
 *
 * WHAT DIED HERE, AND WHY IT COULD:
 *   - 4 useEffect fetches (config bundle · queues · queue rows · right rail). The Provisioning
 *     Answer already carries every operational fact, in one server round-trip.
 *   - The six-condition conjunction (shellReady && configSettled && headerConfigLoaded &&
 *     hasHeaderPresentation && queueSettledOnce && selectionCommitted). It asked "is it safe to show
 *     yet?" — unanswerable while four requests raced. Composed from a terminal, the question is gone.
 *   - `headerMetricsSettled` as a commit gate: KPI VALUES (Settlement) were gating Operational
 *     Commit, which C-24 forbids ("metrics cannot gate a commit"). U-P7 put the header GEOMETRY in
 *     the answer, so the gate had nothing left to guard.
 *
 * INTENTS ARE ATTENTION. Every operator expression here enters K1 — never the router, never a fetch.
 * Selecting a lens is a LENS-scope movement; opening a record is a SUBJECT-scope movement. Because
 * `AttentionIntent` cannot express a coarser field, a subject movement structurally cannot change the
 * lens, the Work Unit, or the Context Frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCommittedFocus, useRuntimeKernel } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { prewarmRecordWork } from "@/lib/presentation/runtime/useRecordWorkRuntime";
import { resolveQueueRowOpportunityId } from "@/lib/presentation/runtime/queueRowWarmTarget";
import { seedOpportunityStageWork } from "@/lib/adminV2/viewModel/drawer/opportunity/stageWork/opportunityStageWorkResource";
import { prepareOperationalDestination } from "@/lib/runtime/prep/prepareOperationalDestination";
import { prefetchWorkUnitProvisioning } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import {
    beginWorkUnitPrimaryReveal,
    endWorkUnitPrimaryReveal,
    isWorkUnitPrimaryRevealActive,
    recordRevealGateEvent,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";
import { ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { resolveSelectWorkViewAction } from "@/lib/presentation/runtime/workUnitPillSwitching";
import type { WorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import { useWorkUnitEntryMovement } from "@/lib/runtime/kernel/useWorkUnitEntryGesture";

/**
 * Warm a subject's COMPLETE commit-critical answer for a row selection: the K2 provisioning answer
 * AND the drawer VM + stage-work. Both are keyed IDENTICALLY to the real row-commit's reads — the
 * provisioning URL derives from the SAME (target, lens, subject) the entry gesture's `EntryResource`
 * builds (`provisioningAnswerUrl`), and the VM/stage-work from the same loader `useRecordWorkRuntime`
 * uses — so the click consumes both with zero network.
 *
 * WHY PROVISIONING TOO (not just the VM): `provisioningKey` includes `subject`, so a first-use row is
 * a DISTINCT K2 preparation with no completed answer to reuse — warming only the VM left the cold
 * `provisioning-answer?subject_id=…` round-trip on the commit path (~5.7 s dev, measured), which is
 * why first-use rows lagged while re-visited rows were instant. This closes that gap on the same
 * anticipatory seam (the URL cache K2's `EntryResource` already consumes via `consumeFreshProvisioning`).
 */
function prewarmSubjectDestination(
    target: string,
    lens: string | null,
    subjectId: string,
    /**
     * The opportunity whose record-work VM is worth warming for this subject, or null when the
     * subject has none. NOT defaulted from `subjectId`: `prewarmRecordWork` builds
     * `/view-models/drawer/opportunity/<id>`, so a subject id that is not an opportunity produces a
     * request that can only 404. The caller states what it knows; this refuses to guess.
     *
     * Provisioning is unaffected — it takes a SUBJECT of any grain and stays on `subjectId`.
     */
    opportunityId: string | null,
): void {
    const id = subjectId.trim();
    if (!id || !target) return;
    // AMPLIFICATION FIX: this warms NEIGHBOUR queue-row subjects (provisioning + VM). While the
    // primary Work Unit reveal is in progress, that speculative work saturates the (remote) DB and
    // inflates the selected subject's own reveal — measured as the 8–10s Focus Panel gap. Skip it
    // during the reveal; neighbours warm normally on the next intent (hover/idle) once the panel is
    // meaningful. The selected subject's own load never comes through here.
    if (isWorkUnitPrimaryRevealActive()) { recordRevealGateEvent("subject_warm_suppressed", id); return; }
    recordRevealGateEvent("subject_warm_emitted", id);
    void prefetchWorkUnitProvisioning(target, { lens: lens ?? null, subject: id });
    const opportunity = opportunityId?.trim();
    if (opportunity) void prewarmRecordWork(opportunity);
}
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import { useWorkUnitSettlement, mergeWorkUnitSettlement } from "./useWorkUnitSettlement";
import { subscribeWorkUnitConvergence } from "./workUnitConvergencePlan";
import { provisioningKey } from "@/lib/runtime/kernel/provisioning";
import { selectedWorkViewId } from "@/lib/runtime/provisioning/contextualFocusAnswer";
import type { WorkUnitSurfaceModel, WorkUnitSurfaceIntents, QueueRowModel } from "./types";
import { useAttentionSubject } from "@/lib/runtime/kernel/useAttentionCardFocus";

/** The surface has nothing to render until K3 commits. There is no third state. */
export type CommittedWorkUnitSurfaceRuntime = {
    model: WorkUnitSurfaceModel | null;
    intents: WorkUnitSurfaceIntents;
};

export function useCommittedWorkUnitSurfaceRuntime(): CommittedWorkUnitSurfaceRuntime {
    const kernel = useRuntimeKernel();
    const focus = useCommittedFocus();
    const router = useRouter();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    // The OPERATIONAL world, as a value — built PURELY from the committed snapshot, consulting no
    // fetch. This is the first visible frame: reserved geometry, no Settlement. Null before the first
    // commit — and a null model is never rendered as a Work Unit: K3's phase decides what is shown.
    const operationalModel = useMemo(
        () => (focus.current ? workUnitSurfaceModelFromSnapshot(focus.current.snapshot) : null),
        [focus.current],
    );

    // CP-2 — reuse, don't re-fetch. The committed answer already carries the selected subject's stage-work
    // (`focusPanelStageWork`); seed it into the stage-work cache under the SAME (opp/dept/stage) key the
    // drawer VM builds, so the VM's completion consumes it warm and the duplicate `/stage-work` request
    // never fires on the cold reveal. Render-phase (like the provisioning seed) so it lands before the
    // descendant Focus Panel's VM-completion effect. Idempotent + key-parity-safe (a miss just falls back
    // to the fetch — no wrong data). Only the default/committed subject matches; a later row switch keys
    // differently and fetches normally.
    useMemo(() => {
        const snap = focus.current?.snapshot;
        if (snap?.terminal === "operational" && snap.focusPanelStageWork && snap.recordOfAttention) {
            seedOpportunityStageWork(
                {
                    opportunityId: snap.recordOfAttention.id,
                    departmentId: snap.workUnit.departmentId,
                    stageKey: snap.currentBusinessState.stageKey,
                    stageLabel: snap.currentBusinessState.stageLabel,
                },
                snap.focusPanelStageWork,
            );
        }
    }, [focus.current]);

    // D5 SETTLEMENT — the operator is already working; this fills the reserved KPI values AFTER commit.
    // It cannot gate or reconstruct: `operationalModel` above is composed and renderable without it,
    // and this only overlays values into already-laid-out slots. Returns `operationalModel` unchanged
    // (same reference) until a real value lands, so the operational first paint is never re-rendered
    // for nothing. See `useWorkUnitSettlement` for the discipline (deduped, no commit gate, no reflow).
    // Bumped by a canonical mutation whose policy says the counted facts moved. Folds into the
    // totals scope key so Work View pill counts and the queue total re-resolve ON A WORK UNIT ROUTE —
    // the Workspace nonce that already did this is only mounted on `/workspace`.
    const [settlementRefreshToken, setSettlementRefreshToken] = useState(0);
    const settlement = useWorkUnitSettlement(focus.current?.snapshot ?? null, {
        refreshToken: settlementRefreshToken,
    });
    const model = useMemo(
        () => (operationalModel ? mergeWorkUnitSettlement(operationalModel, settlement) : null),
        [operationalModel, settlement],
    );

    // AMPLIFICATION FIX: mark the primary reveal ACTIVE the instant a Work Unit commits — BEFORE the
    // commit-critical provisioning + its answer-triggered neighbour/view prewarm storm — so that
    // speculative work defers instead of saturating the DB and inflating the selected reveal. The
    // window is ended when the selected subject's VM is applied (useRecordWorkRuntime, every path).
    /**
     * ARMED PER WORK UNIT, NOT PER SUBJECT.
     *
     * This keyed on `target::subject`, so every child-to-child switch fired a fresh
     * `beginWorkUnitPrimaryReveal()`. The paired `end` lives in `useRecordWorkRuntime`, which ends
     * the window when the selected subject's VM is APPLIED — but a child-to-child switch inside one
     * family reuses the family Settlement runtime, so no VM fetch occurs, no apply happens, and no
     * `end` ever runs.
     *
     * Proven with a production reveal-gate timeline: `begin` fires on each child switch, NO `end`
     * event ever appears, and from that point every subject warm logs
     * `subject_warm_suppressed active=true`. Before the first `begin`, the same warms logged
     * `subject_warm_emitted active=false` — the path works; the gate was holding it shut. The
     * scheduler's own stated law, "prewarm can never stall", was being violated.
     *
     * The window exists to defer the prewarm STORM that follows a Work Unit commit. That storm is a
     * property of committing a Work Unit, not of moving Attention between children of one family —
     * which reuses stable family cards and fetches one subject-keyed answer. Keying the arm on the
     * TARGET restores a begin/end cycle that actually closes, and leaves the child-scoped Mission
     * reserve (which is a reveal CONTRACT, not this gate) untouched.
     */
    const committedRevealKey = focus.current ? (focus.current.ref.target ?? "") || null : null;
    useEffect(() => {
        if (committedRevealKey) beginWorkUnitPrimaryReveal();
    }, [committedRevealKey]);

    // Arm the reveal window at Work Unit surface MOUNT — before the sibling-view answer prewarm's idle
    // callback can fire — so the EXISTING reveal gate defers it instead of losing the race to it (the
    // commit-time arm above lands after the prewarm). Controlled same-process A/B (dev, slot3, 6 interleaved
    // warm runs, mount-arm ON vs OFF): median warm first-meaningful 7445 ms → 6599 ms (−11%), and — the
    // clearer signal — the OFF condition's pathological slow-tail (10.3 s / 11.4 s reveals when the prewarm
    // won the race) disappears (ON caps at 7.1 s; range 5669–11350 → 5621–7125). The window still ENDS on the
    // selected VM apply (useRecordWorkRuntime, every path); the unmount release covers a navigate-away before
    // commit so speculative prewarm is never pinned.
    useEffect(() => {
        beginWorkUnitPrimaryReveal();
        return () => endWorkUnitPrimaryReveal();
    }, []);

    // SUBJECT OWNERSHIP — settled, and worth recording because the wrong shape was tried twice.
    // The Focus Panel once read its subject from AdminDrawerContext, making the drawer a SECOND
    // owner of Record of Attention: D1 resolved the subject (U-P4) and K3 committed it, yet the
    // panel showed "Select a record to begin" because it asked a different owner. Bridging them with
    // `useEffect(() => openDrawer(committed))` produced 4418 duplicate requests of 4421 — opening the
    // drawer re-rendered this hook and re-fired the effect. Two owners synchronising is a loop.
    // The resolution was to DELETE the second owner, not reconcile it: `OperationalSubjectContext` is
    // now fed straight from the committed snapshot by `ProvisionedWorkUnitSurface`, and
    // `isOperationallyResolved` asks nothing of any fetch. Certification: operational at first sight,
    // 0 hollow frames. Do not reintroduce a subject read from the drawer store.

    // THE one work-unit entry adapter — a second navigation path is what left these pills dead.
    const moveToWorkUnitEntry = useWorkUnitEntryMovement();

    const selectWorkView = useCallback(
        (workViewId: string) => {
            // Same-host: LENS attention move (Excel-tab swap, no remount).
            // Cross-host: SURFACE movement via the shared work-unit entry adapter (never router.push —
            // `/workspace/work-unit/:slug` is seed-only and a push changes the address without moving
            // attention).
            const id = workViewId.trim();
            if (!id) return;
            // Read Focus at click time — do not trust a stale React closure for settlement/lensSet.
            const rawSnap = kernel.getFocus().current?.snapshot ?? focus.current?.snapshot ?? null;
            // THE HOST AND ITS LENS SET, from any terminal that resolved them — contextual included.
            //
            // Narrowing this to operational|empty left a contextual surface with `views: []` and no
            // host, so the resolver saw a pill that was not on any strip, could not place it on the
            // current unit, and returned `noop`: the pills rendered, and clicking them did NOTHING.
            // A contextual answer carries its lens set precisely so the operator can still choose a
            // cohort — offering the choice is worthless if the choice cannot be taken.
            const hosted = rawSnap && rawSnap.terminal !== "error" ? rawSnap : null;
            // SETTLEMENT is the part contextual genuinely does not have: count locators belong to a
            // chosen cohort. Kept separate rather than folded in, so the absence stays visible.
            const snap =
                hosted && (hosted.terminal === "operational" || hosted.terminal === "empty")
                    ? hosted
                    : null;
            const currentWorkUnitId = hosted?.workUnit.id ?? null;
            // `null` on a contextual surface — there is no lens to be leaving, which is also what
            // stops the resolver treating the first click as a no-op re-selection of itself.
            const currentWorkViewId = selectedWorkViewId(hosted) ?? kernel.attention.get()?.lens ?? null;
            const locators = snap?.settlement ?? null;
            const canonicalLocationByViewId = new Map<string, WorkViewCanonicalLocation>();
            if (locators?.status === "resolved") {
                for (const target of locators.workViewCountTargets) {
                    canonicalLocationByViewId.set(target.workViewId, {
                        workUnitId: target.hostWorkUnitId,
                        baseQueueKey: target.baseQueueKey,
                        routeKey: null,
                    });
                }
            }
            const views = (hosted?.lensSet ?? []).map((lens: { id: string; label: string }) => ({
                id: lens.id,
                label: lens.label,
            }));
            const surfaceLensIds = views.map((v) => v.id);
            const targetInputs = {
                views,
                canonicalLocationByViewId,
                selectedSiteId,
            };
            const action = resolveSelectWorkViewAction({
                workViewId: id,
                currentWorkViewId,
                currentWorkUnitId,
                canonicalLocationByViewId,
                targetInputs,
                surfaceLensIds,
            });
            if (action.kind === "noop") return;

            // Pill-strip Work View selection is ALWAYS a LENS move on the current Work Unit target.
            // Never SURFACE-navigate to a label slug (`/work-unit/tours`, `/work-unit/waitlist`) —
            // that remounts `[workUnitSlug]` and yields Tours count=1 / rows=0. Workspace entry
            // (Process cards / Today's Work) remains the sole owner of true host SURFACE movement.
            if (action.kind === "navigate") {
                // Defensive: a view not present in lensSet (should not come from the pill strip).
                if (moveToWorkUnitEntry(action.href, null, null, null)) return;
            }

            if (typeof window !== "undefined") {
                const w = window as Window & {
                    __ALLOY_WV_CLICK_TRACE__?: Array<Record<string, unknown>>;
                };
                const trace = (w.__ALLOY_WV_CLICK_TRACE__ ??= []);
                trace.push({
                    t: Date.now(),
                    intentWorkViewId: id,
                    actionKind: action.kind,
                    currentWorkViewId,
                    currentWorkUnitId,
                    attentionTarget: kernel.attention.get()?.target ?? null,
                    attentionLens: kernel.attention.get()?.lens ?? null,
                    surfaceLensIds,
                    href: action.kind === "navigate" ? action.href : null,
                });
                if (trace.length > 20) trace.splice(0, trace.length - 20);
            }

            kernel.attention.move({
                scope: ATTENTION_SCOPE.LENS,
                lens: id,
                source: "work_view_selection",
            });
        },
        [kernel, focus, selectedSiteId, moveToWorkUnitEntry],
    );

    const openRecord = useCallback(
        (row: QueueRowModel) => {
            // A SUBJECT-scope movement — cannot express a lens/target change (compile-enforced).
            // This is the WHOLE gesture: committed Focus becomes the sole subject owner, and the
            // inline Record Work Runtime resolves that subject into the VM. No drawer state is written
            // (the legacy queue-row → openDrawer follower was deleted: it was a second subject owner
            // that only fired on click, so the default subject never loaded until a click).
            kernel.attention.move({
                scope: ATTENTION_SCOPE.SUBJECT,
                subject: row.entityId,
                source: "subject_selection",
            });
        },
        [kernel],
    );

    /**
     * Warm, don't move. Prefetch expresses interest, not intent — so it must never enter K1 (that
     * would move attention on hover). It asks K2 to prepare the same key the real movement will use;
     * K2's dedup means the later click consumes this in-flight work instead of starting new work.
     */
    const prefetchWorkView = useCallback(
        (workViewId: string) => {
            const current = kernel.attention.get();
            if (!current || current.lens === workViewId) return;
            const id = workViewId.trim();
            if (!id) return;
            const rawSnap = kernel.getFocus().current?.snapshot ?? focus.current?.snapshot ?? null;
            // Same reading as the click below it — a warm keyed differently from the movement it is
            // warming is a wasted fetch, and on a contextual surface an empty lens set warms nothing.
            const hosted = rawSnap && rawSnap.terminal !== "error" ? rawSnap : null;
            const snap =
                hosted && (hosted.terminal === "operational" || hosted.terminal === "empty")
                    ? hosted
                    : null;
            const locators = snap?.settlement ?? null;
            const canonicalLocationByViewId = new Map<string, WorkViewCanonicalLocation>();
            if (locators?.status === "resolved") {
                for (const target of locators.workViewCountTargets) {
                    canonicalLocationByViewId.set(target.workViewId, {
                        workUnitId: target.hostWorkUnitId,
                        baseQueueKey: target.baseQueueKey,
                        routeKey: null,
                    });
                }
            }
            const views = (hosted?.lensSet ?? []).map((lens: { id: string; label: string }) => ({
                id: lens.id,
                label: lens.label,
            }));
            const targetInputs = {
                views,
                canonicalLocationByViewId,
                selectedSiteId,
            };
            const action = resolveSelectWorkViewAction({
                workViewId: id,
                currentWorkViewId: current.lens,
                currentWorkUnitId: hosted?.workUnit.id ?? null,
                canonicalLocationByViewId,
                targetInputs,
                surfaceLensIds: views.map((v) => v.id),
            });
            if (action.kind === "navigate") {
                router.prefetch(action.href);
                return;
            }
            // Same-host: prepare the sibling view's provisioning answer AND its default subject's
            // complete VM — so a pill switch commits a complete Focus Panel, not just a warm queue.
            // Do not pathname-compare against label-derived hrefs (same false cross-host trap as
            // selectWorkView) — that skipped K2 warm for ordinary same-host pills.
            //
            // CRITICAL: provisioningKey prefers destination.workViewId over ref.lens when a
            // destination is present. Spreading `current` without re-pointing destination would key
            // the warm as the ACTIVE lens and overwrite that lens's completed snapshot with the
            // sibling's answer (Tours warm stored under All — K2 reuse then serves the wrong world).
            void prepareOperationalDestination(kernel, {
                ...current,
                lens: id,
                scope: ATTENTION_SCOPE.LENS,
                // CHOOSING A LENS ENDS CONTEXTUAL FOCUS, and the warm must be keyed the way the real
                // movement will be. Spreading `current` from a contextual surface would carry
                // `cohort: "none"` alongside a named lens — a key that describes nothing, warming an
                // answer the click can never consume.
                cohort: null,
                subject: null,
                aspect: null,
                destination: current.destination
                    ? {
                          ...current.destination,
                          workViewId: id,
                          subjectId: null,
                          focusMode: null,
                      }
                    : null,
            });
        },
        [kernel, focus, router, selectedSiteId],
    );

    // ADJACENT SUBJECT PREPARATION (#6). The K2 provisioning answer is per-lens, so a subject move
    // reuses it — but the Focus Panel's CARDS come from the per-subject drawer view-model, which is
    // NOT in the K2 answer. Warm that exact VM (the one `useRecordWorkRuntime` loads) on hover/focus
    // intent so the row → row click resolves from `cache_hit`/`inflight_join` instead of a cold fetch,
    // collapsing the pending-skeleton window on the destination. Fire-and-forget; the loader dedups.
    const prefetchRecord = useCallback(
        (row: QueueRowModel) => {
            if (row.entityId == null) return;
            const current = kernel.attention.get();
            // Hover is the strongest first-use signal — warm the COMPLETE commit-critical answer
            // (provisioning + VM + stage-work) so even a never-visited row commits with zero network.
            //
            // `row.entityType === "opportunity"` used to gate this. That guard passes for every
            // child-grain Enrollment row and then `row.entityId` is a participation id, so the VM
            // warm 404'd on every hover of a Waitlist row. The canonical rule decides instead.
            prewarmSubjectDestination(
                current?.target ?? "",
                current?.lens ?? null,
                String(row.entityId),
                resolveQueueRowOpportunityId(row),
            );
        },
        [kernel],
    );

    // ── PHASE H — SIBLING WORK-VIEW ADJACENCY ──────────────────────────────────────────────────
    // A pill switch pays the full ~2.8 s provisioning round-trip because hover rarely precedes the
    // click by that long. So once THIS work unit has committed, prepare its sibling Work Views on
    // idle — the same K2 preparation the pill click will REUSE (dedup by (target,lens) key). The
    // click then commits from prepared state instead of starting a cold fetch. Bounded to the view
    // set, deduped + TTL'd by K2, and idle-scheduled so it never competes with the commit-critical
    // path.
    //
    // The effect keys on the STABLE comma-joined sibling-id string, NOT on the `model` reference:
    // Settlement overlays KPI counts and hands back a new `model` object every time, and depending on
    // that reference made the cleanup cancel the scheduled idle callback before it could fire (and the
    // re-run then no-op'd). The sibling-id set does not change on settlement, so keying on it fires the
    // preparation exactly once per committed view set and survives count updates.
    const siblingViewIds =
        model?.workViews
            ?.filter((v) => !v.isActive && v.id !== model.activeWorkViewId)
            .map((v) => v.id)
            .join(",") ?? "";
    useEffect(() => {
        if (!siblingViewIds || typeof window === "undefined") return;
        const ids = siblingViewIds.split(",");
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        // AMPLIFICATION FIX (same shape as the workspace surface's destination warms). Each sibling
        // view costs a FULL provisioning compose plus a drawer-VM compose, and
        // `requestIdleCallback(timeout:2000)` fires them within 2s regardless of what the reveal is
        // doing — measured landing four of each squarely inside the selected panel's reveal window,
        // where they compete with the very fetch the operator is waiting on. The reveal gate already
        // guards neighbour-subject warms (`prewarmSubjectDestination`) and the workspace surface's
        // destination warms; this speculative sweep was the one path that missed it. Hold and
        // re-check — the siblings still warm, just not on top of the commit-critical path.
        //
        // Gated HERE, at the speculative scheduling site, and deliberately NOT inside
        // `prefetchWorkView`: that same callback serves the pill hover/focus warm
        // (`WorkUnitSurface` `onPrefetch`), which is operator INTENT and must never be deferred.
        const run = () => {
            if (isWorkUnitPrimaryRevealActive()) {
                retryTimer = setTimeout(run, 500);
                return;
            }
            for (const id of ids) prefetchWorkView(id);
        };
        const w = window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        if (w.requestIdleCallback) {
            const handle = w.requestIdleCallback(run, { timeout: 2000 });
            return () => {
                w.cancelIdleCallback?.(handle);
                if (retryTimer) clearTimeout(retryTimer);
            };
        }
        const timer = window.setTimeout(run, 250);
        return () => {
            window.clearTimeout(timer);
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [siblingViewIds, prefetchWorkView]);

    // ── #6 ADJACENT SUBJECT PREPARATION — warm the selected subject's NEIGHBOURS on commit. ──────
    // Row → row is the operator's most frequent move; the destination's cards otherwise cold-fetch on
    // click (the pending-skeleton window). Once committed, warm the drawer VM of the rows immediately
    // above/below the selected subject on idle, so the next click (or arrow-key nav) resolves from
    // cache. Bounded to a ±2 window, deduped/TTL'd by the VM loader, idle-scheduled (never competes
    // with the commit-critical VM). Keyed on the stable neighbour-id string so settlement re-renders
    // (new `model` ref, same rows) don't cancel-and-drop the scheduled warm.
    const selectedSubjectId = model?.selectedRecordId ?? model?.selectedSubject?.selectedRecordId ?? null;
    /**
     * THE WINDOW MUST FOLLOW THE OPERATOR.
     *
     * The anchor matched `selectedSubjectId` against the row id OR its `drawer_open.entity_id`. On a
     * child-grain queue every row shares one `drawer_open.entity_id` (the family opportunity) and
     * the settlement subject IS that family id, so the match always landed on row 0 and the +/-2
     * window never moved off the entry anchor: rows near it committed their Mission in ~216ms while
     * every other row waited 6.5-7.3s.
     *
     * Live attention (K1) carries the child the operator is actually on. The previous resolution
     * remains the fallback for grains where attention is not a row id.
     */
    const attentionSubjectForWindow = useAttentionSubject();
    const adjacentSubjectIds = useMemo(() => {
        const rows = model?.queue.rows;
        if (!rows?.length || !selectedSubjectId) return "";
        const byAttention = attentionSubjectForWindow
            ? rows.findIndex((r) => r.entityId === attentionSubjectForWindow)
            : -1;
        const idx = byAttention >= 0 ? byAttention : rows.findIndex(
            (r) => r.entityId === selectedSubjectId || r.context?.drawer_open.entity_id === selectedSubjectId,
        );
        if (idx < 0) return "";
        const neighbours: string[] = [];
        for (let d = 1; d <= 2; d++) {
            for (const j of [idx - d, idx + d]) {
                const r = rows[j];
                if (r && r.entityId && r.entityId !== selectedSubjectId) {
                    // `subjectId|opportunityId` — the subject drives provisioning, the opportunity
                    // (absent for an unanchored child row) drives the VM warm. Same rule as hover.
                    neighbours.push(`${String(r.entityId)}|${resolveQueueRowOpportunityId(r) ?? ""}`);
                }
            }
        }
        return [...new Set(neighbours)].join(",");
    }, [model?.queue.rows, selectedSubjectId, attentionSubjectForWindow]);
    useEffect(() => {
        recordRevealGateEvent("neighbour_effect", adjacentSubjectIds ? `ids=${adjacentSubjectIds.split(",").length}` : "EMPTY");
        if (!adjacentSubjectIds || typeof window === "undefined") return;
        const ids = adjacentSubjectIds.split(",");
        const run = () => {
            // Read attention at fire time — the committed work unit + lens the neighbours share.
            const current = kernel.attention.get();
            for (const entry of ids) {
                const [subjectId, opportunityId] = entry.split("|");
                if (!subjectId) continue;
                prewarmSubjectDestination(
                    current?.target ?? "",
                    current?.lens ?? null,
                    subjectId,
                    opportunityId || null,
                );
            }
        };
        const w = window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        if (w.requestIdleCallback) {
            const handle = w.requestIdleCallback(run, { timeout: 2500 });
            return () => w.cancelIdleCallback?.(handle);
        }
        const timer = window.setTimeout(run, 400);
        return () => window.clearTimeout(timer);
    }, [adjacentSubjectIds, kernel]);

    /*
     * ── CANONICAL MUTATION CONVERGENCE (the subscription that was missing) ──
     *
     * The refresh policy for these rows already existed and was already unit-tested; nothing in
     * production ever asked it. A placement change therefore emitted its canonical broadcast,
     * converged the KPIs and the record VM, and left the rows the operator was reading stale —
     * proven live, and proven again by a child rename that updated the Children card while the queue
     * row behind it kept the old name.
     *
     * Rows converge by RE-PREPARING the committed answer, not by a second row store: the snapshot is
     * the only row truth this surface has, so `invalidate` + a re-commit at the CURRENT scope is the
     * canonical seam. Subject scope first because it inherits target and lens and so re-prepares the
     * very key we invalidated — a LENS re-commit clears the subject and would deselect the record the
     * operator is working in, which is a worse outcome than the staleness it fixes.
     */
    const visibleOpportunityIds = useMemo(
        () =>
            (operationalModel?.queue.rows ?? [])
                .filter((r) => r.entityType === "opportunity" && r.entityId)
                .map((r) => String(r.entityId)),
        [operationalModel?.queue.rows],
    );
    const visibleOpportunityIdsRef = useRef<readonly string[]>(visibleOpportunityIds);
    useEffect(() => {
        visibleOpportunityIdsRef.current = visibleOpportunityIds;
    }, [visibleOpportunityIds]);

    const recommitForTruthMovement = useCallback(() => {
        const current = kernel.attention.get();
        if (!current) return;
        kernel.provisioning.invalidate(provisioningKey(current));
        if (current.subject) {
            kernel.attention.move({
                scope: ATTENTION_SCOPE.SUBJECT,
                subject: current.subject,
                source: "command",
            });
            return;
        }
        if (current.lens) {
            kernel.attention.move({ scope: ATTENTION_SCOPE.LENS, lens: current.lens, source: "command" });
            return;
        }
        kernel.attention.move({
            scope: ATTENTION_SCOPE.SURFACE,
            target: current.target,
            lens: current.lens ?? null,
            cohort: current.cohort ?? null,
            destination: current.destination ?? null,
            source: "command",
        });
    }, [kernel]);

    // Each projection is decided INDEPENDENTLY by the existing policy: a signal that moves a count
    // must not be allowed to imply a row refetch, and vice versa. The wiring lives in
    // `subscribeWorkUnitConvergence` so the event → policy → callback path is guarded without a DOM.
    useEffect(
        () =>
            subscribeWorkUnitConvergence({
                target: typeof window === "undefined" ? null : window,
                getVisibleOpportunityIds: () => visibleOpportunityIdsRef.current,
                onRefreshSummaries: () => setSettlementRefreshToken((n) => n + 1),
                onRefetchRows: recommitForTruthMovement,
            }),
        [recommitForTruthMovement],
    );

    const intents = useMemo<WorkUnitSurfaceIntents>(
        () => ({ selectWorkView, prefetchWorkView, openRecord, prefetchRecord }),
        [selectWorkView, prefetchWorkView, openRecord, prefetchRecord],
    );

    return { model, intents };
}
