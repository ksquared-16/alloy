/**
 * K3 — FOCUS. The single authority on where the operator is and what they see.
 *
 * Governing (landed, in-branch): docs/platform/runtime/alloy-runtime-kernel.md §K3 (:232–289)
 *   "To be the single authority on where the operator is and what they see — and the only system in
 *    Alloy permitted to change it."
 *   Owned state: "Per scope: current, outgoing, incoming, phase. The retained contexts. The projected
 *    URL. THIS IS THE ENTIRE VISIBLE WORLD OF ALLOY."
 *   "Commit — atomically — on `preparation.terminal`, and ON NOTHING ELSE. Never on a clock, never on
 *    the DOM, never on a component's opinion."
 *   "A surface is never shown before it is Operational (Art OC.4 Law 1). There is no partial arrival."
 *   "No surface is destroyed before its successor is Operational (Art 3.4)."
 *   "Promotion incoming → current is a change of role, NEVER A REBUILD."
 *   "Focus never fetches. It waits."
 *   "Focus never un-commits."
 *   Spec C-36: the outgoing surface visibly yields (`recede`) on intent; the destination is still
 *   never shown. Spec C-32: keep the Surface Host anatomy — REPLACE THE TRIGGERS.
 *
 * Focus is where the operator IS. Attention is where the operator WANTS TO BE. During movement they
 * differ; Operational Commit is the moment Focus catches up to Attention.
 *
 * This module is pure and has no React, router, or DOM dependency — the visible world is a value
 * here, so it can be certified without a browser. The host binds it to Presentation.
 */
import type { AttentionRef } from "./attention";
import { supersedes } from "./attention";
import type { PreparationTerminal, PreparationOutcome } from "./provisioning";

/**
 * The phase of a scope's visible world.
 *
 *   stable            — focus == attention; one surface, operational, interactive.
 *   yielding          — intent accepted; the outgoing surface visibly recedes (C-36). It is still
 *                       TRUE and still mounted — this is retained truth in transition, not a skeleton.
 *   awaiting_terminal — the outgoing is held, mounted, NON-INTERACTIVE (Constitution :483).
 *                       The destination is not shown. Time cannot advance this phase.
 *   committing        — a terminal arrived; the atomic exchange is in progress.
 *
 * There is deliberately no `preparing` phase that renders an incoming surface: a destination is
 * never shown before it is Operational, so "preparing" is not a visible state at all.
 */
export type FocusPhase = "stable" | "yielding" | "awaiting_terminal" | "committing";

/** What the operator can actually see for a scope. */
export type FocusSurface = {
    /** Stable identity. Equality of this value across a movement is what proves NO REBUILD. */
    surfaceId: string;
    /** The attention this surface was committed for. */
    ref: AttentionRef;
    /** The immutable snapshot this surface renders. Frozen by K2 at terminal. */
    snapshot: PreparationTerminal["snapshot"];
    outcome: PreparationOutcome;
    /** Monotonic commit identity. Focus never un-commits; this only increases. */
    commitVersion: number;
};

export type FocusState = {
    /** What the operator sees now. Null only before the first commit (cold boot). */
    current: FocusSurface | null;
    /** Retained, mounted, non-interactive while its successor is prepared. NEVER destroyed early. */
    outgoing: FocusSurface | null;
    /** Never rendered. Held only between terminal and the atomic exchange. */
    incoming: FocusSurface | null;
    phase: FocusPhase;
    /** Where the operator wants to be. Focus reads it; it never writes it. */
    desired: AttentionRef | null;
    /** The address of the committed world. A projection — never an input. */
    projectedUrl: string | null;
};

export type FocusRecoveryReason = "no_terminal_outcome" | "inconsistent_runtime";

export type FocusEvent =
    | { type: "focus.committed"; scope: number; target: string; outcome: PreparationOutcome; commitVersion: number }
    | { type: "focus.settled"; scope: number }
    | { type: "focus.recovered"; reason: FocusRecoveryReason };

