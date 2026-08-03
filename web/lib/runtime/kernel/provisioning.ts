/**
 * K2 — PROVISIONING. Truth acquisition and TERMINATION.
 *
 * Governing (landed, in-branch): docs/platform/runtime/alloy-runtime-kernel.md §K2 (:167–228)
 *   "To obtain the truth a destination requires, in one answer, and to TERMINATE — so that something
 *    in the runtime can finally say 'this is over.'"
 *   "The absence of this system is the root defect … the 2.5 s clock existed BECAUSE NOTHING COULD
 *    SAY A PREPARATION WAS OVER (Spec §4.1)."
 *   Owned state: "preparations, keyed by (scope, target, lens, principal, tenant), each with a
 *    lifecycle and exactly one terminal outcome."
 *   Outputs: "preparation.terminal(key, outcome, snapshot) — an IMMUTABLE snapshot."
 *   "Provisioning never renders and never commits."
 *   Failure model: "operational · empty · error. THERE IS NO FOURTH OUTCOME, AND NO NON-OUTCOME."
 *   The deadline: "single, runtime-owned; its only product is `error`" (Art 4.5).
 *
 * SUPERSEDED / CANCELLED ARE NOT OUTCOMES. The Kernel admits exactly three terminal outcomes and
 * says so twice ("no fourth outcome"). A superseded or cancelled preparation is therefore DISPOSED —
 * it never terminates, never reaches K3, and never becomes a stored outcome. Disposal is a reason,
 * not a state in the terminal vocabulary. We model it exactly that way rather than inventing a
 * second vocabulary.
 *
 * K2 does not decide what is visible. K3 Focus commits on these outcomes in D4;
 * "Provisioning never asks to be shown."
 */
import type { AttentionRef, AttentionMovedEvent, AttentionScope } from "./attention";
import { ATTENTION_SCOPE, supersedes } from "./attention";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/** The three terminal outcomes. There is no fourth. */
export type PreparationOutcome = "operational" | "empty" | "error";

/** Why a preparation was thrown away. NOT an outcome — it never reaches K3. */
export type DisposalReason = "superseded" | "cancelled";

/** Lifecycle phase. `idle` is the absence of a preparation, not a stored state. */
export type PreparationPhase = "preparing" | PreparationOutcome;

/**
 * preparation.terminal — the immutable handoff to K3.
 * A snapshot is immutable at commit; change arrives by settlement or reconciliation.
 */
export type PreparationTerminal = {
    key: string;
    outcome: PreparationOutcome;
    /** Immutable (frozen). K3 commits on this; nothing mutates it afterwards. */
    snapshot: Readonly<ProvisioningAnswer>;
    /** The attention version this preparation answers. Stale versions never reach K3. */
    attentionVersion: number;
    durationMs: number;
};

/**
 * The one runtime deadline (Authorization :221 — "One runtime deadline, K2-owned. Product: `error`
 * only. Never `operational`. Never per-surface, per-component, or per-request.").
 *
 * The Authorization ratifies the OWNERSHIP and the PRODUCT, not a millisecond value. C-27 fixes the
 * intent: "affordance escalation for slowness; deadline for NON-TERMINATION; floor only for an
 * inconsistent runtime." So the deadline must never fire on mere slowness — it sits far above the
 * cold Operational Commit ceiling (≤1200 ms p95) and exists only to conclude a preparation that will
 * not conclude itself. It replaces the deleted 2.5 s reveal timer, which committed regardless of truth.
 */
export const PROVISIONING_DEADLINE_MS = 10_000;

/**
 * The scope at which coarser-movement SUPERSESSION is normalised: a movement at LENS scope or coarser
 * supersedes finer preparation within the context it leaves. This constant is that boundary — it is
 * NOT the preparation identity.
 *
 * The D1 answer's Record of Attention IS the Operational Subject (U-P4/U-O3): the committed snapshot
 * must resolve the subject that Attention names, so the preparation is bounded to (target, lens,
 * SUBJECT). A subject movement is therefore a distinct preparation whose snapshot resolves that
 * subject; reuse is per (target, lens, subject) — a revisited subject reuses its OWN completed answer
 * and never serves one subject's snapshot as if it were another's. (An earlier key omitted `subject`,
 * which made every in-lens subject click reuse the first subject's frozen snapshot — the committed
 * queue advanced while the Focus Panel never left the entry record.)
 */
