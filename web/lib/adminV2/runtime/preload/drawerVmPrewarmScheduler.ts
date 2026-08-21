/**
 * Drawer VM prewarm scheduler — Alloy OS Work Unit overfetch / contention guard.
 *
 * Problem this solves: during Work Unit entry, background VM prewarm (visible queue rows,
 * related person/child graph) fired in parallel with no concurrency cap, competing with the
 * actual primary reveal (bootstrap + active lane + default subject VM). Staging logs showed
 * 4–5 `/view-models/drawer/opportunity/*` composes racing the queue + bootstrap.
 *
 * Core law: **prewarm must never compete with the primary reveal.**
 *
 * Contract (runtime flag ON):
 * - While the Work Unit primary reveal is active, every prewarm task is DEFERRED (queued),
 *   never executed. Only the default operational subject VM (opened directly via the drawer
 *   context, NOT through this scheduler) loads during primary reveal.
 * - After `coordinated_reveal_ready` (caller invokes {@link endWorkUnitPrimaryReveal}), the
 *   queue drains **one task at a time** (concurrency cap = 1) — no parallel stampede.
 * - A manual row click cancels the backlog ({@link cancelBackgroundDrawerVmPrewarm}); the
 *   clicked subject loads immediately on its own path and pending prewarm never overwrites it.
 *
 * Runtime flag OFF: this is a transparent passthrough — tasks fire immediately, preserving the
 * legacy parallel prefetch behavior exactly.
 *
 * Observational only: this schedules existing warm helpers; it changes no payload readiness,
 * cache key, request-ownership, or reveal gate. Dev/staging perf marks are gated to non-prod.
 */

import { emitPerf, perfDevDetailEnabled, perfIntent } from "@/lib/perf/perfNamespaceLog";

export const DRAWER_VM_PREWARM_CONCURRENCY_CAP = 1;

export type DrawerVmPrewarmTask = {
    /** Stable dedupe key (e.g. `oppvm:<id>`); repeated enqueues for the same key are ignored. */
    key: string;
    /** Readable cause for logs (e.g. `wu_visible_rows`, `related_graph`). */
    reason: string;
    /** The actual warm execution — typically an existing `prepareDrawerViewModelDeduped` wrapper. */
    run: () => unknown | Promise<unknown>;
};

let primaryRevealActive = false;

/**
 * PRODUCTION-VISIBLE reveal-gate timeline (diagnostic only).
 *
 * `log()` above is gated on `perfDevDetailEnabled()` — `NODE_ENV !== "production"` — so it emits
 * nothing in the build these measurements run against, which is precisely the build where the gate
 * needs proving. This ring buffer answers one question: does the child-scoped reveal gate ever
 * release on a child-to-child switch, or does it suppress subject preparation indefinitely?
 */
type RevealGateEvent = { t: number; event: string; active: boolean; detail?: string };
function revealGateDiag(): RevealGateEvent[] {
    if (typeof window === "undefined") return [];
    const w = window as Window & { __ALLOY_REVEAL_GATE_DIAG__?: RevealGateEvent[] };
    if (!w.__ALLOY_REVEAL_GATE_DIAG__) w.__ALLOY_REVEAL_GATE_DIAG__ = [];
    return w.__ALLOY_REVEAL_GATE_DIAG__;
}
export function recordRevealGateEvent(event: string, detail?: string): void {
    const buf = revealGateDiag();
    if (buf.length > 400) buf.splice(0, buf.length - 200);
    buf.push({ t: Math.round(typeof performance !== "undefined" ? performance.now() : Date.now()), event, active: primaryRevealActive, detail });
}
let running = 0;
const queue: DrawerVmPrewarmTask[] = [];
const queuedKeys = new Set<string>();
/** Keys already started this work-unit session — avoids re-enqueue churn across renders. */
const startedKeys = new Set<string>();
let bootLogged = false;
/**
 * Bumped on manual cancel / new work-unit reveal. A task that started under a prior epoch and
 * settles after a cancel is a stale background completion — its result is discarded (the warm
 * caches dedupe it) and never applied as the active subject.
 */
let epoch = 0;

function log(phase: string, payload: Record<string, unknown> = {}): void {
    if (!perfDevDetailEnabled()) return;
    emitPerf("prefetch", phase, payload);
}

/**
 * One-time boot signal (dev/staging only): confirms THIS scheduler build is deployed and which
 * runtime mode it is operating in. Emits `[perf:prefetch] scheduler_active runtime=<bool>` so a
 * staging trace can verify the throttle is live (vs. a stale build still firing parallel warms).
 */
