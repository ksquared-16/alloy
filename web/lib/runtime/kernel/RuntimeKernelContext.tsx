"use client";

/**
 * THE RUNTIME KERNEL, bound: K1 Attention → K2 Provisioning → K3 Focus.
 *
 * Governing: docs/platform/runtime/alloy-runtime-kernel.md.
 *   K1 "Attention is the kernel's only cause." · K2 "caused by movement; superseded by movement."
 *   K3 "the single authority on where the operator is and what they see — and the only system in
 *       Alloy permitted to change it."
 *
 * This is the composition root, and deliberately nothing more. The three kernels are already built,
 * tested, and pure; this file wires them together and exposes them to the React tree. It contains no
 * runtime logic of its own — no readiness, no reveal decision, no fetching, no URL ownership. If a
 * behaviour lives here that isn't wiring, it is in the wrong place.
 *
 * WHAT THIS REPLACES. The old chain was `pathname → liveRef → mount → useEffect fetch ×4 →
 * six-condition readiness conjunction → reveal`. Here the cause is the operator's gesture, and the
 * only thing that can reveal a surface is a K2 terminal outcome reaching K3.
 */
import { createContext, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AttentionOwner, urlFromAttention, WORKSPACE_ATTENTION_TARGET, type AttentionRef } from "./attention";
import { ProvisioningRuntime } from "./provisioning";
import { FocusOwner, type FocusState } from "./focus";
import { workUnitEntryResourceClient } from "./workUnitEntryResourceClient";
import { markPerceived } from "@/lib/perf/perceivedPerf";
import { markFocusPanelDestinationCommit } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitTiming";

export type RuntimeKernel = {
    attention: AttentionOwner;
    provisioning: ProvisioningRuntime;
    focus: FocusOwner;
    /** Subscribe to committed Focus — the entire visible world. */
    subscribeFocus: (fn: () => void) => () => void;
    getFocus: () => Readonly<FocusState>;
};

const RuntimeKernelContext = createContext<RuntimeKernel | null>(null);

export function useRuntimeKernelOptional(): RuntimeKernel | null {
    return useContext(RuntimeKernelContext);
}
export function useRuntimeKernel(): RuntimeKernel {
    const k = useContext(RuntimeKernelContext);
    if (!k) throw new Error("useRuntimeKernel must be used within RuntimeKernelProvider");
    return k;
}

/** The committed visible world, as a React value. Re-renders only on commit. */
export function useCommittedFocus(): Readonly<FocusState> {
    const k = useRuntimeKernel();
    return useSyncExternalStore(k.subscribeFocus, k.getFocus, k.getFocus);
}

