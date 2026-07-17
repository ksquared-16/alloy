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

    // The visible world, as a value. Null before the first commit — and a null model is never
    // rendered as a Work Unit: K3's phase decides what is shown, not this hook.
    const model = useMemo(
        () => (focus.current ? workUnitSurfaceModelFromSnapshot(focus.current.snapshot) : null),
        [focus.current],
    );

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
            // The inline Focus Panel still reads its subject from AdminDrawerContext. Until that
            // subject ownership moves to Focus (D5), this mirrors attention into the drawer store so
            // there is one operator-visible subject rather than two disagreeing ones. The drawer is a
            // FOLLOWER of attention here, never a second owner: it is written only in response to an
            // accepted K1 movement.
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
