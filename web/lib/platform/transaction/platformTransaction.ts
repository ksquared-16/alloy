/**
 * Platform Transaction Contract — the ONE execution pipeline every configured capability
 * runs through.
 *
 * The operator must never wonder "did that actually work?". A configured capability has
 * exactly two honest endings:
 *
 *   Configured Capability → Validation → Persistence → Business Process → Activity
 *     → Relationships → Cache Invalidation → Recomposition → COMMIT
 *
 *   Configured Capability → Validation failure (or any in-boundary step failure)
 *     → ROLLBACK → nothing changed → clear explanation
 *
 * Capabilities declare WHAT they do (steps) and HOW to undo it (compensations). They do
 * NOT implement transaction behaviour themselves — ordering, abort, compensation, honest
 * reporting, duplicate suppression and tracing all live here, once.
 *
 * Three rules this module exists to enforce:
 *
 *  1. **Nothing is reported as applied unless it actually succeeded.** A step appears in
 *     the trace with the status it earned, never the status it was expected to earn.
 *  2. **"Nothing changed" is a claim, not a default.** If a compensation fails, the result
 *     is `partially_committed` with an `integrity_breach` — the platform says so out loud
 *     rather than telling the operator the transaction was clean.
 *  3. **Downstream effects are declared, not assumed.** A step is either INSIDE the
 *     boundary (failure rolls the transaction back) or explicitly OUTSIDE it (failure
 *     degrades the result but never revokes work the operator completed). There is no
 *     third, implicit "swallowed" category.
 *
 * Postgres transactions are not available across the PostgREST client, so the boundary is
 * a saga: forward steps with compensating inverses, applied in reverse on abort.
 */

import { generateCorrelationId } from "@/lib/api/correlationId";

/** Canonical pipeline stages, in the only order they may execute. */
export type PlatformTransactionStage =
    | "validate"
    | "persist"
    | "business_process"
    | "activity"
    | "relationships"
    | "cache_invalidation"
    | "recomposition";

export const PLATFORM_TRANSACTION_STAGES: readonly PlatformTransactionStage[] = [
    "validate",
    "persist",
    "business_process",
    "activity",
    "relationships",
    "cache_invalidation",
    "recomposition",
] as const;

const STAGE_ORDER = new Map<PlatformTransactionStage, number>(
    PLATFORM_TRANSACTION_STAGES.map((stage, index) => [stage, index]),
);

/**
 * Whether a step sits inside the operator's transaction.
 *
 * - `inside` (default): the operator's action is not done until this succeeds. Failure
 *   aborts and compensates.
 * - `outside`: an explicitly downstream effect (notification fan-out, analytics mirror).
 *   Failure degrades the result and is reported, but never rolls back the commit.
 */
export type PlatformTransactionBoundary = "inside" | "outside";

export type PlatformTransactionStepStatus =
    | "ok"
    | "failed"
    | "skipped"
    | "degraded"
    | "compensated"
    | "compensation_failed";

export type PlatformTransactionStepTrace = {
    name: string;
    stage: PlatformTransactionStage;
    boundary: PlatformTransactionBoundary;
    status: PlatformTransactionStepStatus;
    duration_ms: number;
    error?: string;
};

export type PlatformTransactionStepContext = {
    correlationId: string;
    capability: string;
    /** Results of steps that have already succeeded, keyed by step name. */
    applied: ReadonlyMap<string, unknown>;
};

export type PlatformTransactionStep = {
    /** Unique within the transaction; appears verbatim in the trace. */
    name: string;
    stage: PlatformTransactionStage;
    /** Defaults to `inside` — the safe default is "this is part of the operator's action". */
    boundary?: PlatformTransactionBoundary;
    run: (ctx: PlatformTransactionStepContext) => Promise<unknown> | unknown;
    /**
     * Undo this step's durable effect. Omit ONLY when the step writes nothing durable
     * (a read, a pure computation, an in-memory cache bust).
     */
    compensate?: (applied: unknown, ctx: PlatformTransactionStepContext) => Promise<void> | void;
    /**
     * Also attempt compensation when `run` itself threw — for steps that can leave a
     * partial write behind. `applied` is `undefined` in that case, so the compensation
     * must be able to locate what it undoes on its own.
     */
    compensateOnFailure?: boolean;
};