/** K4 — Focus does not self-certify. These are observed independently. */
export type FocusInstrumentation = {
    onYieldStart?: (ref: AttentionRef, t: number) => void;
    onTransitionLegible?: (ref: AttentionRef, ms: number) => void;
    onTerminalReceived?: (t: PreparationTerminal) => void;
    onCommitStarted?: (ref: AttentionRef) => void;
    onCommitCompleted?: (s: FocusSurface, divergenceMs: number) => void;
    onStaleCommitPrevented?: (t: PreparationTerminal, currentVersion: number) => void;
    onUrlProjected?: (url: string, ms: number) => void;
    onSurfaceRetained?: (surfaceId: string) => void;
    onRecovered?: (reason: FocusRecoveryReason) => void;
};

/**
 * The identity of a visible surface.
 *
 * Deliberately keyed by (target, lens) — NOT by subject. A SUBJECT movement inside the same lens must
 * reuse the SAME surface, because promotion is "a change of role, never a rebuild" and a subject
 * change is not a surface exchange at all. This mirrors the K2 provisioning key exactly, which is why
 * subject movement neither refetches nor rebuilds.
 */
export function surfaceIdFor(ref: AttentionRef): string {
    return `${ref.target}::${ref.lens ?? ""}`;
}

export const initialFocusState = (): FocusState => ({
    current: null,
    outgoing: null,
    incoming: null,
    phase: "stable",
    desired: null,
    projectedUrl: null,
});

/**
 * The K3 Focus owner.
 *
 * Its only inputs are Attention (what to catch up to) and preparation.terminal (permission to
 * commit). It has no other cause. There is no clock, no DOM read, no readiness conjunction, and no
 * component opinion anywhere in this file — which is the whole point of D4.
 */
export class FocusOwner {
    private state: FocusState = initialFocusState();
    private commitVersion = 0;
    private divergenceStartedAt: number | null = null;
    private clock: () => number;

    constructor(
        private instrumentation: FocusInstrumentation = {},
        private projectUrl: (ref: AttentionRef) => string = () => "",
        clock?: () => number,
    ) {
        this.clock = clock ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    }

    get(): Readonly<FocusState> {
        return this.state;
    }

    /**
     * ← K1. Focus reads attention to know what it must catch up to. It NEVER writes it.
     *
     * On a surface-scope movement the current surface becomes `outgoing` and visibly yields — it is
     * retained, mounted, and about to become non-interactive. Nothing about the destination is shown.
     */
    onAttentionMoved(ref: AttentionRef): void {
        this.state = { ...this.state, desired: ref };

        // A movement inside the SAME surface (subject/aspect) is not a surface exchange. The surface
        // keeps its identity and its role; only the committed snapshot's subject will change.
        const sameSurface = this.state.current && surfaceIdFor(this.state.current.ref) === surfaceIdFor(ref);
        if (sameSurface) {
            this.instrumentation.onSurfaceRetained?.(this.state.current!.surfaceId);
            // Still awaiting a terminal for the finer scope — but the visible world does not yield.
            this.state = { ...this.state, phase: "awaiting_terminal" };
            if (this.divergenceStartedAt == null) this.divergenceStartedAt = this.clock();
            return;
        }

        if (!this.state.current) {
            // Cold boot: nothing to yield. Wait for the first terminal.
            this.state = { ...this.state, phase: "awaiting_terminal" };
            this.divergenceStartedAt = this.clock();
            return;
        }

        // Surface exchange. The outgoing is RETAINED — never destroyed, never blanked, never replaced
        // by a loading screen (Art 3.4). It yields so the movement is legible (C-36).
        const t = this.clock();
        this.divergenceStartedAt = t;
        this.state = {
            ...this.state,
            outgoing: this.state.current,
            incoming: null,
            phase: "yielding",
        };
        this.instrumentation.onYieldStart?.(ref, t);
    }