const ENTRY_PREPARATION_SCOPE: AttentionScope = ATTENTION_SCOPE.LENS;

/**
 * The Kernel key: (scope-normalised, target, lens, subject, principal, tenant). Subject is part of the
 * identity because Record of Attention is the Operational Subject and the committed snapshot must
 * resolve it. Never keyed from pathname, component instance, DOM identity, request id, Queue Lane, or
 * Queue Definition.
 */
export function provisioningKey(ref: AttentionRef): string {
    // CANONICAL identity when resolved: key on (workUnitId, workViewId) so a bare default-view entry
    // (`lens:null`) and its explicit Work-View pill (`lens:new_leads`) — which resolve to the SAME D1
    // answer — share ONE preparation instead of two. Falls back to the route-derived (target, lens)
    // only before a destination has been resolved (cold direct URL / history). Subject stays part of
    // the identity (Record of Attention is the Operational Subject); a subject movement inherits the
    // destination, so its key is (workUnitId, workViewId, subject).
    const dest = ref.destination;
    return JSON.stringify({
        scope: ENTRY_PREPARATION_SCOPE,
        workUnit: dest ? dest.workUnitId : ref.target,
        workView: dest ? dest.workViewId : ref.lens ?? null,
        subject: ref.subject ?? null,
        principal: ref.principal,
        tenant: ref.tenant,
    });
}

/** K4 signals. Instrumentation grades K2 independently of any surface. */
export type ProvisioningInstrumentation = {
    onStarted?: (key: string, attentionVersion: number) => void;
    onReused?: (key: string, attentionVersion: number) => void;
    onDeduplicated?: (key: string, attentionVersion: number) => void;
    onDisposed?: (key: string, reason: DisposalReason, attentionVersion: number) => void;
    onCompositionStarted?: (key: string) => void;
    onCompositionFinished?: (key: string, ms: number) => void;
    onTerminal?: (t: PreparationTerminal) => void;
    onStaleDiscarded?: (key: string, attentionVersion: number, currentVersion: number) => void;
    onDeadline?: (key: string, attentionVersion: number) => void;
    onInflightCount?: (n: number) => void;
};

/** The Entry Resource K2 asks for truth. D1's answer, injected — K2 does not know how truth is made. */
export type EntryResource = (ref: AttentionRef, signal: AbortSignal) => Promise<ProvisioningAnswer>;

type Inflight = {
    key: string;
    ref: AttentionRef;
    promise: Promise<PreparationTerminal | null>;
    controller: AbortController;
    /** Set the moment a coarser/newer attention supersedes this work. Checked at the emit boundary. */
    disposed: DisposalReason | null;
    startedAt: number;
};

type Completed = {
    key: string;
    terminal: PreparationTerminal;
    tenant: string;
    principal: string;
    /** Truth invalidation marks a completed snapshot unusable without deleting reusable siblings. */
    invalidated: boolean;
};

export type ProvisioningRuntimeOptions = {
    entryResource: EntryResource;
    instrumentation?: ProvisioningInstrumentation;
    deadlineMs?: number;
    clock?: () => number;
};

/**
 * The canonical K2 lifecycle over the D1 answer.
 *
 * Exactly one active preparation per canonical key. Identical concurrent intents consume the same
 * in-flight work. A superseded preparation can never win.
 */
export class ProvisioningRuntime {
    private inflight = new Map<string, Inflight>();
    private completed = new Map<string, Completed>();
    private currentAttention: AttentionRef | null = null;
    private clock: () => number;
    private deadlineMs: number;
    private instr: ProvisioningInstrumentation;

