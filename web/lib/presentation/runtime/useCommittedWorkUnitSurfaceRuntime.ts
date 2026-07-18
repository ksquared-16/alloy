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
import { useCallback, useEffect, useMemo } from "react";
import { useCommittedFocus, useRuntimeKernel } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import { ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import { useWorkUnitSettlement, mergeWorkUnitSettlement } from "./useWorkUnitSettlement";
import type { WorkUnitSurfaceModel, WorkUnitSurfaceIntents, QueueRowModel } from "./types";

/** The surface has nothing to render until K3 commits. There is no third state. */
export type CommittedWorkUnitSurfaceRuntime = {
    model: WorkUnitSurfaceModel | null;
    intents: WorkUnitSurfaceIntents;
};

export function useCommittedWorkUnitSurfaceRuntime(): CommittedWorkUnitSurfaceRuntime {
    const kernel = useRuntimeKernel();
    const focus = useCommittedFocus();

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
            void kernel.provisioning.prepare({ ...current, lens: workViewId, scope: ATTENTION_SCOPE.LENS });
        },
        [kernel],
    );

    // ADJACENT SUBJECT PREPARATION (#6). The K2 provisioning answer is per-lens, so a subject move
    // reuses it — but the Focus Panel's CARDS come from the per-subject drawer view-model, which is
    // NOT in the K2 answer. Warm that exact VM (the one `useRecordWorkRuntime` loads) on hover/focus
    // intent so the row → row click resolves from `cache_hit`/`inflight_join` instead of a cold fetch,
    // collapsing the pending-skeleton window on the destination. Fire-and-forget; the loader dedups.
    const prefetchRecord = useCallback((row: QueueRowModel) => {
        if (row.entityType !== "opportunity" || row.entityId == null) return;
        void loadOpportunityDrawerViaViewModel(String(row.entityId), null).catch(() => {});
    }, []);

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
        const run = () => {
            for (const id of ids) prefetchWorkView(id);
        };
        const w = window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        if (w.requestIdleCallback) {
            const handle = w.requestIdleCallback(run, { timeout: 2000 });
            return () => w.cancelIdleCallback?.(handle);
        }
        const timer = window.setTimeout(run, 250);
        return () => window.clearTimeout(timer);
    }, [siblingViewIds, prefetchWorkView]);

    // ── #6 ADJACENT SUBJECT PREPARATION — warm the selected subject's NEIGHBOURS on commit. ──────
    // Row → row is the operator's most frequent move; the destination's cards otherwise cold-fetch on
    // click (the pending-skeleton window). Once committed, warm the drawer VM of the rows immediately
    // above/below the selected subject on idle, so the next click (or arrow-key nav) resolves from
    // cache. Bounded to a ±2 window, deduped/TTL'd by the VM loader, idle-scheduled (never competes
    // with the commit-critical VM). Keyed on the stable neighbour-id string so settlement re-renders
    // (new `model` ref, same rows) don't cancel-and-drop the scheduled warm.
    const selectedSubjectId = model?.selectedRecordId ?? model?.selectedSubject?.selectedRecordId ?? null;
    const adjacentSubjectIds = useMemo(() => {
        const rows = model?.queue.rows;
        if (!rows?.length || !selectedSubjectId) return "";
        const idx = rows.findIndex(
            (r) => r.entityId === selectedSubjectId || r.context?.drawer_open.entity_id === selectedSubjectId,
        );
        if (idx < 0) return "";
        const neighbours: string[] = [];
        for (let d = 1; d <= 2; d++) {
            for (const j of [idx - d, idx + d]) {
                const r = rows[j];
                if (r && r.entityType === "opportunity" && r.entityId && r.entityId !== selectedSubjectId) {
                    neighbours.push(String(r.entityId));
                }
            }
        }
        return [...new Set(neighbours)].join(",");
    }, [model?.queue.rows, selectedSubjectId]);
    useEffect(() => {
        if (!adjacentSubjectIds || typeof window === "undefined") return;
        const ids = adjacentSubjectIds.split(",");
        const run = () => {
            for (const id of ids) void loadOpportunityDrawerViaViewModel(id, null).catch(() => {});
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
    }, [adjacentSubjectIds]);

    const intents = useMemo<WorkUnitSurfaceIntents>(
        () => ({ selectWorkView, prefetchWorkView, openRecord, prefetchRecord }),
        [selectWorkView, prefetchWorkView, openRecord, prefetchRecord],
    );

    return { model, intents };
}
