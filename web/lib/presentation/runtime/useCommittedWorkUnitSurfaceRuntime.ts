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
import { useCallback, useMemo } from "react";
import { useCommittedFocus, useRuntimeKernel } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import { useWorkUnitSettlement, mergeWorkUnitSettlement } from "./useWorkUnitSettlement";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { WorkUnitSurfaceModel, WorkUnitSurfaceIntents, QueueRowModel } from "./types";

/** The surface has nothing to render until K3 commits. There is no third state. */
export type CommittedWorkUnitSurfaceRuntime = {
    model: WorkUnitSurfaceModel | null;
    intents: WorkUnitSurfaceIntents;
};

export function useCommittedWorkUnitSurfaceRuntime(): CommittedWorkUnitSurfaceRuntime {
    const kernel = useRuntimeKernel();
    const focus = useCommittedFocus();
    const drawer = useAdminDrawer();

    // The OPERATIONAL world, as a value — built PURELY from the committed snapshot, consulting no
    // fetch. This is the first visible frame: reserved geometry, no Settlement. Null before the first
    // commit — and a null model is never rendered as a Work Unit: K3's phase decides what is shown.
    const operationalModel = useMemo(
        () => (focus.current ? workUnitSurfaceModelFromSnapshot(focus.current.snapshot) : null),
        [focus.current],
    );

    // D5 SETTLEMENT — the operator is already working; this fills the reserved KPI values AFTER commit.
    // It cannot gate or reconstruct: `operationalModel` above is composed and renderable without it,
    // and this only overlays values into already-laid-out slots. Returns `operationalModel` unchanged
    // (same reference) until a real value lands, so the operational first paint is never re-rendered
    // for nothing. See `useWorkUnitSettlement` for the discipline (deduped, no commit gate, no reflow).
    const settlement = useWorkUnitSettlement(focus.current?.snapshot ?? null);
    const model = useMemo(
        () => (operationalModel ? mergeWorkUnitSettlement(operationalModel, settlement) : null),
        [operationalModel, settlement],
    );

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

    const selectWorkView = useCallback(
        (workViewId: string) => {
            // A LENS-scope movement. K2 prepares the new lens; K3 commits when it terminates.
            // No router push: the URL is projected FROM the commit, never used to cause it.
            kernel.attention.move({
                scope: ATTENTION_SCOPE.LENS,
                lens: workViewId,
                source: "work_view_selection",
            });
        },
        [kernel],
    );

    const openRecord = useCallback(
        (row: QueueRowModel) => {
            // A SUBJECT-scope movement — cannot express a lens/target change (compile-enforced).
            kernel.attention.move({
                scope: ATTENTION_SCOPE.SUBJECT,
                subject: row.entityId,
                source: "subject_selection",
            });
            // The drawer is a FOLLOWER, and only of Settlement. Committed Focus already told the
            // panel WHO the subject is (above); this asks the drawer to load that record's Detail and
            // History — the deferred, non-operational region. It is written only here, in response to
            // an accepted K1 movement, never from an effect that could re-fire on render.
            drawer.openDrawer({ type: "opportunities", id: row.entityId, source: "queue_row" });
        },
        [kernel, drawer],
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
            void kernel.provisioning.prepare({ ...current, lens: workViewId, scope: ATTENTION_SCOPE.LENS });
        },
        [kernel],
    );

    // A subject movement reuses the lens preparation (the K2 key carries lens, not subject), so
    // there is nothing to warm — the answer is already in hand. Kept to satisfy the contract.
    const prefetchRecord = useCallback((_row: QueueRowModel) => {}, []);

    const intents = useMemo<WorkUnitSurfaceIntents>(
        () => ({ selectWorkView, prefetchWorkView, openRecord, prefetchRecord }),
        [selectWorkView, prefetchWorkView, openRecord, prefetchRecord],
    );

    return { model, intents };
}