export function RuntimeKernelProvider({
    tenant,
    principal,
    children,
}: {
    tenant: string;
    principal: string;
    children: ReactNode;
}) {
    const ref = useRef<RuntimeKernel | null>(null);

    if (ref.current == null) {
        const listeners = new Set<() => void>();
        const notify = () => listeners.forEach((l) => l());

        // ── K1 ──
        // K4 marks reuse the existing canonical PerceivedInteraction vocabulary — the kernel does
        // not invent a competing marker system.
        const attention = new AttentionOwner({
            onAccepted: (r) =>
                markPerceived("work_unit_establish", "intent", {
                    work_unit_id: r.target,
                    view_id: r.lens ?? undefined,
                }),
            // Acknowledgment is the one promise that must survive total failure of the rest of the
            // kernel, so it is marked before anything downstream is asked to do anything.
            onAcknowledged: () => markPerceived("work_unit_establish", "acknowledge"),
        });

        // ── K3 (constructed before K2 so terminals have somewhere to land) ──
        const focus = new FocusOwner(
            {
                onYieldStart: () => markPerceived("work_unit_establish", "hold_start"),
                onCommitCompleted: () => {
                    markPerceived("work_unit_establish", "reveal");
                    // The same commit moment anchors the Focus Panel commit-chain epoch
                    // (model → per-card ready → settlement all report since_commit_ms from here).
                    markFocusPanelDestinationCommit();
                    notify();
                },
                onStaleCommitPrevented: () => markPerceived("work_unit_establish", "hold_end"),
                onRecovered: () => notify(),
            },
            (r: AttentionRef) => urlFromAttention(r),
        );

        // ── K2 ──
        const provisioning = new ProvisioningRuntime({
            entryResource: workUnitEntryResourceClient(),
            instrumentation: {
                onStarted: () => markPerceived("queue_hold", "intent"),
                /*
                 * EVERY TERMINAL REACHES K3 HERE — INCLUDING THE SECOND ONE.
                 *
                 * Focus used to be fed only from `onAttentionMoved(...).then(...)` below, and that
                 * promise resolves on the FIRST terminal. A settled snapshot emitted afterwards had
                 * nowhere to go: `emit` recorded it, `onTerminal` reported it for timing, and the
                 * committed surface never saw it. Measured on deployed ed24d807, the Focus Panel's
                 * capability cards stayed unresolved on both the route-load and queue-switch paths
                 * for exactly this reason — the settlement was computed, delivered and dropped.
                 *
                 * An emit without a consumer is not delivery. This is the consumer, and it is the
                 * CANONICAL one: `onPreparationTerminal` is K3's only commit entry point, so phase 2
                 * commits through the same path, the same atomic snapshot swap and the same staleness
                 * rules as phase 1. It already refuses a terminal whose attention has been superseded,
                 * which is what keeps a late B settlement from repainting C — that safety is reused,
                 * not restated.
                 */
                onTerminal: (terminal) => {
                    markPerceived("queue_hold", "reveal");
                    focus.onPreparationTerminal(terminal);
                },
            },
        });

        // K1 → K2 → K3. The whole runtime, in four lines.
        //
        // Note the ordering: K3 learns the movement FIRST (so the outgoing surface yields
        // immediately, within the legibility budget), and only then does K2 begin preparing. Neither
        // waits on the other, and neither waits on the router.
        attention.subscribe((e) => {
            focus.onAttentionMoved(e.ref);
            // Render the movement the INSTANT it is accepted — before K2 has an answer. This is what
            // lets the outgoing surface visibly YIELD within the legibility budget (C-36): Focus has
            // just set the yielding/divergent phase, and Presentation must see it now, not at commit.
            // Without this notify the phase change was invisible until the terminal landed, so the yield
            // was modelled but never rendered.
            notify();
            // The Workspace is an attention target, but it has NO Work Unit Preparation Contract —
            // its surface is route-owned until D5 gives it one. Asking the Work Unit entry resource
            // for it would fire a doomed request and commit an honest "no work unit 'workspace'"
            // error for a surface that is perfectly fine. Attention still moves; only preparation
            // is skipped.
            if (e.ref.target === WORKSPACE_ATTENTION_TARGET) return;
            void provisioning.onAttentionMoved(e).then(() => {
                /*
                 * The terminal itself is delivered to Focus by `onTerminal` above, which fires for
                 * EVERY emit rather than only the first. This await remains because disposal still
                 * has to be rendered: `null` means the preparation was superseded or cancelled, which
                 * is not an outcome and never reaches Focus (Kernel §K2: "there is no fourth
                 * outcome"), but the surface must still be notified that the wait ended.
                 */
                notify();
            });
        });

        ref.current = {
            attention,
            provisioning,
            focus,
            subscribeFocus: (fn) => {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
            getFocus: () => focus.get(),
        };
    }

    const value = useMemo(() => ref.current!, []);
    // tenant/principal are the retention boundary: a retained context may never cross a tenant.
    const boundary = useRef<string>(`${tenant}|${principal}`);
    if (boundary.current !== `${tenant}|${principal}`) {
        value.provisioning.flushForPrincipalChange();
        boundary.current = `${tenant}|${principal}`;
    }

    return <RuntimeKernelContext.Provider value={value}>{children}</RuntimeKernelContext.Provider>;
}