export type PlatformTransactionValidation = { ok: true } | { ok: false; message: string; code?: string };

export type PlatformTransactionOutcome =
    /** Everything inside the boundary succeeded. */
    | "committed"
    /** Committed, but a declared out-of-boundary effect failed. Reported, not hidden. */
    | "committed_degraded"
    /** Failed and fully rolled back. Nothing changed — provably. */
    | "aborted"
    /** Failed and rollback did NOT fully succeed. Durable state is uncertain. */
    | "partially_committed";

export type PlatformTransactionIntegrityBreach = {
    step: string;
    error: string;
    detail: string;
};

export type PlatformTransactionResult<T = undefined> = {
    outcome: PlatformTransactionOutcome;
    /** The operator's action succeeded (possibly with declared degradation). */
    ok: boolean;
    /** Did durable state change? `false` is only ever set when rollback is proven complete. */
    changed: boolean;
    correlation_id: string;
    capability: string;
    value?: T;
    /** Operator-facing explanation. Always present when `ok` is false or the result degraded. */
    message?: string;
    failed_step?: string;
    failed_stage?: PlatformTransactionStage;
    validation_code?: string;
    steps: PlatformTransactionStepTrace[];
    degraded: Array<{ step: string; error: string }>;
    duration_ms: number;
    /** Present only when a compensation failed. The platform cannot claim a clean abort. */
    integrity_breach?: PlatformTransactionIntegrityBreach;
    /** True when this call joined an already-running identical transaction instead of re-executing. */
    deduplicated?: boolean;
};

export type PlatformTransactionTrace = {
    capability: string;
    correlation_id: string;
    outcome: PlatformTransactionOutcome;
    changed: boolean;
    duration_ms: number;
    steps: PlatformTransactionStepTrace[];
    actor_user_id?: string | null;
    subject?: Record<string, string | null | undefined>;
    error?: string;
    integrity_breach?: PlatformTransactionIntegrityBreach;
};

export type RunPlatformTransactionInput<T = undefined> = {
    /** Capability key from the configured registry — e.g. "record_outcome", "schedule_tour". */
    capability: string;
    correlationId?: string | null;
    actorUserId?: string | null;
    subject?: Record<string, string | null | undefined>;
    /**
     * Suppresses duplicate execution: a second call with the same capability + key while the
     * first is still running joins that run instead of executing again.
     */
    idempotencyKey?: string | null;
    /** Runs before anything is written. A failure aborts with nothing applied. */
    validate?: () => Promise<PlatformTransactionValidation> | PlatformTransactionValidation;
    /** Declared in canonical stage order; out-of-order declaration is a contract violation. */
    steps: PlatformTransactionStep[] | (() => PlatformTransactionStep[]);
    /** Compose the committed value from the successful step results. */
    value?: (applied: ReadonlyMap<string, unknown>) => T;
    onTrace?: (trace: PlatformTransactionTrace) => void;
    /** Injectable clock so traces are deterministic under test. */
    now?: () => number;
};

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

/**
 * A transaction whose steps are declared out of canonical order is a programming error, not
 * a runtime condition — the whole point of the contract is that every capability runs the
 * same pipeline in the same order.
 */
function assertCanonicalStageOrder(capability: string, steps: PlatformTransactionStep[]): void {
    let highest = -1;
    const seen = new Set<string>();
    for (const step of steps) {
        const order = STAGE_ORDER.get(step.stage);
        if (order == null) {
            throw new Error(`platform transaction "${capability}": unknown stage "${step.stage}" on step "${step.name}"`);
        }
        if (order < highest) {
            throw new Error(
                `platform transaction "${capability}": step "${step.name}" declares stage "${step.stage}" after a later stage — steps must follow the canonical pipeline order`,
            );
        }
        if (seen.has(step.name)) {
            throw new Error(`platform transaction "${capability}": duplicate step name "${step.name}"`);
        }
        seen.add(step.name);
        highest = order;
    }
}