    constructor(private opts: ProvisioningRuntimeOptions) {
        this.clock = opts.clock ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
        this.deadlineMs = opts.deadlineMs ?? PROVISIONING_DEADLINE_MS;
        this.instr = opts.instrumentation ?? {};
    }

    /** ← K1. "caused by movement; superseded by movement." */
    onAttentionMoved = (e: AttentionMovedEvent): Promise<PreparationTerminal | null> => {
        this.currentAttention = e.ref;
        // Law of Scope Supersession — dispose every pending preparation this movement supersedes.
        for (const f of this.inflight.values()) {
            if (!f.disposed && supersedes(e.ref, f.ref)) this.dispose(f, "superseded");
        }
        return this.prepare(e.ref);
    };

    /**
     * Begin (or share, or reuse) the preparation for this attention.
     * Resolves `null` when the preparation was disposed — disposal is not an outcome.
     */
    prepare(ref: AttentionRef): Promise<PreparationTerminal | null> {
        const key = provisioningKey(ref);

        // ── REUSE: a completed, still-valid snapshot for this exact key. ──
        const done = this.completed.get(key);
        if (done && this.isReusable(done, ref)) {
            this.instr.onReused?.(key, ref.version);
            return Promise.resolve({ ...done.terminal, attentionVersion: ref.version });
        }

        // ── SHARE / DEDUPLICATE: identical in-flight work is consumed, never duplicated. ──
        const existing = this.inflight.get(key);
        if (existing && !existing.disposed) {
            this.instr.onDeduplicated?.(key, ref.version);
            return existing.promise;
        }

        const controller = new AbortController();
        const startedAt = this.clock();
        const f: Inflight = { key, ref, promise: Promise.resolve(null), controller, disposed: null, startedAt };
        f.promise = this.run(f);
        this.inflight.set(key, f);
        this.instr.onStarted?.(key, ref.version);
        this.instr.onInflightCount?.(this.inflight.size);
        return f.promise;
    }

    private async run(f: Inflight): Promise<PreparationTerminal | null> {
        const emit = (outcome: PreparationOutcome, snapshot: ProvisioningAnswer): PreparationTerminal | null => {
            // ── THE STALE GUARD ──
            // Checked at the EMIT boundary, not at the request boundary. AbortController is an
            // optimisation: an underlying request that cannot be physically aborted (or that already
            // completed) still cannot reach K3, because disposal and attention version are re-checked
            // here, after the work finished. This is what makes "a superseded response never lands"
            // true independent of transport.
            if (f.disposed) {
                this.instr.onStaleDiscarded?.(f.key, f.ref.version, this.currentAttention?.version ?? -1);
                return null;
            }
            if (this.currentAttention && supersedes(this.currentAttention, f.ref)) {
                this.dispose(f, "superseded");
                this.instr.onStaleDiscarded?.(f.key, f.ref.version, this.currentAttention.version);
                return null;
            }
            const terminal: PreparationTerminal = {
                key: f.key,
                outcome,
                snapshot: Object.freeze(snapshot), // immutable at commit
                attentionVersion: f.ref.version,
                durationMs: this.clock() - f.startedAt,
            };
            this.completed.set(f.key, {
                key: f.key,
                terminal,
                tenant: f.ref.tenant,
                principal: f.ref.principal,
                invalidated: false,
            });
            this.instr.onTerminal?.(terminal);
            return terminal;
        };

        let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
        try {
            this.instr.onCompositionStarted?.(f.key);
            const t = this.clock();

            // THE DEADLINE. Its only product is `error`. It races composition; it can never
            // manufacture success, because the deadline branch has no snapshot to succeed with.
            const deadline = new Promise<"deadline">((resolve) => {
                deadlineTimer = setTimeout(() => resolve("deadline"), this.deadlineMs);
            });
            const answer = await Promise.race([this.opts.entryResource(f.ref, f.controller.signal), deadline]);
            this.instr.onCompositionFinished?.(f.key, this.clock() - t);

            if (answer === "deadline") {
                this.instr.onDeadline?.(f.key, f.ref.version);
                return emit("error", {
                    terminal: "error",
                    code: "records_unavailable",
                    message: `preparation did not terminate within ${this.deadlineMs} ms`,
                    orgId: f.ref.tenant,
                    workUnit: null,
                    // Honestly null: preparation never terminated, so no lens set was ever resolved.
                    // Stated rather than omitted, because the `as ProvisioningAnswer` cast below means
                    // TypeScript will NOT catch a missing field here — `presentation_ms` was in fact
                    // already missing from these timings, and is added back on the same grounds.
                    navigationFrame: null,
                    timings: {
                        authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, presentation_ms: 0,
                        records_ms: 0, projection_ms: 0, composition_ms: 0,
                        total_ms: this.clock() - f.startedAt,
                    },
                } as ProvisioningAnswer);
            }

            // D1 terminal maps 1:1. K2 invents nothing and upgrades nothing.
            return emit(answer.terminal, answer);
        } catch (err) {
            return emit("error", {
                terminal: "error",
                code: "records_unavailable",
                message: err instanceof Error ? err.message : String(err),
                orgId: f.ref.tenant,
                workUnit: null,
                // Honestly null — the composition threw; nothing about the lens set is known here.
                navigationFrame: null,
                timings: {
                    authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, presentation_ms: 0,
                    records_ms: 0, projection_ms: 0, composition_ms: 0,
                    total_ms: this.clock() - f.startedAt,
                },
            } as ProvisioningAnswer);
        } finally {
            if (deadlineTimer) clearTimeout(deadlineTimer);
            if (this.inflight.get(f.key) === f) this.inflight.delete(f.key);
            this.instr.onInflightCount?.(this.inflight.size);
        }
    }

