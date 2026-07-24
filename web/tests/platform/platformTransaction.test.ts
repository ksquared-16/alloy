/**
 * Platform Transaction Contract — the guarantees every configured capability inherits.
 *
 * These are the operator-trust invariants, stated as tests: a transaction either commits
 * everything inside its boundary or provably changes nothing, it never reports a step as
 * applied that did not succeed, and when it CANNOT clean up it says so instead of claiming
 * a clean abort.
 */

import { describe, expect, it, vi } from "vitest";
import {
    PLATFORM_TRANSACTION_STAGES,
    runPlatformTransaction,
    type PlatformTransactionStep,
    type PlatformTransactionTrace,
} from "@/lib/platform/transaction/platformTransaction";

function stepTrace(result: { steps: Array<{ name: string; status: string }> }) {
    return result.steps.map((s) => `${s.name}:${s.status}`);
}

describe("platform transaction contract — commit path", () => {
    it("runs every stage in canonical order and commits", async () => {
        const order: string[] = [];
        const result = await runPlatformTransaction({
            capability: "demo",
            correlationId: "cid-1",
            validate: () => {
                order.push("validate");
                return { ok: true };
            },
            steps: PLATFORM_TRANSACTION_STAGES.filter((s) => s !== "validate").map((stage) => ({
                name: stage,
                stage,
                run: () => {
                    order.push(stage);
                    return `${stage}-done`;
                },
            })),
            value: (applied) => applied.get("persist") as string,
        });

        expect(result.outcome).toBe("committed");
        expect(result.ok).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.correlation_id).toBe("cid-1");
        expect(result.value).toBe("persist-done");
        expect(order).toEqual([
            "validate",
            "persist",
            "business_process",
            "activity",
            "relationships",
            "cache_invalidation",
            "recomposition",
        ]);
        expect(result.steps.every((s) => s.status === "ok")).toBe(true);
    });

    it("generates a correlation id when the caller has none", async () => {
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [{ name: "write", stage: "persist", run: () => "ok" }],
        });
        expect(result.correlation_id).toBeTruthy();
    });
});

describe("platform transaction contract — validation abort", () => {
    it("changes nothing and never runs a step when validation fails", async () => {
        const persist = vi.fn();
        const result = await runPlatformTransaction({
            capability: "demo",
            validate: () => ({ ok: false, message: "Slot is no longer available", code: "slot_taken" }),
            steps: [{ name: "write", stage: "persist", run: persist }],
        });

        expect(result.outcome).toBe("aborted");
        expect(result.ok).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.message).toBe("Slot is no longer available");
        expect(result.validation_code).toBe("slot_taken");
        expect(persist).not.toHaveBeenCalled();
        expect(stepTrace(result)).toEqual(["validate:failed", "write:skipped"]);
    });

    it("treats a thrown validator as a validation failure, not a crash", async () => {
        const result = await runPlatformTransaction({
            capability: "demo",
            validate: () => {
                throw new Error("availability service unreachable");
            },
            steps: [{ name: "write", stage: "persist", run: () => "x" }],
        });
        expect(result.outcome).toBe("aborted");
        expect(result.changed).toBe(false);
        expect(result.message).toBe("availability service unreachable");
    });
});