/** In-flight transactions, so a double-submit joins rather than executes twice. */
const inFlight = new Map<string, Promise<PlatformTransactionResult<unknown>>>();

export async function runPlatformTransaction<T = undefined>(
    input: RunPlatformTransactionInput<T>,
): Promise<PlatformTransactionResult<T>> {
    const key = input.idempotencyKey?.trim();
    if (!key) return executePlatformTransaction(input);

    const dedupeKey = `${input.capability}::${key}`;
    const existing = inFlight.get(dedupeKey);
    if (existing) {
        const joined = (await existing) as PlatformTransactionResult<T>;
        return { ...joined, deduplicated: true };
    }

    const pending = executePlatformTransaction(input) as Promise<PlatformTransactionResult<unknown>>;
    inFlight.set(dedupeKey, pending);
    try {
        return (await pending) as PlatformTransactionResult<T>;
    } finally {
        inFlight.delete(dedupeKey);
    }
}

async function executePlatformTransaction<T>(
    input: RunPlatformTransactionInput<T>,
): Promise<PlatformTransactionResult<T>> {
    const now = input.now ?? (() => Date.now());
    const startedAt = now();
    const correlationId = input.correlationId?.trim() || generateCorrelationId();
    const capability = input.capability;
    const steps = typeof input.steps === "function" ? input.steps() : input.steps;
    assertCanonicalStageOrder(capability, steps);

    const trace: PlatformTransactionStepTrace[] = [];
    const degraded: Array<{ step: string; error: string }> = [];
    const applied = new Map<string, unknown>();
    /** Successful steps that know how to undo themselves, in application order. */
    const undoStack: PlatformTransactionStep[] = [];

    const stepContext = (): PlatformTransactionStepContext => ({
        correlationId,
        capability,
        applied,
    });

    const finish = (result: PlatformTransactionResult<T>): PlatformTransactionResult<T> => {
        input.onTrace?.({
            capability,
            correlation_id: correlationId,
            outcome: result.outcome,
            changed: result.changed,
            duration_ms: result.duration_ms,
            steps: result.steps,
            actor_user_id: input.actorUserId ?? null,
            subject: input.subject,
            error: result.message,
            integrity_breach: result.integrity_breach,
        });
        return result;
    };

    // ── validate ─────────────────────────────────────────────────────────────────────
    if (input.validate) {
        const validateStartedAt = now();
        let validation: PlatformTransactionValidation;
        try {
            validation = await input.validate();
        } catch (error) {
            validation = { ok: false, message: errorMessage(error) };
        }
        if (!validation.ok) {
            trace.push({
                name: "validate",
                stage: "validate",
                boundary: "inside",
                status: "failed",
                duration_ms: now() - validateStartedAt,
                error: validation.message,
            });
            for (const step of steps) {
                trace.push({
                    name: step.name,
                    stage: step.stage,
                    boundary: step.boundary ?? "inside",
                    status: "skipped",
                    duration_ms: 0,
                });
            }
            return finish({
                outcome: "aborted",
                ok: false,
                // Nothing ran, so "nothing changed" is provable rather than assumed.
                changed: false,
                correlation_id: correlationId,
                capability,
                message: validation.message,
                failed_step: "validate",
                failed_stage: "validate",
                validation_code: validation.code,
                steps: trace,
                degraded,
                duration_ms: now() - startedAt,
            });
        }
        trace.push({
            name: "validate",
            stage: "validate",
            boundary: "inside",
            status: "ok",
            duration_ms: now() - validateStartedAt,
        });
    }

    // ── forward pass ─────────────────────────────────────────────────────────────────
    for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        const boundary = step.boundary ?? "inside";
        const stepStartedAt = now();
        try {
            const result = await step.run(stepContext());
            applied.set(step.name, result);
            if (step.compensate) undoStack.push(step);
            trace.push({
                name: step.name,
                stage: step.stage,
                boundary,
                status: "ok",
                duration_ms: now() - stepStartedAt,
            });
        } catch (error) {
            const message = errorMessage(error);

            if (boundary === "outside") {
                // Declared downstream effect. The operator's action already happened; saying
                // it failed would be a lie, and saying nothing would be a different lie.
                degraded.push({ step: step.name, error: message });
                trace.push({
                    name: step.name,
                    stage: step.stage,
                    boundary,
                    status: "degraded",
                    duration_ms: now() - stepStartedAt,
                    error: message,
                });
                continue;
            }

            trace.push({
                name: step.name,
                stage: step.stage,
                boundary,
                status: "failed",
                duration_ms: now() - stepStartedAt,
                error: message,
            });
            for (let rest = index + 1; rest < steps.length; rest += 1) {
                trace.push({
                    name: steps[rest].name,
                    stage: steps[rest].stage,
                    boundary: steps[rest].boundary ?? "inside",
                    status: "skipped",
                    duration_ms: 0,
                });
            }

            // The failing step may itself have written before it threw.
            if (step.compensate && step.compensateOnFailure) {
                undoStack.push(step);
                applied.set(step.name, undefined);
            }

            const breach = await compensate({
                undoStack,
                applied,
                trace,
                context: stepContext(),
                now,
            });

            return finish({
                outcome: breach ? "partially_committed" : "aborted",
                ok: false,
                // Only claim "nothing changed" when every compensation is proven to have run.
                changed: Boolean(breach),
                correlation_id: correlationId,
                capability,
                message:
                    breach ?
                        `${message} — rollback did not fully complete (${breach.step}: ${breach.error}). Durable state may have changed; verify before retrying.`
                    :   message,
                failed_step: step.name,
                failed_stage: step.stage,
                steps: trace,
                degraded,
                duration_ms: now() - startedAt,
                integrity_breach: breach ?? undefined,
            });
        }
    }

    const committedValue = input.value ? input.value(applied) : undefined;
    return finish({
        outcome: degraded.length ? "committed_degraded" : "committed",
        ok: true,
        changed: true,
        correlation_id: correlationId,
        capability,
        value: committedValue as T,
        message:
            degraded.length ?
                `Completed, but ${degraded.length} downstream effect${degraded.length === 1 ? "" : "s"} did not run: ${degraded
                    .map((entry) => `${entry.step} (${entry.error})`)
                    .join("; ")}`
            :   undefined,
        steps: trace,
        degraded,
        duration_ms: now() - startedAt,
    });
}

