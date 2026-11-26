/**
 * One geometry measurement per frame, and none provoked by our own write.
 *
 * ---------------------------------------------------------------------------
 * THE FREEZE THIS EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 *
 * Operational Workspace geometry is measured from the live shell — the sidebar's right
 * edge, and when BOS is PINNED, the rail's left edge — and published as CSS vars that size
 * the operational surface. A `ResizeObserver` watches those same shell elements so the band
 * follows an operator dragging the rail.
 *
 * With BOS floating or closed that arrangement is stable: the band is computed from the
 * viewport, so nothing the measurement writes can change what the measurement reads.
 *
 * With BOS PINNED it is not. The rail reserves a column in the same flex row as the
 * surface, so writing the band resizes an observed element, the observer fires again inside
 * the same frame, and because both edges are rounded the two candidate values can alternate
 * rather than converge. The browser re-runs resize callbacks until its own loop limit, every
 * frame, and the main thread stops responding — which is exactly why the freeze appeared
 * only when pinned, and on every Operational Workspace (Communications, Tasks, Scheduling)
 * rather than in any single feature.
 *
 * ---------------------------------------------------------------------------
 * WHY A SCHEDULER RATHER THAN A DEAD-BAND
 * ---------------------------------------------------------------------------
 *
 * The tempting fix is to ignore sub-pixel or 1px differences. That is a hack with a
 * threshold nobody can justify, it silently degrades legitimate small adjustments, and it
 * still loops whenever the oscillation happens to exceed whatever number was chosen.
 *
 * The structural fix is to stop the callback from re-entering itself:
 *
 *   · COALESCE — every trigger in a frame collapses into one measurement, so an observer
 *     storm costs one pass instead of one pass per notification;
 *   · GUARD — while that measurement runs, further requests are dropped rather than queued,
 *     so the notifications our own write provokes cannot start another pass;
 *   · SETTLE — one trailing pass is allowed after a guarded burst, so a change that arrived
 *     *during* a measurement is never lost. Dropping it outright would trade a freeze for a
 *     stale band, which is a worse bug because it looks like a layout mistake.
 *
 * Combined with an idempotent write in `operationalWorkspaceGeometry`, a settled layout
 * stops producing mutations at all, and an unsettled one costs at most two passes per frame.
 *
 * Framework-free and injectable so the loop can be proven in a test rather than described.
 */

export type OperationalGeometryScheduler = {
    /** Ask for a measurement. Safe to call from an observer callback at any rate. */
    request: () => void;
    /** Drop any pending frame. Idempotent. */
    cancel: () => void;
};

export type OperationalGeometrySchedulerOptions = {
    /** Injectable for tests; defaults to the real animation frame. */
    schedule?: (cb: () => void) => number;
    cancelScheduled?: (handle: number) => void;
};

export function createOperationalGeometryScheduler(
    measure: () => void,
    options: OperationalGeometrySchedulerOptions = {},
): OperationalGeometryScheduler {
    const schedule =
        options.schedule ??
        ((cb: () => void) =>
            typeof requestAnimationFrame === "function" ?
                requestAnimationFrame(cb)
            :   (setTimeout(cb, 0) as unknown as number));
    const cancelScheduled =
        options.cancelScheduled ??
        ((handle: number) => {
            if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
            else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
        });

    let frame: number | null = null;
    /** True while `measure` is on the stack. Requests it provokes are absorbed here. */
    let measuring = false;
    /** A request arrived while measuring — real input, not our own echo. Run once more. */
    let dirtyDuringMeasure = false;

    const run = () => {
        frame = null;
        measuring = true;
        dirtyDuringMeasure = false;
        try {
            measure();
        } finally {
            measuring = false;
        }
        // Exactly one trailing pass. Anything that arrives during THAT pass is again
        // absorbed, so a self-sustaining source cannot chain frames indefinitely.
        if (dirtyDuringMeasure && frame === null) {
            frame = schedule(() => {
                frame = null;
                measuring = true;
                try {
                    measure();
                } finally {
                    measuring = false;
                    dirtyDuringMeasure = false;
                }
            });
        }
    };

    return {
        request: () => {
            if (measuring) {
                dirtyDuringMeasure = true;
                return;
            }
            if (frame !== null) return;
            frame = schedule(run);
        },
        cancel: () => {
            if (frame !== null) {
                cancelScheduled(frame);
                frame = null;
            }
            dirtyDuringMeasure = false;
        },
    };
}