describe("platform transaction contract — rollback", () => {
    it("compensates applied steps in reverse order and proves nothing changed", async () => {
        const undone: string[] = [];
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [
                {
                    name: "insert_booking",
                    stage: "persist",
                    run: () => "booking-1",
                    compensate: (applied) => {
                        undone.push(`insert_booking:${String(applied)}`);
                    },
                },
                {
                    name: "advance_process",
                    stage: "business_process",
                    run: () => "moved",
                    compensate: () => {
                        undone.push("advance_process");
                    },
                },
                {
                    name: "emit_activity",
                    stage: "activity",
                    run: () => {
                        throw new Error("activity emit failed");
                    },
                },
            ],
        });

        expect(result.outcome).toBe("aborted");
        expect(result.changed).toBe(false);
        expect(result.failed_step).toBe("emit_activity");
        expect(result.failed_stage).toBe("activity");
        expect(result.message).toBe("activity emit failed");
        // Reverse order — the later write is undone before the earlier one.
        expect(undone).toEqual(["advance_process", "insert_booking:booking-1"]);
        expect(stepTrace(result)).toEqual([
            "insert_booking:ok",
            "advance_process:ok",
            "emit_activity:failed",
            "advance_process:compensate:compensated",
            "insert_booking:compensate:compensated",
        ]);
    });

    it("compensates the failing step too when it may have written before throwing", async () => {
        const undone: string[] = [];
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [
                {
                    name: "partial_write",
                    stage: "persist",
                    compensateOnFailure: true,
                    run: () => {
                        throw new Error("failed after writing one row");
                    },
                    compensate: () => {
                        undone.push("partial_write");
                    },
                },
            ],
        });
        expect(undone).toEqual(["partial_write"]);
        expect(result.changed).toBe(false);
        expect(result.outcome).toBe("aborted");
    });

    it("REFUSES to claim a clean abort when a compensation fails", async () => {
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [
                {
                    name: "insert_booking",
                    stage: "persist",
                    run: () => "booking-1",
                    compensate: () => {
                        throw new Error("delete denied");
                    },
                },
                {
                    name: "emit_activity",
                    stage: "activity",
                    run: () => {
                        throw new Error("activity emit failed");
                    },
                },
            ],
        });

        expect(result.outcome).toBe("partially_committed");
        expect(result.ok).toBe(false);
        // The whole point: the platform does NOT tell the operator nothing changed.
        expect(result.changed).toBe(true);
        expect(result.integrity_breach).toEqual({
            step: "insert_booking",
            error: "delete denied",
            detail: 'Compensation for "insert_booking" failed; its write may still be committed.',
        });
        expect(result.message).toContain("rollback did not fully complete");
        expect(stepTrace(result)).toContain("insert_booking:compensate:compensation_failed");
    });

    it("keeps unwinding after one compensation fails", async () => {
        const undone: string[] = [];
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [
                {
                    name: "first",
                    stage: "persist",
                    run: () => "a",
                    compensate: () => {
                        undone.push("first");
                    },
                },
                {
                    name: "second",
                    stage: "business_process",
                    run: () => "b",
                    compensate: () => {
                        throw new Error("cannot undo");
                    },
                },
                {
                    name: "third",
                    stage: "activity",
                    run: () => {
                        throw new Error("boom");
                    },
                },
            ],
        });
        expect(undone).toEqual(["first"]);
        expect(result.outcome).toBe("partially_committed");
        expect(result.integrity_breach?.step).toBe("second");
    });
});

describe("platform transaction contract — declared boundary", () => {
    it("commits with an honest degradation when an out-of-boundary effect fails", async () => {
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [
                { name: "insert_booking", stage: "persist", run: () => "booking-1" },
                {
                    name: "confirmation_email",
                    stage: "relationships",
                    boundary: "outside",
                    run: () => {
                        throw new Error("smtp timeout");
                    },
                },
            ],
        });

        expect(result.outcome).toBe("committed_degraded");
        expect(result.ok).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.degraded).toEqual([{ step: "confirmation_email", error: "smtp timeout" }]);
        expect(result.message).toContain("confirmation_email");
        expect(stepTrace(result)).toEqual(["insert_booking:ok", "confirmation_email:degraded"]);
    });

    it("does not roll back committed work when a downstream effect fails", async () => {
        const undone: string[] = [];
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [
                {
                    name: "insert_booking",
                    stage: "persist",
                    run: () => "booking-1",
                    compensate: () => {
                        undone.push("insert_booking");
                    },
                },
                {
                    name: "notify",
                    stage: "relationships",
                    boundary: "outside",
                    run: () => {
                        throw new Error("nope");
                    },
                },
            ],
        });
        expect(undone).toEqual([]);
        expect(result.ok).toBe(true);
    });
});

describe("platform transaction contract — no false 'applied'", () => {
    it("never marks a step ok when it threw, and marks the rest skipped", async () => {
        const result = await runPlatformTransaction({
            capability: "demo",
            steps: [
                { name: "one", stage: "persist", run: () => "ok" },
                {
                    name: "two",
                    stage: "business_process",
                    run: () => {
                        throw new Error("rule target missing");
                    },
                },
                { name: "three", stage: "activity", run: () => "never" },
            ],
        });
        expect(stepTrace(result)).toEqual(["one:ok", "two:failed", "three:skipped"]);
    });
});