    /**
     * Reuse is a property of Provisioning — not a cache subsystem, and never a way to make warm
     * numbers look better by showing stale truth.
     */
    private isReusable(done: Completed, ref: AttentionRef): boolean {
        if (done.invalidated) return false;
        // Tenant/principal isolation is absolute — a retained context may never cross a tenant.
        if (done.tenant !== ref.tenant || done.principal !== ref.principal) return false;
        // A coarser (SURFACE) movement must never reuse a lens/subject snapshot — it left that context.
        // Same-key finer movement (an ASPECT change within the same subject) legitimately reuses; a
        // subject change has a different key and so never lands here.
        if (ref.scope < ENTRY_PREPARATION_SCOPE) return false;
        return done.terminal.outcome === "operational" || done.terminal.outcome === "empty";
    }

    private dispose(f: Inflight, reason: DisposalReason) {
        f.disposed = reason;
        try {
            f.controller.abort();
        } catch {
            /* physical abort is best-effort; the emit-boundary guard is the real exclusion */
        }
        this.instr.onDisposed?.(f.key, reason, f.ref.version);
    }

    /** Explicit cancellation (e.g. the operator left). Disposal, never an outcome. */
    cancel(ref: AttentionRef): void {
        const f = this.inflight.get(provisioningKey(ref));
        if (f && !f.disposed) this.dispose(f, "cancelled");
    }

    /** Truth moved — a completed snapshot is no longer reusable. Records own truth movement. */
    invalidate(key: string): void {
        const c = this.completed.get(key);
        if (c) c.invalidated = true;
    }

    /** Retention boundary: a tenant/principal change FLUSHES. A context never crosses a tenant. */
    flushForPrincipalChange(): void {
        for (const f of this.inflight.values()) if (!f.disposed) this.dispose(f, "cancelled");
        this.completed.clear();
        this.currentAttention = null;
    }

    /** Observability for certification only. */
    get inflightCount(): number {
        return [...this.inflight.values()].filter((f) => !f.disposed).length;
    }
    peekCompleted(key: string): PreparationTerminal | null {
        const c = this.completed.get(key);
        return c && !c.invalidated ? c.terminal : null;
    }
}