    /** Presentation reports that the outgoing surface has visibly receded (C-36 legibility). */
    markYieldLegible(): void {
        if (this.state.phase !== "yielding") return;
        const ms = this.divergenceStartedAt == null ? 0 : this.clock() - this.divergenceStartedAt;
        this.instrumentation.onTransitionLegible?.(this.state.desired!, ms);
        // The outgoing is now held, mounted, NON-INTERACTIVE. The destination is still not shown.
        this.state = { ...this.state, phase: "awaiting_terminal" };
    }

    /**
     * ← K2. THE ONLY CAUSE OF A COMMIT.
     *
     * There is no other entry point that can change the visible world: no timer, no DOM readiness, no
     * component saying it is ready. If this method is not called, nothing is ever revealed.
     */
    onPreparationTerminal(t: PreparationTerminal): boolean {
        this.instrumentation.onTerminalReceived?.(t);

        // A superseded terminal may never commit. Attention has moved on; this answer describes a
        // world the operator has already left.
        const desired = this.state.desired;
        if (!desired || (t.attentionVersion !== desired.version && supersedes(desired, refOfTerminal(t, desired)))) {
            this.instrumentation.onStaleCommitPrevented?.(t, desired?.version ?? -1);
            return false;
        }
        if (t.attentionVersion < (this.state.current?.ref.version ?? -1)) {
            this.instrumentation.onStaleCommitPrevented?.(t, this.state.current!.ref.version);
            return false;
        }

        this.instrumentation.onCommitStarted?.(desired);
        this.state = { ...this.state, phase: "committing" };

        // Reuse the surface identity when the surface is not exchanging: promotion is a change of
        // ROLE, never a rebuild.
        const existingId =
            this.state.current && surfaceIdFor(this.state.current.ref) === surfaceIdFor(desired)
                ? this.state.current.surfaceId
                : surfaceIdFor(desired);

        const committed: FocusSurface = {
            surfaceId: existingId,
            ref: desired,
            snapshot: t.snapshot,
            outcome: t.outcome,
            commitVersion: ++this.commitVersion,
        };

        // ── THE ATOMIC OPERATIONAL COMMIT ──
        // One transaction: the incoming becomes visible, the outgoing ceases to be active, focus
        // changes, and the URL is projected. Header, queue and Focus Panel cannot commit separately
        // because they are not separate values — they are fields of one frozen snapshot.
        const url = this.projectUrl(desired);
        const urlAt = this.clock();
        this.state = {
            current: committed,
            outgoing: null, // the outgoing's successor is Operational — only now may it go
            incoming: null,
            phase: "stable",
            desired,
            projectedUrl: url,
        };
        this.instrumentation.onUrlProjected?.(url, this.clock() - urlAt);
        const divergence = this.divergenceStartedAt == null ? 0 : this.clock() - this.divergenceStartedAt;
        this.divergenceStartedAt = null;
        this.instrumentation.onCommitCompleted?.(committed, divergence);
        return true;
    }

    /**
     * The reload floor (Art 4.5) — "a deliberate, correct rebuild… never the default, and never
     * reached by slowness. It answers an inconsistent runtime, not a slow one."
     *
     * Focus has exactly one failure: it cannot obtain a terminal outcome AT ALL. Every other failure
     * arrives as a terminal outcome and is simply committed — an honest error surface is a workable
     * place, not a recovery event.
     */
    recover(reason: FocusRecoveryReason): void {
        this.instrumentation.onRecovered?.(reason);
        this.state = { ...initialFocusState(), desired: this.state.desired };
        this.divergenceStartedAt = null;
    }

    /** Cold-load hydration only. The URL establishes the initial address, once. */
    hydrateProjectedUrl(url: string): void {
        if (this.state.projectedUrl != null) {
            throw new Error("K3: the URL is projected FROM committed focus; it may not re-enter as an input.");
        }
        this.state = { ...this.state, projectedUrl: url };
    }
}

/** Reconstruct the attention identity a terminal answers, for supersession comparison. */
function refOfTerminal(t: PreparationTerminal, like: AttentionRef): AttentionRef {
    return { ...like, version: t.attentionVersion };
}