/**
 * Apply compensations in reverse application order. Returns the first breach if any
 * compensation failed — from that point the platform can no longer honestly claim the
 * abort was clean, so the breach is surfaced rather than logged and forgotten.
 */
async function compensate(params: {
    undoStack: PlatformTransactionStep[];
    applied: Map<string, unknown>;
    trace: PlatformTransactionStepTrace[];
    context: PlatformTransactionStepContext;
    now: () => number;
}): Promise<PlatformTransactionIntegrityBreach | null> {
    let breach: PlatformTransactionIntegrityBreach | null = null;

    for (let index = params.undoStack.length - 1; index >= 0; index -= 1) {
        const step = params.undoStack[index];
        if (!step.compensate) continue;
        const startedAt = params.now();
        try {
            await step.compensate(params.applied.get(step.name), params.context);
            params.trace.push({
                name: `${step.name}:compensate`,
                stage: step.stage,
                boundary: step.boundary ?? "inside",
                status: "compensated",
                duration_ms: params.now() - startedAt,
            });
        } catch (error) {
            const message = errorMessage(error);
            params.trace.push({
                name: `${step.name}:compensate`,
                stage: step.stage,
                boundary: step.boundary ?? "inside",
                status: "compensation_failed",
                duration_ms: params.now() - startedAt,
                error: message,
            });
            if (!breach) {
                breach = {
                    step: step.name,
                    error: message,
                    detail: `Compensation for "${step.name}" failed; its write may still be committed.`,
                };
            }
            // Keep unwinding: the remaining compensations are still worth attempting.
        }
    }

    return breach;
}