export function logDrawerVmPrewarmSchedulerBoot(): void {
    if (bootLogged) return;
    bootLogged = true;
    log("scheduler_active", { runtime: true });
}

/**
 * Begin the Work Unit primary reveal window. All prewarm enqueued while this is active is held
 * until {@link endWorkUnitPrimaryReveal}. Call on Work Unit entry (per work-unit reset).
 */
export function beginWorkUnitPrimaryReveal(): void {
    logDrawerVmPrewarmSchedulerBoot();
    primaryRevealActive = true;
    recordRevealGateEvent("begin");
    // New Work Unit context — drop any stale backlog from a prior work unit so it cannot drain
    // against the new reveal. In-flight tasks already settle into their own deduped caches.
    epoch += 1;
    queue.length = 0;
    queuedKeys.clear();
    startedKeys.clear();
}

/**
 * Coordinated reveal completed — release the deferred prewarm queue and drain one task at a time.
 */
export function endWorkUnitPrimaryReveal(): void {
    if (!primaryRevealActive && queue.length === 0) { recordRevealGateEvent("end:noop"); return; }
    primaryRevealActive = false;
    recordRevealGateEvent("end");
    log("prewarm_reveal_ready_flush", { count: queue.length });
    pump();
}

/** True while the primary reveal window is holding prewarm (test/diagnostic helper). */
export function isWorkUnitPrimaryRevealActive(): boolean {
    return primaryRevealActive;
}

/** Current deferred queue depth (test/diagnostic helper). */
export function drawerVmPrewarmQueueDepth(): number {
    return queue.length;
}

/**
 * Schedule a background drawer VM prewarm. Deferred while the primary reveal is active;
 * otherwise drained one-at-a-time. Passthrough (immediate) when the runtime flag is OFF.
 */
export function scheduleDrawerVmPrewarm(task: DrawerVmPrewarmTask): void {
    if (typeof window === "undefined") return;
    if (startedKeys.has(task.key) || queuedKeys.has(task.key)) return;

    queuedKeys.add(task.key);
    queue.push(task);

    if (primaryRevealActive) {
        log("prewarm_deferred_primary_reveal", { reason: task.reason });
        log("prewarm_queue_depth", { count: queue.length });
        return;
    }
    pump();
}

/**
 * Manual row click (or any explicit subject selection) — cancel the background backlog so the
 * clicked subject wins immediately and pending prewarm cannot overwrite the active subject.
 * In-flight tasks are allowed to settle (their results are deduped/cached, never applied as the
 * active subject), but nothing further is started.
 */
export function cancelBackgroundDrawerVmPrewarm(reason: string = "manual_selection"): void {
    // Bump the epoch even if the queue is empty: an in-flight task started before this manual
    // selection must be treated as stale when it settles (it cannot overwrite the clicked subject).
    epoch += 1;
    if (queue.length === 0) return;
    log("prewarm_cancelled_manual_selection", { reason, count: queue.length });
    queue.length = 0;
    queuedKeys.clear();
}

function runTask(task: DrawerVmPrewarmTask): Promise<void> {
    const startedEpoch = epoch;
    return Promise.resolve()
        .then(() => task.run())
        .then(
            () => undefined,
            () => undefined,
        )
        .finally(() => {
            if (startedEpoch !== epoch) {
                // Completed after a manual selection / new reveal — discard, never apply as subject.
                perfIntent("stale_completion_ignored", { reason: "prewarm_epoch_changed" });
            }
        });
}

function pump(): void {
    if (primaryRevealActive) {
        log("prewarm_skipped_active_reveal", { count: queue.length });
        return;
    }
    while (running < DRAWER_VM_PREWARM_CONCURRENCY_CAP) {
        const next = queue.shift();
        if (!next) return;
        queuedKeys.delete(next.key);
        startedKeys.add(next.key);
        running += 1;
        log("prewarm_started", { reason: next.reason });
        log("drawer_vm_prewarm_concurrency", { count: running });
        void runTask(next).finally(() => {
            running -= 1;
            // One-at-a-time: only advance after the current compose settles (no stampede).
            pump();
        });
    }
}

/** Test-only: restore pristine scheduler state between cases. */
export function resetDrawerVmPrewarmSchedulerForTests(): void {
    primaryRevealActive = false;
    running = 0;
    queue.length = 0;
    queuedKeys.clear();
    startedKeys.clear();
    bootLogged = false;
    epoch = 0;
}