describe("platform transaction contract — duplicate execution", () => {
    it("joins an in-flight identical transaction instead of executing twice", async () => {
        let executions = 0;
        let release: (() => void) | null = null;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        const run = () =>
            runPlatformTransaction({
                capability: "book_tour",
                idempotencyKey: "opportunity-1:2026-07-27T09:00",
                steps: [
                    {
                        name: "insert_booking",
                        stage: "persist",
                        run: async () => {
                            executions += 1;
                            await gate;
                            return "booking-1";
                        },
                    },
                ],
            });

        const first = run();
        const second = run();
        release?.();
        const [a, b] = await Promise.all([first, second]);

        expect(executions).toBe(1);
        expect(a.outcome).toBe("committed");
        expect(b.outcome).toBe("committed");
        expect(b.deduplicated).toBe(true);
        expect(a.correlation_id).toBe(b.correlation_id);
    });

    it("does not dedupe different subjects", async () => {
        let executions = 0;
        const run = (key: string) =>
            runPlatformTransaction({
                capability: "book_tour",
                idempotencyKey: key,
                steps: [
                    {
                        name: "insert",
                        stage: "persist",
                        run: () => {
                            executions += 1;
                            return "x";
                        },
                    },
                ],
            });
        await Promise.all([run("a"), run("b")]);
        expect(executions).toBe(2);
    });
});

describe("platform transaction contract — instrumentation", () => {
    it("emits one trace per transaction with per-step timing and correlation id", async () => {
        const traces: PlatformTransactionTrace[] = [];
        let clock = 1_000;
        await runPlatformTransaction({
            capability: "record_outcome",
            correlationId: "cid-42",
            actorUserId: "user-1",
            subject: { opportunity_id: "opp-1" },
            now: () => (clock += 5),
            onTrace: (t) => traces.push(t),
            steps: [
                { name: "close_work", stage: "persist", run: () => "closed" },
                { name: "apply_rules", stage: "business_process", run: () => "applied" },
            ],
        });

        expect(traces).toHaveLength(1);
        const trace = traces[0];
        expect(trace.capability).toBe("record_outcome");
        expect(trace.correlation_id).toBe("cid-42");
        expect(trace.actor_user_id).toBe("user-1");
        expect(trace.subject).toEqual({ opportunity_id: "opp-1" });
        expect(trace.outcome).toBe("committed");
        expect(trace.steps.map((s) => s.name)).toEqual(["close_work", "apply_rules"]);
        expect(trace.steps.every((s) => s.duration_ms > 0)).toBe(true);
        expect(trace.duration_ms).toBeGreaterThan(0);
    });

    it("emits a trace carrying the integrity breach on a failed rollback", async () => {
        const traces: PlatformTransactionTrace[] = [];
        await runPlatformTransaction({
            capability: "demo",
            onTrace: (t) => traces.push(t),
            steps: [
                {
                    name: "write",
                    stage: "persist",
                    run: () => "x",
                    compensate: () => {
                        throw new Error("undo failed");
                    },
                },
                {
                    name: "next",
                    stage: "activity",
                    run: () => {
                        throw new Error("boom");
                    },
                },
            ],
        });
        expect(traces[0].outcome).toBe("partially_committed");
        expect(traces[0].integrity_breach?.step).toBe("write");
        expect(traces[0].changed).toBe(true);
    });
});

describe("platform transaction contract — canonical pipeline is enforced", () => {
    it("rejects steps declared out of canonical stage order", async () => {
        const steps: PlatformTransactionStep[] = [
            { name: "activity", stage: "activity", run: () => "a" },
            { name: "persist", stage: "persist", run: () => "b" },
        ];
        await expect(runPlatformTransaction({ capability: "demo", steps })).rejects.toThrow(
            /must follow the canonical pipeline order/,
        );
    });

    it("rejects duplicate step names so the trace is never ambiguous", async () => {
        await expect(
            runPlatformTransaction({
                capability: "demo",
                steps: [
                    { name: "write", stage: "persist", run: () => "a" },
                    { name: "write", stage: "persist", run: () => "b" },
                ],
            }),
        ).rejects.toThrow(/duplicate step name/);
    });
});
